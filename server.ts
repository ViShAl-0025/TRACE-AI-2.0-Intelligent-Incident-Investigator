import 'dotenv/config';
import express from 'express';
import { createServer as createHttpServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import type {
  GeminiForensicAnalysis,
  GeminiMemoryComparisonSynthesis,
  Hypothesis,
  IncidentInvestigation,
  IncidentSimilarityComparison,
  SourceRecord,
} from './src/types/trace.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;;
const PRIMARY_GEMINI_MODEL = 'gemini-3.8-flash';
const DETERMINISTIC_ENGINE_MODEL = 'trace-deterministic-verifier-v2';
const MAX_GEMINI_ATTEMPTS = 3;
const DEFAULT_ATTEMPT_TIMEOUT_MS = 12000;
const BASE_BACKOFF_MS = 300;

export type SimulatedFailureType =
  | '503'
  | '502'
  | '500'
  | '429'
  | 'timeout'
  | 'network'
  | 'invalid_request'
  | 'auth_error';

export interface ClassifiedGeminiError {
  retryable: boolean;
  statusCode?: number;
  category:
    | 'RATE_LIMITED'
    | 'SERVER_OVERLOAD'
    | 'TIMEOUT'
    | 'NETWORK_ERROR'
    | 'INVALID_REQUEST'
    | 'AUTH_ERROR'
    | 'UNKNOWN_ERROR';
  cleanMessage: string;
}

export function isGeminiConfigured(): boolean {
  const key = process.env.GEMINI_API_KEY;
  return Boolean(key && key.trim() !== '' && key !== 'MY_GEMINI_API_KEY');
}

/**
 * Classifies errors from the Gemini SDK / HTTP transport into retryable vs non-retryable
 * categories with a clean human-readable diagnostic message.
 */
export function classifyGeminiError(err: unknown): ClassifiedGeminiError {
  const rawMessage =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
      ? err
      : JSON.stringify(err);

  const errObj = (err && typeof err === 'object' ? err : {}) as Record<
    string,
    unknown
  >;

  let statusCode: number | undefined =
    typeof errObj.status === 'number'
      ? errObj.status
      : typeof errObj.statusCode === 'number'
      ? errObj.statusCode
      : typeof errObj.httpStatus === 'number'
      ? errObj.httpStatus
      : undefined;

  if (!statusCode) {
    const codeMatch = rawMessage.match(
      /\b(400|401|403|404|408|429|500|502|503|504)\b/
    );
    if (codeMatch) {
      statusCode = Number(codeMatch[1]);
    }
  }

  // Extract concise message if rawMessage contains a serialized JSON error object
  let conciseDetail = rawMessage;
  try {
    const jsonStart = rawMessage.indexOf('{');
    if (jsonStart !== -1) {
      const parsedErr = JSON.parse(rawMessage.slice(jsonStart));
      if (parsedErr?.error?.message) {
        conciseDetail = parsedErr.error.message;
        if (!statusCode && typeof parsedErr.error.code === 'number') {
          statusCode = parsedErr.error.code;
        }
      }
    }
  } catch {
    // Keep original message if not valid JSON
  }

  const lower = rawMessage.toLowerCase();
  const errCode = typeof errObj.code === 'string' ? errObj.code : '';

  // 1. Timeout detection (Retryable)
  if (
    errCode === 'REQUEST_TIMEOUT' ||
    errCode === 'ETIMEDOUT' ||
    lower.includes('timed out') ||
    lower.includes('timeout') ||
    lower.includes('aborterror')
  ) {
    return {
      retryable: true,
      statusCode: statusCode || 504,
      category: 'TIMEOUT',
      cleanMessage: `Upstream Gemini request timed out (${conciseDetail}).`,
    };
  }

  // 2. Network / Socket errors (Retryable)
  if (
    errCode === 'ECONNRESET' ||
    errCode === 'ECONNREFUSED' ||
    errCode === 'ENOTFOUND' ||
    errCode === 'EAI_AGAIN' ||
    lower.includes('fetch failed') ||
    lower.includes('network error') ||
    lower.includes('socket hang up') ||
    lower.includes('econnreset')
  ) {
    return {
      retryable: true,
      statusCode: statusCode || 503,
      category: 'NETWORK_ERROR',
      cleanMessage: `Transient network failure communicating with Gemini API (${conciseDetail}).`,
    };
  }

  // 3. HTTP 429 Rate Limit / Quota Exhausted (Retryable)
  if (
    statusCode === 429 ||
    lower.includes('resource_exhausted') ||
    lower.includes('rate limit') ||
    lower.includes('too many requests')
  ) {
    return {
      retryable: true,
      statusCode: 429,
      category: 'RATE_LIMITED',
      cleanMessage: `HTTP 429 Too Many Requests / Rate Limit Exceeded: ${conciseDetail}`,
    };
  }

  // 4. HTTP 500, 502, 503, 504 Server / Overload errors (Retryable)
  if (
    statusCode === 500 ||
    statusCode === 502 ||
    statusCode === 503 ||
    statusCode === 504 ||
    lower.includes('unavailable') ||
    lower.includes('high demand') ||
    lower.includes('overloaded') ||
    lower.includes('internal error')
  ) {
    const code = statusCode || 503;
    return {
      retryable: true,
      statusCode: code,
      category: 'SERVER_OVERLOAD',
      cleanMessage: `HTTP ${code} Upstream Service Unavailable: ${conciseDetail}`,
    };
  }

  // 5. HTTP 401 / 403 Authentication & Permission errors (Non-Retryable)
  if (
    statusCode === 401 ||
    statusCode === 403 ||
    lower.includes('api_key_invalid') ||
    lower.includes('permission_denied') ||
    lower.includes('unauthenticated') ||
    lower.includes('unauthorized')
  ) {
    const code = statusCode || 401;
    return {
      retryable: false,
      statusCode: code,
      category: 'AUTH_ERROR',
      cleanMessage: `HTTP ${code} Authentication/Permission Error (non-retryable): ${conciseDetail}`,
    };
  }

  // 6. HTTP 400 / 404 Invalid Request or Model Not Found (Non-Retryable)
  if (
    statusCode === 400 ||
    statusCode === 404 ||
    lower.includes('invalid_argument') ||
    lower.includes('bad request')
  ) {
    const code = statusCode || 400;
    return {
      retryable: false,
      statusCode: code,
      category: 'INVALID_REQUEST',
      cleanMessage: `HTTP ${code} Invalid Request Error (non-retryable): ${conciseDetail}`,
    };
  }

  // Default: Non-retryable unknown error
  return {
    retryable: false,
    statusCode,
    category: 'UNKNOWN_ERROR',
    cleanMessage: conciseDetail || 'Unexpected upstream error during Gemini analysis.',
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const timeoutErr = new Error(
        `Gemini API request exceeded ${timeoutMs}ms deadline`
      ) as Error & { code?: string; status?: number };
      timeoutErr.code = 'REQUEST_TIMEOUT';
      timeoutErr.status = 504;
      reject(timeoutErr);
    }, timeoutMs);

    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Strips any ungrounded record ID tokens matching DEP-/LOG-/MET-/TCK-/EVT-/WIF-
 * from free-text statements if the ID does not exist in validRecordIds.
 */
function sanitizeFreeTextCitations(
  text: string,
  validRecordIds: Set<string>,
  ungroundedRemoved: string[]
): string {
  if (!text) return '';
  return text.replace(
    /\b(?:DEP|LOG|MET|TCK|EVT|WIF)-[A-Z0-9-]+\b/g,
    (matchedId) => {
      if (validRecordIds.has(matchedId)) {
        return matchedId;
      }
      if (!ungroundedRemoved.includes(matchedId)) {
        ungroundedRemoved.push(matchedId);
      }
      return '[UNGROUNDED-ID-REMOVED]';
    }
  );
}

function buildUnknownsAndGaps(
  hypotheses: Hypothesis[],
  validRecordIds: Set<string>
): NonNullable<GeminiForensicAnalysis['unknownsAndGaps']> {
  return hypotheses.flatMap((h: Hypothesis) =>
    (h.missingInformation || []).map((m) => {
      const validResolvedId =
        m.resolvedByRecordId && validRecordIds.has(m.resolvedByRecordId)
          ? m.resolvedByRecordId
          : undefined;
      return {
        id: m.id,
        hypothesisId: h.id,
        targetService: m.targetService,
        description: m.description,
        status: (validResolvedId ? 'RESOLVED' : 'UNRESOLVED') as
          | 'RESOLVED'
          | 'UNRESOLVED',
        resolvedByRecordId: validResolvedId,
      };
    })
  );
}

export function buildDeterministicFallbackAnalysis(
  incident: IncidentInvestigation,
  options?: {
    requestStatus?: string;
    httpStatusCode?: number;
    attempts?: number;
    retried?: boolean;
    errorMessage?: string | null;
  }
): GeminiForensicAnalysis {
  const records: SourceRecord[] = Array.isArray(incident?.records)
    ? incident.records
    : [];
  const hypotheses: Hypothesis[] = Array.isArray(incident?.hypotheses)
    ? incident.hypotheses
    : [];
  const validIds = new Set<string>(records.map((r: SourceRecord) => r.id));

  const sortedHyps = [...hypotheses].sort(
    (a, b) => (b.plausibilityScore || 0) - (a.plausibilityScore || 0)
  );
  const leading = sortedHyps[0];
  const secondary = sortedHyps[1];

  const firstThreeIds = records.slice(0, 3).map((r: SourceRecord) => r.id);
  const ungroundedRemoved: string[] = [];

  const leadingSupIds = (leading?.supportingEvidence || [])
    .map((s) => s.recordId)
    .filter((id) => {
      if (validIds.has(id)) return true;
      ungroundedRemoved.push(id);
      return false;
    });

  const rawSynthesis = leading
    ? `Deterministic synthesis for ${incident.id}: Leading hypothesis ${leading.id} (${leading.title}) holds ${leading.plausibilityScore}% plausibility based on ${
        leadingSupIds.length
      } grounded supporting records (${
        leadingSupIds.join(', ') || 'none'
      }). ${
        secondary
          ? `Competing hypothesis ${secondary.id} (${secondary.plausibilityScore}%) remains an active co-factor with ${
              (secondary.contradictoryEvidence || []).filter((c) =>
                validIds.has(c.recordId)
              ).length
            } contradictory record(s) and ${
              (secondary.missingInformation || []).filter(
                (m) => !m.resolvedByRecordId
              ).length
            } unresolved unknown(s) pending falsification testing.`
          : ''
      }`
    : `Deterministic synthesis completed across ${records.length} grounded records (${firstThreeIds.join(', ')}).`;

  return {
    generatedAt: new Date().toISOString(),
    mode: 'deterministic-fallback',
    executionLabel: 'DETERMINISTIC FALLBACK',
    modelUsed: DETERMINISTIC_ENGINE_MODEL,
    requestedModel: PRIMARY_GEMINI_MODEL,
    requestStatus:
      options?.requestStatus ||
      'FALLBACK SERVED · Deterministic Local Forensic Engine',
    httpStatusCode: options?.httpStatusCode,
    attempts: options?.attempts ?? 0,
    retried: options?.retried ?? false,
    errorMessage: options?.errorMessage ?? null,
    executiveSynthesis: sanitizeFreeTextCitations(
      rawSynthesis,
      validIds,
      ungroundedRemoved
    ),
    groundedFacts: records.slice(0, 5).map((r: SourceRecord) => ({
      statement: sanitizeFreeTextCitations(
        `${r.service} (${r.type.toUpperCase()}) at ${r.timestamp}: ${r.summary}`,
        validIds,
        ungroundedRemoved
      ),
      citedRecordIds: [r.id].filter((id) => validIds.has(id)),
    })),
    hypothesisCritique: hypotheses.map((h: Hypothesis) => {
      const supIds = (h.supportingEvidence || [])
        .map((s) => s.recordId)
        .filter((id) => {
          if (validIds.has(id)) return true;
          if (!ungroundedRemoved.includes(id)) ungroundedRemoved.push(id);
          return false;
        });
      const conIds = (h.contradictoryEvidence || [])
        .map((c) => c.recordId)
        .filter((id) => {
          if (validIds.has(id)) return true;
          if (!ungroundedRemoved.includes(id)) ungroundedRemoved.push(id);
          return false;
        });

      return {
        hypothesisId: h.id,
        assessment: sanitizeFreeTextCitations(
          `Supported by ${supIds.join(', ') || 'none'} (${
            h.plausibilityScore
          }% plausibility). ${
            conIds.length
              ? `Contradicted/challenged by ${conIds.join(', ')}.`
              : 'No active contradictory records in store.'
          }`,
          validIds,
          ungroundedRemoved
        ),
        keyUncertainty: sanitizeFreeTextCitations(
          h.missingInformation?.find((m) => !m.resolvedByRecordId)
            ?.description ||
            h.confidenceLimitations?.[0] ||
            'Requires falsification protocol execution.',
          validIds,
          ungroundedRemoved
        ),
        citedRecordIds: Array.from(new Set([...supIds, ...conIds])),
        supportingRecordIds: supIds,
        contradictoryRecordIds: conIds,
      };
    }),
    unknownsAndGaps: buildUnknownsAndGaps(hypotheses, validIds),
    recommendedNextSteps: hypotheses.map((h: Hypothesis, idx: number) => {
      const candidateId = h.supportingEvidence?.[0]?.recordId || '';
      const validRationaleId = validIds.has(candidateId)
        ? candidateId
        : records[0]?.id || '';
      return {
        priority: idx === 0 ? 'IMMEDIATE' : 'NEXT',
        action: sanitizeFreeTextCitations(
          h.falsificationTest?.testAction || 'Execute falsification test.',
          validIds,
          ungroundedRemoved
        ),
        rationaleRecordId: validRationaleId,
      };
    }),
    ungroundedCitationsRemoved: ungroundedRemoved,
  };
}

interface RawGeminiFact {
  statement?: string;
  citedRecordIds?: string[];
}

interface RawGeminiCritique {
  hypothesisId?: string;
  assessment?: string;
  keyUncertainty?: string;
  citedRecordIds?: string[];
}

interface RawGeminiStep {
  priority?: string;
  action?: string;
  rationaleRecordId?: string;
}

function createSimulatedError(simType: SimulatedFailureType): Error {
  if (simType === '503') {
    const err = new Error(
      '{"error":{"code":503,"message":"This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.","status":"UNAVAILABLE"}}'
    ) as Error & { status?: number };
    err.status = 503;
    return err;
  }
  if (simType === '502') {
    const err = new Error('HTTP 502 Bad Gateway from upstream proxy') as Error & {
      status?: number;
    };
    err.status = 502;
    return err;
  }
  if (simType === '500') {
    const err = new Error('HTTP 500 Internal Server Error') as Error & {
      status?: number;
    };
    err.status = 500;
    return err;
  }
  if (simType === '429') {
    const err = new Error(
      '{"error":{"code":429,"message":"Resource has been exhausted (e.g. check quota or rate limit).","status":"RESOURCE_EXHAUSTED"}}'
    ) as Error & { status?: number };
    err.status = 429;
    return err;
  }
  if (simType === 'network') {
    const err = new Error(
      'fetch failed: Socket connection reset by peer (ECONNRESET)'
    ) as Error & { code?: string };
    err.code = 'ECONNRESET';
    return err;
  }
  if (simType === 'auth_error') {
    const err = new Error(
      '{"error":{"code":401,"message":"API key not valid. Please pass a valid API key.","status":"UNAUTHENTICATED"}}'
    ) as Error & { status?: number };
    err.status = 401;
    return err;
  }
  if (simType === 'invalid_request') {
    const err = new Error(
      '{"error":{"code":400,"message":"Invalid argument: schema payload rejected by model.","status":"INVALID_ARGUMENT"}}'
    ) as Error & { status?: number };
    err.status = 400;
    return err;
  }
  // timeout handled via promise delay
  const err = new Error('Simulated timeout') as Error & {
    code?: string;
    status?: number;
  };
  err.code = 'REQUEST_TIMEOUT';
  err.status = 504;
  return err;
}

export async function analyzeIncidentWithResilience(
  incident: IncidentInvestigation,
  options?: {
    simulateFailure?: SimulatedFailureType;
    attemptTimeoutMs?: number;
    baseBackoffMs?: number;
  }
): Promise<{
  analysis: GeminiForensicAnalysis;
  notice?: string;
}> {
  const validRecordIds = new Set<string>(
    (incident.records || []).map((r: SourceRecord) => r.id)
  );

  // If GEMINI_API_KEY is not configured and no simulation is requested, return immediate fallback
  if (!isGeminiConfigured() && !options?.simulateFailure) {
    const fallback = buildDeterministicFallbackAnalysis(incident, {
      requestStatus: 'FALLBACK SERVED · GEMINI_API_KEY Not Configured',
      attempts: 0,
      retried: false,
      errorMessage:
        'GEMINI_API_KEY is not configured on the server. Served verified deterministic fallback analysis.',
    });
    return {
      analysis: fallback,
      notice:
        'DETERMINISTIC FALLBACK: GEMINI_API_KEY is not configured. Served verified local deterministic synthesis.',
    };
  }

  const attemptTimeoutMs =
    options?.attemptTimeoutMs ?? DEFAULT_ATTEMPT_TIMEOUT_MS;
  const baseBackoffMs = options?.baseBackoffMs ?? BASE_BACKOFF_MS;

  let attempts = 0;
  let lastClassifiedError: ClassifiedGeminiError | null = null;

  const promptPayload = {
    incidentId: incident.id,
    title: incident.title,
    summary: incident.summary,
    allowedRecordIds: Array.from(validRecordIds),
    records: incident.records.map((r: SourceRecord) => ({
      id: r.id,
      timestamp: r.timestamp,
      type: r.type,
      service: r.service,
      summary: r.summary,
      origin: r.sourceOrigin,
    })),
    hypotheses: incident.hypotheses.map((h: Hypothesis) => ({
      id: h.id,
      title: h.title,
      plausibilityScore: h.plausibilityScore,
      supportingIds: h.supportingEvidence
        .map((s) => s.recordId)
        .filter((id) => validRecordIds.has(id)),
      contradictoryIds: h.contradictoryEvidence
        .map((c) => c.recordId)
        .filter((id) => validRecordIds.has(id)),
      missingInformation: h.missingInformation.map((m) => m.description),
      falsificationTest: h.falsificationTest.testAction,
    })),
  };

  for (let attempt = 1; attempt <= MAX_GEMINI_ATTEMPTS; attempt++) {
    attempts = attempt;
    try {
      const rawText = await withTimeout(
        (async () => {
          if (options?.simulateFailure) {
            if (options.simulateFailure === 'timeout') {
              await sleep(attemptTimeoutMs + 150);
            }
            throw createSimulatedError(options.simulateFailure);
          }

          const ai = new GoogleGenAI({
            apiKey: process.env.GEMINI_API_KEY,
            httpOptions: {
              headers: {
                'User-Agent': 'aistudio-build',
              },
            },
          });

          const response = await ai.models.generateContent({
            model: PRIMARY_GEMINI_MODEL,
            contents: JSON.stringify(promptPayload),
            config: {
              systemInstruction:
                'You are the TRACE AI 2.0 Forensic Incident Investigator. ' +
                'CRITICAL RULES: ' +
                '1. Ground every fact strictly in the provided records. ' +
                '2. Every cited record ID MUST exist in allowedRecordIds. NEVER invent or hallucinate record IDs. ' +
                '3. Explicitly highlight uncertainty, contradictory evidence, missing evidence, and competing explanations. ' +
                '4. Return valid JSON matching the schema.',
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  executiveSynthesis: {
                    type: Type.STRING,
                    description:
                      'Concise forensic synthesis citing existing record IDs.',
                  },
                  groundedFacts: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        statement: { type: Type.STRING },
                        citedRecordIds: {
                          type: Type.ARRAY,
                          items: { type: Type.STRING },
                        },
                      },
                      required: ['statement', 'citedRecordIds'],
                    },
                  },
                  hypothesisCritique: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        hypothesisId: { type: Type.STRING },
                        assessment: { type: Type.STRING },
                        keyUncertainty: { type: Type.STRING },
                        citedRecordIds: {
                          type: Type.ARRAY,
                          items: { type: Type.STRING },
                        },
                      },
                      required: [
                        'hypothesisId',
                        'assessment',
                        'keyUncertainty',
                        'citedRecordIds',
                      ],
                    },
                  },
                  recommendedNextSteps: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        priority: { type: Type.STRING },
                        action: { type: Type.STRING },
                        rationaleRecordId: { type: Type.STRING },
                      },
                      required: ['priority', 'action', 'rationaleRecordId'],
                    },
                  },
                },
                required: [
                  'executiveSynthesis',
                  'groundedFacts',
                  'hypothesisCritique',
                  'recommendedNextSteps',
                ],
              },
            },
          });

          return response.text || '{}';
        })(),
        attemptTimeoutMs
      );

      const parsed = JSON.parse(rawText);

      // Deterministic post-processing guard: validate every cited ID against validRecordIds
      const ungroundedRemoved: string[] = [];

      const cleanExecutiveSynthesis = sanitizeFreeTextCitations(
        parsed.executiveSynthesis || '',
        validRecordIds,
        ungroundedRemoved
      );

      const groundedFacts = (
        (parsed.groundedFacts || []) as RawGeminiFact[]
      ).map((f: RawGeminiFact) => {
        const cleanIds: string[] = [];
        for (const id of f.citedRecordIds || []) {
          if (validRecordIds.has(id)) {
            if (!cleanIds.includes(id)) cleanIds.push(id);
          } else if (!ungroundedRemoved.includes(id)) {
            ungroundedRemoved.push(id);
          }
        }
        return {
          statement: sanitizeFreeTextCitations(
            f.statement || '',
            validRecordIds,
            ungroundedRemoved
          ),
          citedRecordIds: cleanIds,
        };
      });

      const hypothesisCritique = (
        (parsed.hypothesisCritique || []) as RawGeminiCritique[]
      ).map((c: RawGeminiCritique) => {
        const cleanIds: string[] = [];
        for (const id of c.citedRecordIds || []) {
          if (validRecordIds.has(id)) {
            if (!cleanIds.includes(id)) cleanIds.push(id);
          } else if (!ungroundedRemoved.includes(id)) {
            ungroundedRemoved.push(id);
          }
        }
        const matchedHyp = incident.hypotheses.find(
          (h) => h.id === c.hypothesisId
        );
        const supIds = (matchedHyp?.supportingEvidence || [])
          .map((s) => s.recordId)
          .filter((id) => validRecordIds.has(id));
        const conIds = (matchedHyp?.contradictoryEvidence || [])
          .map((con) => con.recordId)
          .filter((id) => validRecordIds.has(id));

        return {
          hypothesisId: c.hypothesisId || '',
          assessment: sanitizeFreeTextCitations(
            c.assessment || '',
            validRecordIds,
            ungroundedRemoved
          ),
          keyUncertainty: sanitizeFreeTextCitations(
            c.keyUncertainty || '',
            validRecordIds,
            ungroundedRemoved
          ),
          citedRecordIds: Array.from(
            new Set([...cleanIds, ...supIds, ...conIds])
          ),
          supportingRecordIds: supIds,
          contradictoryRecordIds: conIds,
        };
      });

      const recommendedNextSteps = (
        (parsed.recommendedNextSteps || []) as RawGeminiStep[]
      ).map((s: RawGeminiStep) => {
        let validRationaleId = '';
        if (s.rationaleRecordId && validRecordIds.has(s.rationaleRecordId)) {
          validRationaleId = s.rationaleRecordId;
        } else {
          if (
            s.rationaleRecordId &&
            !ungroundedRemoved.includes(s.rationaleRecordId)
          ) {
            ungroundedRemoved.push(s.rationaleRecordId);
          }
          validRationaleId = Array.from(validRecordIds)[0] || '';
        }
        return {
          priority: (s.priority === 'IMMEDIATE' || s.priority === 'NEXT'
            ? s.priority
            : 'FOLLOW_UP') as 'IMMEDIATE' | 'NEXT' | 'FOLLOW_UP',
          action: sanitizeFreeTextCitations(
            s.action || '',
            validRecordIds,
            ungroundedRemoved
          ),
          rationaleRecordId: validRationaleId,
        };
      });

      return {
        analysis: {
          generatedAt: new Date().toISOString(),
          mode: 'gemini-live',
          executionLabel: 'LIVE GEMINI',
          modelUsed: PRIMARY_GEMINI_MODEL,
          requestedModel: PRIMARY_GEMINI_MODEL,
          requestStatus: `HTTP 200 OK · Live Gemini API (Attempt ${attempts}/${MAX_GEMINI_ATTEMPTS})`,
          httpStatusCode: 200,
          attempts,
          retried: attempts > 1,
          errorMessage: null,
          executiveSynthesis: cleanExecutiveSynthesis,
          groundedFacts,
          hypothesisCritique,
          unknownsAndGaps: buildUnknownsAndGaps(
            incident.hypotheses || [],
            validRecordIds
          ),
          recommendedNextSteps,
          ungroundedCitationsRemoved: ungroundedRemoved,
        },
      };
    } catch (err: unknown) {
      const classified = classifyGeminiError(err);
      lastClassifiedError = classified;

      // Only retry if the failure is transient/retryable and we have attempts remaining
      if (classified.retryable && attempt < MAX_GEMINI_ATTEMPTS) {
        const jitter = Math.floor(Math.random() * 100);
        const delayMs = baseBackoffMs * Math.pow(2, attempt - 1) + jitter;
        await sleep(delayMs);
        continue;
      }
      break;
    }
  }

  // Fallback path when live Gemini fails after bounded retries or non-retryable failure
  const statusCode = lastClassifiedError?.statusCode || 503;
  const errorMsg =
    lastClassifiedError?.cleanMessage ||
    'Live Gemini API unavailable; served deterministic fallback.';
  const retrySummary =
    attempts > 1
      ? `Retried ${attempts}/${MAX_GEMINI_ATTEMPTS} attempts with backoff`
      : `Stopped after 1 attempt (non-retryable ${
          lastClassifiedError?.category || 'error'
        })`;

  const requestStatus = `FALLBACK SERVED · ${
    lastClassifiedError?.category || 'UPSTREAM_ERROR'
  } (HTTP ${statusCode} · ${retrySummary})`;

  const fallback = buildDeterministicFallbackAnalysis(incident, {
    requestStatus,
    httpStatusCode: statusCode,
    attempts,
    retried: attempts > 1,
    errorMessage: errorMsg,
  });

  return {
    analysis: fallback,
    notice: `DETERMINISTIC FALLBACK (${requestStatus}): ${errorMsg}`,
  };
}

export function buildDeterministicMemoryFallback(
  currentIncident: IncidentInvestigation,
  historicalIncident: IncidentInvestigation,
  comparison: IncidentSimilarityComparison,
  options?: {
    requestStatus?: string;
    httpStatusCode?: number;
    attempts?: number;
    retried?: boolean;
    errorMessage?: string | null;
  }
): GeminiMemoryComparisonSynthesis {
  const validRecordIds = new Set<string>([
    ...(currentIncident.records || []).map((r) => r.id),
    ...(historicalIncident.records || []).map((r) => r.id),
  ]);
  const ungroundedRemoved: string[] = [];

  return {
    generatedAt: new Date().toISOString(),
    mode: 'deterministic-fallback',
    executionLabel: 'DETERMINISTIC FALLBACK',
    modelUsed: DETERMINISTIC_ENGINE_MODEL,
    requestedModel: PRIMARY_GEMINI_MODEL,
    requestStatus:
      options?.requestStatus ||
      'FALLBACK SERVED · Deterministic Pattern Detective Engine',
    httpStatusCode: options?.httpStatusCode,
    attempts: options?.attempts ?? 0,
    retried: options?.retried ?? false,
    errorMessage: options?.errorMessage ?? null,
    currentIncidentId: currentIncident.id,
    historicalIncidentId: historicalIncident.id,
    executiveComparison: sanitizeFreeTextCitations(
      `Deterministic comparison (${comparison.overallMatchScore}% structural telemetry similarity · ${comparison.classification}): Comparing active investigation ${currentIncident.id} against stored investigation ${historicalIncident.id}. ${
        comparison.sharedEvidence.length > 0
          ? `Found ${comparison.sharedEvidence.length} shared technical evidence pattern(s), but ${comparison.conflictingAndDivergentEvidence.length} divergent/conflicting signal(s) require falsification testing before applying historical remediation.`
          : 'Minimal technical signature overlap detected between these two investigations.'
      }`,
      validRecordIds,
      ungroundedRemoved
    ),
    keySimilarities: comparison.sharedEvidence.map((se) => ({
      statement: sanitizeFreeTextCitations(
        `${se.category}: ${se.description}`,
        validRecordIds,
        ungroundedRemoved
      ),
      citedRecordIds: [...se.currentRecordIds, ...se.historicalRecordIds].filter(
        (id) => validRecordIds.has(id)
      ),
    })),
    criticalDifferencesAndConflicts:
      comparison.conflictingAndDivergentEvidence.map((ce) => ({
        statement: sanitizeFreeTextCitations(
          `${ce.category}: ${ce.description} (${ce.epistemicImpact})`,
          validRecordIds,
          ungroundedRemoved
        ),
        citedRecordIds: [
          ...ce.currentRecordIds,
          ...ce.historicalRecordIds,
        ].filter((id) => validRecordIds.has(id)),
      })),
    recommendedVerificationSteps: comparison.verificationRecommendations.map(
      (vr) => ({
        action: sanitizeFreeTextCitations(
          `[${vr.priority}] ${vr.action}`,
          validRecordIds,
          ungroundedRemoved
        ),
        citedRecordIds: vr.citedRecordIds.filter((id) =>
          validRecordIds.has(id)
        ),
      })
    ),
    epistemicCaveat:
      'Match score reflects weighted telemetry overlap across services, error signatures, deployment triggers, and graph topology — NOT the probability that the historical root cause is true for the current incident.',
    ungroundedCitationsRemoved: ungroundedRemoved,
  };
}

export async function analyzeMemoryComparisonWithResilience(
  currentIncident: IncidentInvestigation,
  historicalIncident: IncidentInvestigation,
  comparison: IncidentSimilarityComparison,
  options?: {
    simulateFailure?: SimulatedFailureType;
    attemptTimeoutMs?: number;
    baseBackoffMs?: number;
    mockRawResponse?: Record<string, unknown>;
  }
): Promise<{
  synthesis: GeminiMemoryComparisonSynthesis;
  notice?: string;
}> {
  const validRecordIds = new Set<string>([
    ...(currentIncident.records || []).map((r) => r.id),
    ...(historicalIncident.records || []).map((r) => r.id),
  ]);

  if (
    !isGeminiConfigured() &&
    !options?.simulateFailure &&
    !options?.mockRawResponse
  ) {
    const fallback = buildDeterministicMemoryFallback(
      currentIncident,
      historicalIncident,
      comparison,
      {
        requestStatus: 'FALLBACK SERVED · GEMINI_API_KEY Not Configured',
        attempts: 0,
        retried: false,
        errorMessage:
          'GEMINI_API_KEY is not configured on the server. Served verified deterministic comparison synthesis.',
      }
    );
    return {
      synthesis: fallback,
      notice:
        'DETERMINISTIC FALLBACK: GEMINI_API_KEY is not configured. Served verified local comparison synthesis.',
    };
  }

  const attemptTimeoutMs =
    options?.attemptTimeoutMs ?? DEFAULT_ATTEMPT_TIMEOUT_MS;
  const baseBackoffMs = options?.baseBackoffMs ?? BASE_BACKOFF_MS;
  let attempts = 0;
  let lastClassifiedError: ClassifiedGeminiError | null = null;

  const promptPayload = {
    allowedRecordIds: Array.from(validRecordIds),
    currentIncident: {
      id: currentIncident.id,
      title: currentIncident.title,
      records: currentIncident.records.map((r) => ({
        id: r.id,
        service: r.service,
        type: r.type,
        severity: r.severity,
        summary: r.summary,
      })),
    },
    historicalIncident: {
      id: historicalIncident.id,
      title: historicalIncident.title,
      status: historicalIncident.status,
      historicalResolution: historicalIncident.historicalResolution,
      records: historicalIncident.records.map((r) => ({
        id: r.id,
        service: r.service,
        type: r.type,
        severity: r.severity,
        summary: r.summary,
      })),
    },
    deterministicComparison: {
      overallMatchScore: comparison.overallMatchScore,
      classification: comparison.classification,
      sharedEvidence: comparison.sharedEvidence,
      conflictingAndDivergentEvidence:
        comparison.conflictingAndDivergentEvidence,
      missingInCurrentIncident: comparison.missingInCurrentIncident,
    },
  };

  for (let attempt = 1; attempt <= MAX_GEMINI_ATTEMPTS; attempt++) {
    attempts = attempt;
    try {
      const rawText = await withTimeout(
        (async () => {
          if (options?.mockRawResponse) {
            return JSON.stringify(options.mockRawResponse);
          }
          if (options?.simulateFailure) {
            if (options.simulateFailure === 'timeout') {
              await sleep(attemptTimeoutMs + 150);
            }
            throw createSimulatedError(options.simulateFailure);
          }

          const ai = new GoogleGenAI({
            apiKey: process.env.GEMINI_API_KEY,
            httpOptions: {
              headers: {
                'User-Agent': 'aistudio-build',
              },
            },
          });

          const response = await ai.models.generateContent({
            model: PRIMARY_GEMINI_MODEL,
            contents: JSON.stringify(promptPayload),
            config: {
              systemInstruction:
                'You are the TRACE AI 2.0 Incident Memory & Pattern Detective. ' +
                'Compare the current incident with the historical incident using ONLY the provided records. ' +
                'Every cited record ID MUST exist in allowedRecordIds. Never invent record IDs. ' +
                'Explain both similarities and critical differences/conflicts, and remind the user that similarity is not proof of causation.',
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  executiveComparison: { type: Type.STRING },
                  keySimilarities: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        statement: { type: Type.STRING },
                        citedRecordIds: {
                          type: Type.ARRAY,
                          items: { type: Type.STRING },
                        },
                      },
                      required: ['statement', 'citedRecordIds'],
                    },
                  },
                  criticalDifferencesAndConflicts: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        statement: { type: Type.STRING },
                        citedRecordIds: {
                          type: Type.ARRAY,
                          items: { type: Type.STRING },
                        },
                      },
                      required: ['statement', 'citedRecordIds'],
                    },
                  },
                  recommendedVerificationSteps: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        action: { type: Type.STRING },
                        citedRecordIds: {
                          type: Type.ARRAY,
                          items: { type: Type.STRING },
                        },
                      },
                      required: ['action', 'citedRecordIds'],
                    },
                  },
                  epistemicCaveat: { type: Type.STRING },
                },
                required: [
                  'executiveComparison',
                  'keySimilarities',
                  'criticalDifferencesAndConflicts',
                  'recommendedVerificationSteps',
                  'epistemicCaveat',
                ],
              },
            },
          });

          return response.text || '{}';
        })(),
        attemptTimeoutMs
      );

      const parsed = JSON.parse(rawText);
      const ungroundedRemoved: string[] = [];

      const filterIds = (ids: unknown): string[] => {
        if (!Array.isArray(ids)) return [];
        const clean: string[] = [];
        for (const id of ids) {
          if (typeof id !== 'string') continue;
          if (validRecordIds.has(id)) {
            if (!clean.includes(id)) clean.push(id);
          } else if (!ungroundedRemoved.includes(id)) {
            ungroundedRemoved.push(id);
          }
        }
        return clean;
      };

      const keySimilarities = (
        Array.isArray(parsed.keySimilarities) ? parsed.keySimilarities : []
      ).map((item: { statement?: string; citedRecordIds?: string[] }) => ({
        statement: sanitizeFreeTextCitations(
          item.statement || '',
          validRecordIds,
          ungroundedRemoved
        ),
        citedRecordIds: filterIds(item.citedRecordIds),
      }));

      const criticalDifferencesAndConflicts = (
        Array.isArray(parsed.criticalDifferencesAndConflicts)
          ? parsed.criticalDifferencesAndConflicts
          : []
      ).map((item: { statement?: string; citedRecordIds?: string[] }) => ({
        statement: sanitizeFreeTextCitations(
          item.statement || '',
          validRecordIds,
          ungroundedRemoved
        ),
        citedRecordIds: filterIds(item.citedRecordIds),
      }));

      const recommendedVerificationSteps = (
        Array.isArray(parsed.recommendedVerificationSteps)
          ? parsed.recommendedVerificationSteps
          : []
      ).map((item: { action?: string; citedRecordIds?: string[] }) => ({
        action: sanitizeFreeTextCitations(
          item.action || '',
          validRecordIds,
          ungroundedRemoved
        ),
        citedRecordIds: filterIds(item.citedRecordIds),
      }));

      return {
        synthesis: {
          generatedAt: new Date().toISOString(),
          mode: 'gemini-live',
          executionLabel: 'LIVE GEMINI',
          modelUsed: PRIMARY_GEMINI_MODEL,
          requestedModel: PRIMARY_GEMINI_MODEL,
          requestStatus: `HTTP 200 OK · Live Gemini API (Attempt ${attempts}/${MAX_GEMINI_ATTEMPTS})`,
          httpStatusCode: 200,
          attempts,
          retried: attempts > 1,
          errorMessage: null,
          currentIncidentId: currentIncident.id,
          historicalIncidentId: historicalIncident.id,
          executiveComparison: sanitizeFreeTextCitations(
            parsed.executiveComparison || '',
            validRecordIds,
            ungroundedRemoved
          ),
          keySimilarities,
          criticalDifferencesAndConflicts,
          recommendedVerificationSteps,
          epistemicCaveat: sanitizeFreeTextCitations(
            parsed.epistemicCaveat ||
              'Similarity score measures telemetry overlap, not root-cause probability.',
            validRecordIds,
            ungroundedRemoved
          ),
          ungroundedCitationsRemoved: ungroundedRemoved,
        },
      };
    } catch (err: unknown) {
      const classified = classifyGeminiError(err);
      lastClassifiedError = classified;
      if (classified.retryable && attempt < MAX_GEMINI_ATTEMPTS) {
        const jitter = Math.floor(Math.random() * 100);
        const delayMs = baseBackoffMs * Math.pow(2, attempt - 1) + jitter;
        await sleep(delayMs);
        continue;
      }
      break;
    }
  }

  const statusCode = lastClassifiedError?.statusCode || 503;
  const errorMsg =
    lastClassifiedError?.cleanMessage ||
    'Live Gemini API unavailable; served deterministic comparison synthesis.';
  const retrySummary =
    attempts > 1
      ? `Retried ${attempts}/${MAX_GEMINI_ATTEMPTS} attempts with backoff`
      : `Stopped after 1 attempt (non-retryable ${
          lastClassifiedError?.category || 'error'
        })`;
  const requestStatus = `FALLBACK SERVED · ${
    lastClassifiedError?.category || 'UPSTREAM_ERROR'
  } (HTTP ${statusCode} · ${retrySummary})`;

  const fallback = buildDeterministicMemoryFallback(
    currentIncident,
    historicalIncident,
    comparison,
    {
      requestStatus,
      httpStatusCode: statusCode,
      attempts,
      retried: attempts > 1,
      errorMessage: errorMsg,
    }
  );

  return {
    synthesis: fallback,
    notice: `DETERMINISTIC FALLBACK (${requestStatus}): ${errorMsg}`,
  };
}

async function startServer() {
  const app = express();
  const httpServer = createHttpServer(app);
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      geminiConfigured: isGeminiConfigured(),
      primaryModel: PRIMARY_GEMINI_MODEL,
      fallbackModel: DETERMINISTIC_ENGINE_MODEL,
      demoMode: true,
    });
  });

  app.post('/api/analyze-incident', async (req, res) => {
    const incident = req.body?.incident as IncidentInvestigation | undefined;
    if (
      !incident ||
      typeof incident.id !== 'string' ||
      !Array.isArray(incident.records) ||
      !Array.isArray(incident.hypotheses)
    ) {
      return res.status(400).json({
        error:
          'Invalid incident payload: incident.id, incident.records[], and incident.hypotheses[] are required.',
        executionLabel: 'INVALID REQUEST',
        attempts: 0,
        retried: false,
      });
    }

    const simulateFailure = req.body?.simulateFailure as
      | SimulatedFailureType
      | undefined;
    const attemptTimeoutMs =
      typeof req.body?.attemptTimeoutMs === 'number'
        ? req.body.attemptTimeoutMs
        : undefined;
    const baseBackoffMs =
      typeof req.body?.baseBackoffMs === 'number'
        ? req.body.baseBackoffMs
        : undefined;

    const result = await analyzeIncidentWithResilience(incident, {
      simulateFailure,
      attemptTimeoutMs,
      baseBackoffMs,
    });

    return res.json(result);
  });

  app.post('/api/analyze-memory-comparison', async (req, res) => {
    const currentIncident = req.body?.currentIncident as
      | IncidentInvestigation
      | undefined;
    const historicalIncident = req.body?.historicalIncident as
      | IncidentInvestigation
      | undefined;
    const comparison = req.body?.comparison as
      | IncidentSimilarityComparison
      | undefined;

    if (
      !currentIncident ||
      !historicalIncident ||
      !comparison ||
      !Array.isArray(currentIncident.records) ||
      !Array.isArray(historicalIncident.records)
    ) {
      return res.status(400).json({
        error:
          'Invalid comparison payload: currentIncident, historicalIncident, and comparison are required.',
        executionLabel: 'INVALID REQUEST',
        attempts: 0,
        retried: false,
      });
    }

    const simulateFailure = req.body?.simulateFailure as
      | SimulatedFailureType
      | undefined;
    const attemptTimeoutMs =
      typeof req.body?.attemptTimeoutMs === 'number'
        ? req.body.attemptTimeoutMs
        : undefined;
    const baseBackoffMs =
      typeof req.body?.baseBackoffMs === 'number'
        ? req.body.baseBackoffMs
        : undefined;

    const result = await analyzeMemoryComparisonWithResilience(
      currentIncident,
      historicalIncident,
      comparison,
      {
        simulateFailure,
        attemptTimeoutMs,
        baseBackoffMs,
      }
    );

    return res.json(result);
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: {
          server: httpServer,
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`TRACE AI 2.0 Server listening on http://0.0.0.0:${PORT}`);
  });
}

// Only start listening when server.ts is executed as the main entrypoint
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(__filename)
) {
  startServer();
}
