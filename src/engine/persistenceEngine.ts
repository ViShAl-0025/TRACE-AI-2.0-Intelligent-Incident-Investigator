import {
  IncidentInvestigation,
  InvestigationBackupBundle,
  PersistedWorkspaceEnvelope,
  RecordType,
  SavedReportSnapshot,
  SourceRecord,
  WhatIfSimulationEntry,
} from '../types/trace';
import { parseValidTimestamp, sanitizeUntrustedText } from './forensicEngine';

export const WORKSPACE_STORAGE_KEY = 'trace_ai_v2_workspace_state';
export const CHECKPOINT_STORAGE_KEY = 'trace_ai_v2_manual_checkpoint';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const VALID_RECORD_TYPES: RecordType[] = [
  'deployment',
  'log',
  'metric',
  'ticket',
  'service_event',
  'what_if',
];

const SENSITIVE_KEY_PATTERN =
  /^(api[_-]?key|gemini[_-]?api[_-]?key|secret|client[_-]?secret|password|access[_-]?token|refresh[_-]?token|private[_-]?key|authorization|bearer|credential)s?$/i;

const SENSITIVE_VALUE_PATTERN =
  /\b(AIza[0-9A-Za-z\-_]{20,}|sk-[0-9A-Za-z]{20,}|ya29\.[0-9A-Za-z\-_]+)\b/g;

function getDefaultStorage(): StorageLike | undefined {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // Ignore SecurityError when localStorage is blocked by browser settings
  }
  return undefined;
}

/**
 * Recursively strips any credential/secret keys or API key token patterns
 * so sensitive secrets can never be written to localStorage or exported in JSON backups.
 */
export function scrubSensitiveCredentials<T>(input: T): T {
  if (input === null || input === undefined) {
    return input;
  }
  if (typeof input === 'string') {
    return input.replace(SENSITIVE_VALUE_PATTERN, '[REDACTED-CREDENTIAL]') as unknown as T;
  }
  if (Array.isArray(input)) {
    return input.map((item) => scrubSensitiveCredentials(item)) as unknown as T;
  }
  if (typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (
        k === '__proto__' ||
        k === 'constructor' ||
        k === 'prototype' ||
        SENSITIVE_KEY_PATTERN.test(k)
      ) {
        continue;
      }
      out[k] = scrubSensitiveCredentials(v);
    }
    return out as T;
  }
  return input;
}

/**
 * Validates and sanitizes an IncidentInvestigation object, preserving original
 * investigation IDs, source record IDs, ISO-8601 timestamps, relationships, and hypotheses.
 */
export function validateIncidentObject(raw: unknown): {
  valid: boolean;
  incident?: IncidentInvestigation;
  errors: string[];
} {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { valid: false, errors: ['Incident entry must be a JSON object.'] };
  }

  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === 'string' ? obj.id.trim() : '';
  const title = typeof obj.title === 'string' ? obj.title.trim() : '';
  const severity = obj.severity;
  const status = obj.status;

  if (!id) errors.push('Missing required investigation "id".');
  if (!title) errors.push(`Investigation "${id || 'unknown'}" is missing "title".`);
  if (severity !== 'SEV-1' && severity !== 'SEV-2' && severity !== 'SEV-3') {
    errors.push(`Investigation "${id}" has invalid severity "${String(severity)}".`);
  }
  if (status !== 'Investigating' && status !== 'Mitigated' && status !== 'Resolved') {
    errors.push(`Investigation "${id}" has invalid status "${String(status)}".`);
  }
  if (!Array.isArray(obj.records) || obj.records.length === 0) {
    errors.push(`Investigation "${id}" must include a non-empty "records" array.`);
  }
  if (!Array.isArray(obj.relationships)) {
    errors.push(`Investigation "${id}" must include a "relationships" array.`);
  }
  if (!Array.isArray(obj.hypotheses) || obj.hypotheses.length === 0) {
    errors.push(`Investigation "${id}" must include a non-empty "hypotheses" array.`);
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Validate records while preserving exact IDs and timestamps
  const seenRecordIds = new Set<string>();
  const validatedRecords: SourceRecord[] = [];

  for (let i = 0; i < (obj.records as unknown[]).length; i++) {
    const r = (obj.records as unknown[])[i];
    if (!r || typeof r !== 'object' || Array.isArray(r)) {
      errors.push(`Record at index ${i} in ${id} is not an object.`);
      continue;
    }
    const rec = r as Record<string, unknown>;
    const recId = typeof rec.id === 'string' ? rec.id.trim() : '';
    const recTs = typeof rec.timestamp === 'string' ? rec.timestamp.trim() : '';
    const recType = typeof rec.type === 'string' ? (rec.type as RecordType) : 'log';
    const recService = typeof rec.service === 'string' ? rec.service.trim() : '';
    const recSummary = typeof rec.summary === 'string' ? rec.summary : '';

    if (!recId) {
      errors.push(`Record at index ${i} in ${id} is missing "id".`);
      continue;
    }
    if (seenRecordIds.has(recId)) {
      errors.push(`Duplicate record ID "${recId}" in investigation "${id}".`);
      continue;
    }
    if (parseValidTimestamp(recTs) === null) {
      errors.push(
        `Record "${recId}" in "${id}" has invalid ISO-8601 timestamp "${recTs}".`
      );
      continue;
    }
    if (!VALID_RECORD_TYPES.includes(recType)) {
      errors.push(`Record "${recId}" in "${id}" has unsupported type "${recType}".`);
      continue;
    }
    if (!recService) {
      errors.push(`Record "${recId}" in "${id}" is missing "service".`);
      continue;
    }

    seenRecordIds.add(recId);
    const sanitizedSummary = sanitizeUntrustedText(recSummary).clean;
    const rawPayloadStr =
      typeof rec.rawPayload === 'string'
        ? sanitizeUntrustedText(rec.rawPayload).clean
        : JSON.stringify(rec);

    validatedRecords.push({
      id: recId,
      timestamp: recTs,
      type: recType,
      service: sanitizeUntrustedText(recService).clean,
      summary: sanitizedSummary,
      rawPayload: rawPayloadStr,
      severity:
        rec.severity === 'critical' || rec.severity === 'warning' || rec.severity === 'info'
          ? rec.severity
          : 'info',
      sourceOrigin:
        rec.sourceOrigin === 'baseline' ||
        rec.sourceOrigin === 'ingested' ||
        rec.sourceOrigin === 'what_if'
          ? rec.sourceOrigin
          : 'baseline',
      metadata:
        rec.metadata && typeof rec.metadata === 'object' && !Array.isArray(rec.metadata)
          ? (scrubSensitiveCredentials(rec.metadata) as SourceRecord['metadata'])
          : {},
    });
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const scrubbedIncident = scrubSensitiveCredentials(obj) as unknown as IncidentInvestigation;
  scrubbedIncident.records = validatedRecords;

  return {
    valid: true,
    incident: scrubbedIncident,
    errors: [],
  };
}

/**
 * Persists the active workspace state to browser localStorage.
 */
export function saveWorkspaceToStorage(
  state: {
    selectedIncidentId: string;
    selectedRecordId: string | null;
    activePresetIds: string[];
    incidents: IncidentInvestigation[];
    whatIfHistory: WhatIfSimulationEntry[];
    savedReports: SavedReportSnapshot[];
    savedAt?: string;
  },
  storage: StorageLike | undefined = getDefaultStorage(),
  storageKey: string = WORKSPACE_STORAGE_KEY
): {
  ok: boolean;
  savedAt: string;
  error?: string;
} {
  const savedAt = state.savedAt || new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  if (!storage) {
    return {
      ok: false,
      savedAt,
      error: 'Browser localStorage is unavailable in this environment.',
    };
  }

  try {
    const cleanState = scrubSensitiveCredentials({
      schemaVersion: '2.0.0' as const,
      storageEngine: 'browser-localStorage' as const,
      savedAt,
      selectedIncidentId: state.selectedIncidentId,
      selectedRecordId: state.selectedRecordId,
      activePresetIds: state.activePresetIds,
      incidents: state.incidents,
      whatIfHistory: state.whatIfHistory,
      savedReports: state.savedReports,
    });

    storage.setItem(storageKey, JSON.stringify(cleanState));
    return { ok: true, savedAt };
  } catch (err: unknown) {
    return {
      ok: false,
      savedAt,
      error:
        err instanceof Error
          ? `Storage write failed (${err.message}). In-memory session remains active.`
          : 'Storage write failed due to quota or browser restriction.',
    };
  }
}

/**
 * Loads and validates the persisted workspace state from browser localStorage.
 * Gracefully recovers using fallbackIncidents if stored data is corrupted or invalid.
 */
export function loadWorkspaceFromStorage(
  fallbackIncidents: IncidentInvestigation[],
  storage: StorageLike | undefined = getDefaultStorage(),
  storageKey: string = WORKSPACE_STORAGE_KEY
): {
  envelope: PersistedWorkspaceEnvelope;
  recoveredFromStorage: boolean;
  corruptedWarning: string | null;
} {
  const nowIso = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const defaultEnvelope: PersistedWorkspaceEnvelope = {
    schemaVersion: '2.0.0',
    storageEngine: 'browser-localStorage',
    savedAt: nowIso,
    selectedIncidentId: fallbackIncidents[0]?.id || 'INC-2026-0842',
    selectedRecordId: fallbackIncidents[0]?.records[0]?.id || null,
    activePresetIds: [],
    incidents: structuredClone(fallbackIncidents),
    whatIfHistory: [],
    savedReports: [],
  };

  if (!storage) {
    return {
      envelope: defaultEnvelope,
      recoveredFromStorage: false,
      corruptedWarning: null,
    };
  }

  let rawText: string | null = null;
  try {
    rawText = storage.getItem(storageKey);
  } catch {
    return {
      envelope: defaultEnvelope,
      recoveredFromStorage: false,
      corruptedWarning:
        'Unable to read browser localStorage; initialized with baseline demo investigations.',
    };
  }

  if (!rawText || !rawText.trim()) {
    return {
      envelope: defaultEnvelope,
      recoveredFromStorage: false,
      corruptedWarning: null,
    };
  }

  if (
    rawText.includes('"__proto__"') ||
    rawText.includes('"prototype"') ||
    /<script\b/i.test(rawText)
  ) {
    return {
      envelope: defaultEnvelope,
      recoveredFromStorage: false,
      corruptedWarning:
        'Rejected unsafe or polluted localStorage payload; safely recovered factory baseline investigations.',
    };
  }

  try {
    const parsed = JSON.parse(rawText) as Partial<PersistedWorkspaceEnvelope>;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      parsed.schemaVersion !== '2.0.0' ||
      !Array.isArray(parsed.incidents) ||
      parsed.incidents.length === 0
    ) {
      return {
        envelope: defaultEnvelope,
        recoveredFromStorage: false,
        corruptedWarning:
          'Corrupted or incompatible saved investigation schema in localStorage; safely recovered baseline state.',
      };
    }

    const validIncidents: IncidentInvestigation[] = [];
    for (const rawInc of parsed.incidents) {
      const check = validateIncidentObject(rawInc);
      if (!check.valid || !check.incident) {
        return {
          envelope: defaultEnvelope,
          recoveredFromStorage: false,
          corruptedWarning: `Corrupted saved investigation data (${check.errors[0] || 'validation error'}); safely recovered baseline state.`,
        };
      }
      validIncidents.push(check.incident);
    }

    // Backfill newly added baseline archive incident INC-2026-0791 and historicalResolution metadata if upgrading from an older snapshot
    for (const inc of validIncidents) {
      if (!inc.historicalResolution) {
        const matchBase = fallbackIncidents.find((b) => b.id === inc.id);
        if (matchBase?.historicalResolution) {
          inc.historicalResolution = structuredClone(
            matchBase.historicalResolution
          );
        }
      }
    }
    if (
      validIncidents.some((i) => i.id === 'INC-2026-0842') &&
      validIncidents.some((i) => i.id === 'INC-2026-0839') &&
      !validIncidents.some((i) => i.id === 'INC-2026-0791')
    ) {
      const archiveBaseline = fallbackIncidents.find((i) => i.id === 'INC-2026-0791');
      if (archiveBaseline) {
        validIncidents.push(structuredClone(archiveBaseline));
      }
    }

    const selectedId = validIncidents.some((i) => i.id === parsed.selectedIncidentId)
      ? (parsed.selectedIncidentId as string)
      : validIncidents[0].id;
    const activeInc = validIncidents.find((i) => i.id === selectedId) || validIncidents[0];
    const selectedRecId =
      typeof parsed.selectedRecordId === 'string' &&
      activeInc.records.some((r) => r.id === parsed.selectedRecordId)
        ? parsed.selectedRecordId
        : activeInc.records[0]?.id || null;

    return {
      envelope: {
        schemaVersion: '2.0.0',
        storageEngine: 'browser-localStorage',
        savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : nowIso,
        selectedIncidentId: selectedId,
        selectedRecordId: selectedRecId,
        activePresetIds: Array.isArray(parsed.activePresetIds)
          ? parsed.activePresetIds.filter((id): id is string => typeof id === 'string')
          : [],
        incidents: validIncidents,
        whatIfHistory: Array.isArray(parsed.whatIfHistory)
          ? (scrubSensitiveCredentials(parsed.whatIfHistory) as WhatIfSimulationEntry[])
          : [],
        savedReports: Array.isArray(parsed.savedReports)
          ? (scrubSensitiveCredentials(parsed.savedReports) as SavedReportSnapshot[])
          : [],
      },
      recoveredFromStorage: true,
      corruptedWarning: null,
    };
  } catch {
    return {
      envelope: defaultEnvelope,
      recoveredFromStorage: false,
      corruptedWarning:
        'Corrupted JSON detected in browser localStorage; safely recovered verified baseline investigations.',
    };
  }
}

/**
 * Clears all persisted workspace and checkpoint keys from localStorage.
 */
export function clearPersistedStorage(
  storage: StorageLike | undefined = getDefaultStorage()
): boolean {
  if (!storage) return false;
  try {
    storage.removeItem(WORKSPACE_STORAGE_KEY);
    storage.removeItem(CHECKPOINT_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks whether a manual checkpoint exists in localStorage.
 */
export function hasManualCheckpoint(
  storage: StorageLike | undefined = getDefaultStorage()
): { exists: boolean; savedAt: string | null } {
  if (!storage) return { exists: false, savedAt: null };
  try {
    const raw = storage.getItem(CHECKPOINT_STORAGE_KEY);
    if (!raw) return { exists: false, savedAt: null };
    const parsed = JSON.parse(raw);
    if (parsed && parsed.schemaVersion === '2.0.0' && Array.isArray(parsed.incidents)) {
      return { exists: true, savedAt: parsed.savedAt || null };
    }
  } catch {
    // Ignore malformed checkpoint
  }
  return { exists: false, savedAt: null };
}

/**
 * Exports a single complete investigation (including its What-If history and saved reports)
 * as a self-contained JSON backup bundle for recovery or sharing.
 */
export function exportInvestigationBackupJson(
  incident: IncidentInvestigation,
  whatIfHistory: WhatIfSimulationEntry[] = [],
  savedReports: SavedReportSnapshot[] = []
): string {
  const bundle: InvestigationBackupBundle = scrubSensitiveCredentials({
    bundleType: 'trace-ai-investigation-backup-v2',
    schemaVersion: '2.0.0',
    exportedAt: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    storageScope: 'single-browser-local-demo',
    incident,
    whatIfHistory: whatIfHistory.filter((h) => h.incidentId === incident.id),
    savedReports: savedReports.filter((r) => r.incidentId === incident.id),
  });
  return JSON.stringify(bundle, null, 2);
}

/**
 * Exports the entire multi-incident workspace as a JSON backup bundle.
 */
export function exportWorkspaceBackupJson(state: {
  incidents: IncidentInvestigation[];
  whatIfHistory: WhatIfSimulationEntry[];
  savedReports: SavedReportSnapshot[];
}): string {
  const bundle: InvestigationBackupBundle = scrubSensitiveCredentials({
    bundleType: 'trace-ai-workspace-backup-v2',
    schemaVersion: '2.0.0',
    exportedAt: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    storageScope: 'single-browser-local-demo',
    incidents: state.incidents,
    whatIfHistory: state.whatIfHistory,
    savedReports: state.savedReports,
  });
  return JSON.stringify(bundle, null, 2);
}

/**
 * Validates and parses an imported JSON backup file (supports single-investigation backup,
 * full-workspace backup, or ReportView forensic bundle).
 */
export function validateAndParseBackupJson(rawJsonText: string): {
  ok: boolean;
  bundleType?: string;
  incidents: IncidentInvestigation[];
  whatIfHistory: WhatIfSimulationEntry[];
  savedReports: SavedReportSnapshot[];
  errors: string[];
} {
  if (!rawJsonText || !rawJsonText.trim()) {
    return {
      ok: false,
      incidents: [],
      whatIfHistory: [],
      savedReports: [],
      errors: ['Backup file is empty.'],
    };
  }

  if (
    rawJsonText.includes('"__proto__"') ||
    rawJsonText.includes('"prototype"') ||
    /<script\b/i.test(rawJsonText)
  ) {
    return {
      ok: false,
      incidents: [],
      whatIfHistory: [],
      savedReports: [],
      errors: [
        'Security Rejection: Backup file contains forbidden prototype pollution keys or executable <script> tags.',
      ],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJsonText);
  } catch (err: unknown) {
    return {
      ok: false,
      incidents: [],
      whatIfHistory: [],
      savedReports: [],
      errors: [
        `Invalid JSON syntax: ${
          err instanceof Error ? err.message : 'Unable to parse JSON.'
        }`,
      ],
    };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      ok: false,
      incidents: [],
      whatIfHistory: [],
      savedReports: [],
      errors: ['Backup root must be a JSON object.'],
    };
  }

  const root = parsed as Record<string, unknown>;
  const candidateIncidents: unknown[] = [];

  if (Array.isArray(root.incidents)) {
    candidateIncidents.push(...root.incidents);
  } else if (root.incident && typeof root.incident === 'object') {
    candidateIncidents.push(root.incident);
  } else if (typeof root.id === 'string' && Array.isArray(root.records)) {
    // Direct IncidentInvestigation object
    candidateIncidents.push(root);
  } else {
    return {
      ok: false,
      incidents: [],
      whatIfHistory: [],
      savedReports: [],
      errors: [
        'Unrecognized backup format: missing "incident" or "incidents" payload.',
      ],
    };
  }

  if (candidateIncidents.length === 0) {
    return {
      ok: false,
      incidents: [],
      whatIfHistory: [],
      savedReports: [],
      errors: ['Backup file contains zero investigations.'],
    };
  }

  const allErrors: string[] = [];
  const validatedIncidents: IncidentInvestigation[] = [];

  for (const cand of candidateIncidents) {
    const res = validateIncidentObject(cand);
    if (!res.valid || !res.incident) {
      allErrors.push(...res.errors);
    } else {
      validatedIncidents.push(res.incident);
    }
  }

  if (allErrors.length > 0) {
    return {
      ok: false,
      incidents: [],
      whatIfHistory: [],
      savedReports: [],
      errors: allErrors,
    };
  }

  const whatIfHistory = Array.isArray(root.whatIfHistory)
    ? (scrubSensitiveCredentials(root.whatIfHistory) as WhatIfSimulationEntry[])
    : [];
  const savedReports = Array.isArray(root.savedReports)
    ? (scrubSensitiveCredentials(root.savedReports) as SavedReportSnapshot[])
    : [];

  return {
    ok: true,
    bundleType:
      typeof root.bundleType === 'string'
        ? root.bundleType
        : 'trace-ai-investigation-backup-v2',
    incidents: validatedIncidents,
    whatIfHistory,
    savedReports,
    errors: [],
  };
}
