import {
  IncidentInvestigation,
  IncidentSimilarityComparison,
  RecordType,
  RecurringPatternItem,
  SimilarityDimensionBreakdown,
  SourceRecord,
} from '../types/trace';

const DEMO_INCIDENT_IDS = new Set([
  'INC-2026-0842',
  'INC-2026-0839',
  'INC-2026-0791',
]);

export function isFictionalDemoIncident(incident: IncidentInvestigation): boolean {
  return (
    DEMO_INCIDENT_IDS.has(incident.id) ||
    Boolean(incident.historicalResolution?.isDemoArchive) ||
    incident.title.toLowerCase().includes('fictional demo')
  );
}

interface CanonicalSignatureRule {
  token: string;
  label: string;
  pattern: RegExp;
}

const CANONICAL_ERROR_SIGNATURES: CanonicalSignatureRule[] = [
  {
    token: 'HTTP_504_GATEWAY_TIMEOUT',
    label: 'HTTP 504 Gateway Timeout',
    pattern: /\b504\b|gateway timeout/i,
  },
  {
    token: 'HIKARIPOOL_STARVATION',
    label: 'HikariPool Connection Starvation / Timeout',
    pattern: /hikaripool|hikaricp|connection is not available|sqltransientconnectionexception/i,
  },
  {
    token: 'DB_POOL_SIZE_DRIFT',
    label: 'DB_MAX_POOL_SIZE / Pool Cap=10 Config Regression',
    pattern: /db_max_pool_size|maximum-pool-size|maximumpoolsize|total=10,\s*active=10|capped at 10/i,
  },
  {
    token: 'TLS_HANDSHAKE_LATENCY',
    label: 'Upstream TLS Handshake Latency / Jitter',
    pattern: /tls handshake|tls_handshake/i,
  },
  {
    token: 'REDIS_MOVED_REDIRECT',
    label: 'Redis Cluster MOVED Slot Redirect',
    pattern: /\bmoved\s+\d+|cluster_setslot_migrating|lettuceclusterclient/i,
  },
  {
    token: 'HTTP_401_AUTH_SPIKE',
    label: 'HTTP 401 Unauthorized / Session Miss',
    pattern: /\b401\b|emptysession|auth\.introspect\.401/i,
  },
  {
    token: 'JWKS_KEY_ROTATION',
    label: 'JWKS Signing Key Rotation',
    pattern: /jwks|signing key|new_kid/i,
  },
  {
    token: 'BGP_ROUTE_FLAP',
    label: 'External Transit BGP Route Flap',
    pattern: /\bbgp\b|route flap/i,
  },
];

export function extractRecordSignatures(
  records: SourceRecord[]
): Map<string, { label: string; recordIds: string[]; services: string[] }> {
  const map = new Map<
    string,
    { label: string; recordIds: string[]; services: string[] }
  >();

  for (const rec of records) {
    // Only inspect technical record payloads and summaries (never incident titles)
    const haystack = `${rec.summary} ${rec.rawPayload} ${
      rec.metadata?.metricName || ''
    }`;
    for (const rule of CANONICAL_ERROR_SIGNATURES) {
      if (rule.pattern.test(haystack)) {
        const existing = map.get(rule.token) || {
          label: rule.label,
          recordIds: [],
          services: [],
        };
        if (!existing.recordIds.includes(rec.id)) {
          existing.recordIds.push(rec.id);
        }
        if (!existing.services.includes(rec.service)) {
          existing.services.push(rec.service);
        }
        map.set(rule.token, existing);
      }
    }
  }
  return map;
}

function extractGraphPatterns(incident: IncidentInvestigation): {
  patterns: Set<string>;
  recordIds: string[];
} {
  const recMap = new Map(incident.records.map((r) => [r.id, r]));
  const patterns = new Set<string>();
  const citedIds = new Set<string>();

  for (const rel of incident.relationships) {
    const src = recMap.get(rel.sourceId);
    const tgt = recMap.get(rel.targetId);
    if (!src || !tgt) continue;
    patterns.add(`${rel.type}:${src.type}->${tgt.type}`);
    patterns.add(`svc:${src.service}->${tgt.service}`);
    citedIds.add(src.id);
    citedIds.add(tgt.id);
  }

  return {
    patterns,
    recordIds: Array.from(citedIds),
  };
}

/**
 * Searches saved investigations and source records in persistent memory.
 * Never invents records; strictly queries the provided incidents store.
 */
export function searchIncidentMemory(
  incidents: IncidentInvestigation[],
  options?: {
    query?: string;
    serviceFilter?: string;
    statusFilter?: string;
    recordTypeFilter?: 'all' | RecordType;
  }
): Array<{
  incident: IncidentInvestigation;
  matchedRecords: SourceRecord[];
  extractedSignatures: string[];
  isDemoRecord: boolean;
}> {
  const q = (options?.query || '').trim().toLowerCase();
  const svcFilter = (options?.serviceFilter || 'ALL').toLowerCase();
  const statusFilter = options?.statusFilter || 'ALL';
  const typeFilter = options?.recordTypeFilter || 'all';

  const results: Array<{
    incident: IncidentInvestigation;
    matchedRecords: SourceRecord[];
    extractedSignatures: string[];
    isDemoRecord: boolean;
  }> = [];

  for (const inc of incidents) {
    if (statusFilter !== 'ALL' && inc.status !== statusFilter) {
      continue;
    }

    if (svcFilter !== 'all') {
      const hasSvc =
        inc.affectedServices.some((s) => s.name.toLowerCase() === svcFilter) ||
        inc.records.some((r) => r.service.toLowerCase() === svcFilter);
      if (!hasSvc) continue;
    }

    const matchedRecords = inc.records.filter((r) => {
      if (typeFilter !== 'all' && r.type !== typeFilter) return false;
      if (!q) return true;
      return (
        r.id.toLowerCase().includes(q) ||
        r.service.toLowerCase().includes(q) ||
        r.summary.toLowerCase().includes(q) ||
        r.rawPayload.toLowerCase().includes(q) ||
        (r.metadata?.traceId && r.metadata.traceId.toLowerCase().includes(q)) ||
        (r.metadata?.commitSha &&
          r.metadata.commitSha.toLowerCase().includes(q)) ||
        inc.id.toLowerCase().includes(q) ||
        inc.summary.toLowerCase().includes(q) ||
        (inc.historicalResolution?.summary &&
          inc.historicalResolution.summary.toLowerCase().includes(q))
      );
    });

    if (q && matchedRecords.length === 0 && !inc.id.toLowerCase().includes(q)) {
      continue;
    }

    const sigMap = extractRecordSignatures(inc.records);
    results.push({
      incident: inc,
      matchedRecords: matchedRecords.length > 0 ? matchedRecords : inc.records,
      extractedSignatures: Array.from(sigMap.values()).map((v) => v.label),
      isDemoRecord: isFictionalDemoIncident(inc),
    });
  }

  return results;
}

/**
 * Compares a current incident against a historical incident across 5 technical dimensions:
 * 1. Service Overlap (30%)
 * 2. Error & Metric Signatures (30%)
 * 3. Deployment & Config Triggers (15%)
 * 4. Evidence Graph Topology (15%)
 * 5. Temporal & Anomaly Profile (10%)
 *
 * Strictly ignores incident titles when computing similarity scores.
 */
export function compareIncidentsDeterministically(
  current: IncidentInvestigation,
  historical: IncidentInvestigation
): IncidentSimilarityComparison {
  const curValidIds = new Set(current.records.map((r) => r.id));
  const histValidIds = new Set(historical.records.map((r) => r.id));

  // 1. Service Overlap (Weight: 0.30)
  const curServices = new Set([
    ...current.affectedServices.map((s) => s.name.toLowerCase()),
    ...current.records.map((r) => r.service.toLowerCase()),
  ]);
  const histServices = new Set([
    ...historical.affectedServices.map((s) => s.name.toLowerCase()),
    ...historical.records.map((r) => r.service.toLowerCase()),
  ]);

  const sharedServices = Array.from(curServices).filter((s) =>
    histServices.has(s)
  );
  const unionServices = new Set([...curServices, ...histServices]);
  const serviceScore =
    unionServices.size > 0
      ? Math.round((sharedServices.length / unionServices.size) * 100)
      : 0;

  const curServiceRecIds = current.records
    .filter((r) => sharedServices.includes(r.service.toLowerCase()))
    .map((r) => r.id);
  const histServiceRecIds = historical.records
    .filter((r) => sharedServices.includes(r.service.toLowerCase()))
    .map((r) => r.id);

  // 2. Error & Metric Signatures (Weight: 0.30)
  const curSigs = extractRecordSignatures(current.records);
  const histSigs = extractRecordSignatures(historical.records);

  const sharedSigTokens = Array.from(curSigs.keys()).filter((k) =>
    histSigs.has(k)
  );
  const unionSigTokens = new Set([...curSigs.keys(), ...histSigs.keys()]);

  // Exclude TLS_HANDSHAKE_LATENCY from positive match if one incident had 0% healthy TLS and the other had critical TLS degradation
  const adjustedSharedSigTokens = sharedSigTokens.filter((token) => {
    if (token === 'TLS_HANDSHAKE_LATENCY') {
      const curTlsRecs = current.records.filter((r) =>
        curSigs.get(token)?.recordIds.includes(r.id)
      );
      const histTlsRecs = historical.records.filter((r) =>
        histSigs.get(token)?.recordIds.includes(r.id)
      );
      const curHasError = curTlsRecs.some((r) => r.severity !== 'info');
      const histHasError = histTlsRecs.some((r) => r.severity !== 'info');
      return curHasError === histHasError;
    }
    return true;
  });

  const signatureScore =
    unionSigTokens.size > 0
      ? Math.round((adjustedSharedSigTokens.length / unionSigTokens.size) * 100)
      : 0;

  const curSigRecIds = Array.from(
    new Set(
      adjustedSharedSigTokens.flatMap(
        (t) => curSigs.get(t)?.recordIds || []
      )
    )
  );
  const histSigRecIds = Array.from(
    new Set(
      adjustedSharedSigTokens.flatMap(
        (t) => histSigs.get(t)?.recordIds || []
      )
    )
  );

  // 3. Deployment & Config Triggers (Weight: 0.15)
  const curDeploys = current.records.filter((r) => r.type === 'deployment');
  const histDeploys = historical.records.filter((r) => r.type === 'deployment');
  let deployScore = 0;
  const matchedDeployTokens: string[] = [];

  if (curDeploys.length > 0 && histDeploys.length > 0) {
    const sameDeployService = curDeploys.some((cd) =>
      histDeploys.some(
        (hd) => cd.service.toLowerCase() === hd.service.toLowerCase()
      )
    );
    const curDeployText = curDeploys
      .map((d) => `${d.summary} ${d.rawPayload}`)
      .join(' ')
      .toLowerCase();
    const histDeployText = histDeploys
      .map((d) => `${d.summary} ${d.rawPayload}`)
      .join(' ')
      .toLowerCase();

    const bothConfigPool =
      (curDeployText.includes('pool') || curDeployText.includes('hikari')) &&
      (histDeployText.includes('pool') || histDeployText.includes('hikari'));

    if (sameDeployService && bothConfigPool) {
      deployScore = 95;
      matchedDeployTokens.push(
        `Shared deployment service (${curDeploys[0].service})`,
        'Shared DB_MAX_POOL_SIZE / Hikari config mutation pattern'
      );
    } else if (sameDeployService) {
      deployScore = 70;
      matchedDeployTokens.push(
        `Shared deployment service (${curDeploys[0].service})`
      );
    } else {
      deployScore = 25;
      matchedDeployTokens.push(
        `Both preceded by deployments, but on different services (${curDeploys[0].service} vs ${histDeploys[0].service})`
      );
    }
  }

  // 4. Evidence Graph Topology (Weight: 0.15)
  const curGraph = extractGraphPatterns(current);
  const histGraph = extractGraphPatterns(historical);
  const sharedGraphPatterns = Array.from(curGraph.patterns).filter((p) =>
    histGraph.patterns.has(p)
  );
  const unionGraphPatterns = new Set([
    ...curGraph.patterns,
    ...histGraph.patterns,
  ]);
  const topologyScore =
    unionGraphPatterns.size > 0
      ? Math.round(
          (sharedGraphPatterns.length / unionGraphPatterns.size) * 100
        )
      : 0;

  // 5. Temporal & Anomaly Profile (Weight: 0.10)
  const curDirectDeployToLog = current.relationships.find(
    (r) => r.type === 'direct' && typeof r.temporalDeltaSeconds === 'number'
  );
  const histDirectDeployToLog = historical.relationships.find(
    (r) => r.type === 'direct' && typeof r.temporalDeltaSeconds === 'number'
  );
  let temporalScore = 0;
  const matchedTemporalTokens: string[] = [];
  if (current.severity === historical.severity) {
    temporalScore += 50;
    matchedTemporalTokens.push(`Matching severity (${current.severity})`);
  }
  if (
    curDirectDeployToLog?.temporalDeltaSeconds !== undefined &&
    histDirectDeployToLog?.temporalDeltaSeconds !== undefined
  ) {
    const diff = Math.abs(
      curDirectDeployToLog.temporalDeltaSeconds -
        histDirectDeployToLog.temporalDeltaSeconds
    );
    if (diff <= 120) {
      temporalScore += 50;
      matchedTemporalTokens.push(
        `Rapid post-trigger onset (Δ${curDirectDeployToLog.temporalDeltaSeconds}s vs Δ${histDirectDeployToLog.temporalDeltaSeconds}s)`
      );
    } else {
      temporalScore += 20;
    }
  }

  const dimensions: SimilarityDimensionBreakdown[] = [
    {
      dimension: 'Service Overlap',
      score: serviceScore,
      weight: 0.3,
      weightedContribution: Math.round(serviceScore * 0.3 * 10) / 10,
      explanation:
        sharedServices.length > 0
          ? `Shared ${sharedServices.length}/${unionServices.size} services: ${sharedServices.join(', ')}.`
          : 'Zero affected services overlap between the two investigations.',
      matchedTokens: sharedServices,
      currentRecordIds: curServiceRecIds.slice(0, 5),
      historicalRecordIds: histServiceRecIds.slice(0, 5),
    },
    {
      dimension: 'Error & Metric Signatures',
      score: signatureScore,
      weight: 0.3,
      weightedContribution: Math.round(signatureScore * 0.3 * 10) / 10,
      explanation:
        adjustedSharedSigTokens.length > 0
          ? `Matched ${adjustedSharedSigTokens.length} technical telemetry signature(s): ${adjustedSharedSigTokens
              .map((t) => curSigs.get(t)?.label || t)
              .join('; ')}.`
          : 'No matching technical error or metric signatures found in source records.',
      matchedTokens: adjustedSharedSigTokens.map(
        (t) => curSigs.get(t)?.label || t
      ),
      currentRecordIds: curSigRecIds,
      historicalRecordIds: histSigRecIds,
    },
    {
      dimension: 'Deployment & Config Triggers',
      score: deployScore,
      weight: 0.15,
      weightedContribution: Math.round(deployScore * 0.15 * 10) / 10,
      explanation:
        matchedDeployTokens.length > 0
          ? matchedDeployTokens.join(' · ')
          : 'No shared deployment trigger pattern detected.',
      matchedTokens: matchedDeployTokens,
      currentRecordIds: curDeploys.map((d) => d.id),
      historicalRecordIds: histDeploys.map((d) => d.id),
    },
    {
      dimension: 'Evidence Graph Topology',
      score: topologyScore,
      weight: 0.15,
      weightedContribution: Math.round(topologyScore * 0.15 * 10) / 10,
      explanation:
        sharedGraphPatterns.length > 0
          ? `Matched ${sharedGraphPatterns.length}/${unionGraphPatterns.size} causal edge structures (${sharedGraphPatterns.join(', ')}).`
          : 'Disjoint causal graph topologies.',
      matchedTokens: sharedGraphPatterns,
      currentRecordIds: curGraph.recordIds.slice(0, 4),
      historicalRecordIds: histGraph.recordIds.slice(0, 4),
    },
    {
      dimension: 'Temporal & Anomaly Profile',
      score: temporalScore,
      weight: 0.1,
      weightedContribution: Math.round(temporalScore * 0.1 * 10) / 10,
      explanation:
        matchedTemporalTokens.length > 0
          ? matchedTemporalTokens.join(' · ')
          : 'Different onset timing and severity profile.',
      matchedTokens: matchedTemporalTokens,
      currentRecordIds: current.records.slice(0, 2).map((r) => r.id),
      historicalRecordIds: historical.records.slice(0, 2).map((r) => r.id),
    },
  ];

  const rawTotalScore = dimensions.reduce(
    (sum, d) => sum + d.weightedContribution,
    0
  );
  const overallMatchScore = Math.max(0, Math.min(100, Math.round(rawTotalScore)));

  // Check for LOW EVIDENCE condition
  let lowEvidenceWarning: string | null = null;
  if (current.records.length < 3 || historical.records.length < 3) {
    lowEvidenceWarning = `LOW EVIDENCE: Insufficient source record density (${current.id} has ${current.records.length} record(s); ${historical.id} has ${historical.records.length} record(s)). Minimum 3 grounded records per incident required for reliable pattern correlation.`;
  } else if (
    overallMatchScore >= 20 &&
    overallMatchScore < 45 &&
    adjustedSharedSigTokens.length < 2
  ) {
    lowEvidenceWarning = `LOW EVIDENCE: Only ${adjustedSharedSigTokens.length} shared technical signature(s) across ${sharedServices.length} overlapping service(s). Do not assume shared root cause without executing falsification tests.`;
  }

  let classification: IncidentSimilarityComparison['classification'] =
    'UNRELATED';
  if (current.records.length < 3 || historical.records.length < 3) {
    classification = 'LOW EVIDENCE';
  } else if (overallMatchScore >= 72) {
    classification = 'HIGH PATTERN MATCH';
  } else if (overallMatchScore >= 45) {
    classification = 'PARTIAL PATTERN MATCH';
  } else if (overallMatchScore >= 20) {
    classification = lowEvidenceWarning
      ? 'LOW EVIDENCE'
      : 'WEAK / INCIDENTAL OVERLAP';
  } else {
    classification = 'UNRELATED';
  }

  // Build Shared Evidence list
  const sharedEvidence: IncidentSimilarityComparison['sharedEvidence'] = [];
  for (const token of adjustedSharedSigTokens) {
    const cEntry = curSigs.get(token);
    const hEntry = histSigs.get(token);
    if (cEntry && hEntry) {
      sharedEvidence.push({
        category: 'Recurring Technical Signature',
        description: `${cEntry.label} observed on ${cEntry.services.join(', ')} in both investigations.`,
        currentRecordIds: cEntry.recordIds.filter((id) => curValidIds.has(id)),
        historicalRecordIds: hEntry.recordIds.filter((id) =>
          histValidIds.has(id)
        ),
      });
    }
  }
  if (deployScore >= 70 && curDeploys.length > 0 && histDeploys.length > 0) {
    sharedEvidence.push({
      category: 'Deployment / Config Trigger',
      description: `Both incidents were immediately preceded by a deployment on ${curDeploys[0].service} (${curDeploys[0].id} vs ${histDeploys[0].id}).`,
      currentRecordIds: curDeploys.map((d) => d.id),
      historicalRecordIds: histDeploys.map((d) => d.id),
    });
  }

  // Build Conflicting & Divergent Evidence list
  const conflictingAndDivergentEvidence: IncidentSimilarityComparison['conflictingAndDivergentEvidence'] =
    [];

  // Check if current incident has payment gateway TLS / BGP signals that were healthy or absent in historical
  const curOnlySigs = Array.from(curSigs.keys()).filter(
    (k) => !adjustedSharedSigTokens.includes(k)
  );
  for (const token of curOnlySigs) {
    const cEntry = curSigs.get(token);
    if (!cEntry) continue;
    const hEntry = histSigs.get(token);
    const histHealthyPayment = historical.records.filter(
      (r) => r.service === 'payment-gateway-proxy' && r.severity === 'info'
    );
    conflictingAndDivergentEvidence.push({
      category: 'Active Confounding Signal in Current Incident',
      description: `${current.id} exhibits "${cEntry.label}" (${cEntry.recordIds.join(', ')}), whereas ${historical.id} ${
        histHealthyPayment.length > 0
          ? `explicitly logged healthy nominal status in ${histHealthyPayment.map((r) => r.id).join(', ')}`
          : 'did not exhibit this signal'
      }.`,
      currentRecordIds: cEntry.recordIds.filter((id) => curValidIds.has(id)),
      historicalRecordIds:
        hEntry?.recordIds.filter((id) => histValidIds.has(id)) ||
        histHealthyPayment.map((r) => r.id),
      epistemicImpact:
        'Prevents automatically concluding the historical root cause is identical; requires isolating this confounding signal via falsification testing.',
    });
  }

  // Also check signatures present in historical but absent in current
  const histOnlySigs = Array.from(histSigs.keys()).filter(
    (k) => !curSigs.has(k)
  );
  for (const token of histOnlySigs) {
    const hEntry = histSigs.get(token);
    if (!hEntry) continue;
    conflictingAndDivergentEvidence.push({
      category: 'Historical Signal Absent in Current Incident',
      description: `${historical.id} recorded "${hEntry.label}" (${hEntry.recordIds.join(', ')}), which is not present in ${current.id}.`,
      currentRecordIds: [],
      historicalRecordIds: hEntry.recordIds.filter((id) => histValidIds.has(id)),
      epistemicImpact:
        'Indicates divergent failure mechanism or uncollected telemetry in the current incident.',
    });
  }

  // Missing Evidence in Current Incident compared to Historical
  const missingInCurrentIncident: IncidentSimilarityComparison['missingInCurrentIncident'] =
    current.hypotheses.flatMap((h) =>
      h.missingInformation
        .filter((m) => !m.resolvedByRecordId)
        .map((m) => {
          const precedentRecs = historical.records
            .filter(
              (hr) =>
                hr.service.toLowerCase() === m.targetService.toLowerCase() ||
                hr.type === m.expectedRecordType
            )
            .map((hr) => hr.id);
          return {
            description: m.description,
            targetService: m.targetService,
            historicalPrecedentRecordIds: precedentRecs,
          };
        })
    );

  // Documented Historical Resolution
  const documentedHistoricalResolution: IncidentSimilarityComparison['documentedHistoricalResolution'] =
    historical.historicalResolution
      ? {
          available: true,
          summary: historical.historicalResolution.summary,
          rootCauseConfirmed:
            historical.historicalResolution.rootCauseConfirmed,
          remediationApplied:
            historical.historicalResolution.remediationApplied,
          verifiedByRecordIds:
            historical.historicalResolution.verifiedByRecordIds.filter((id) =>
              histValidIds.has(id)
            ),
        }
      : {
          available: false,
          summary: `Investigation ${historical.id} is currently in status "${historical.status}" without a finalized historical resolution record.`,
          rootCauseConfirmed: 'Pending final resolution verification.',
          remediationApplied:
            historical.recommendations[0] ||
            'Execute falsification protocol before applying remediation.',
          verifiedByRecordIds: historical.records
            .slice(0, 2)
            .map((r) => r.id),
        };

  // Verification Recommendations
  const verificationRecommendations: IncidentSimilarityComparison['verificationRecommendations'] =
    [];

  if (overallMatchScore >= 45 && documentedHistoricalResolution.available) {
    verificationRecommendations.push({
      priority: 'IMMEDIATE',
      action: `Verify whether ${historical.id}'s confirmed root cause (${documentedHistoricalResolution.rootCauseConfirmed}) applies to ${current.id} by executing ${
        current.hypotheses[0]?.falsificationTest.testAction ||
        'the primary falsification test'
      }.`,
      rationale: `High signature & service overlap (${overallMatchScore}% match score), but similarity is not proof of causation.`,
      citedRecordIds: [
        ...curSigRecIds.slice(0, 2),
        ...documentedHistoricalResolution.verifiedByRecordIds.slice(0, 2),
      ],
    });
  }

  if (conflictingAndDivergentEvidence.length > 0) {
    const firstConflict = conflictingAndDivergentEvidence[0];
    verificationRecommendations.push({
      priority: 'HIGH',
      action: `Disambiguate divergent evidence: ${firstConflict.description}`,
      rationale: firstConflict.epistemicImpact,
      citedRecordIds: [
        ...firstConflict.currentRecordIds,
        ...firstConflict.historicalRecordIds,
      ].slice(0, 4),
    });
  }

  if (missingInCurrentIncident.length > 0) {
    verificationRecommendations.push({
      priority: 'FOLLOW_UP',
      action: `Collect missing telemetry on ${missingInCurrentIncident[0].targetService}: ${missingInCurrentIncident[0].description}`,
      rationale:
        'Resolves open epistemic uncertainty before closing the investigation.',
      citedRecordIds:
        missingInCurrentIncident[0].historicalPrecedentRecordIds.slice(0, 2),
    });
  }

  return {
    currentIncidentId: current.id,
    historicalIncidentId: historical.id,
    historicalTitle: historical.title,
    historicalStatus: historical.status,
    historicalSeverity: historical.severity,
    historicalUpdatedAt: historical.updatedAt,
    isDemoRecord: isFictionalDemoIncident(historical),
    overallMatchScore,
    classification,
    lowEvidenceWarning,
    scoringMethodologyNote:
      'Weighted deterministic comparison: Service Overlap (30%), Error & Metric Signatures (30%), Deployment & Config Triggers (15%), Evidence Graph Topology (15%), Temporal Profile (10%). 0% reliance on incident titles. Score measures structural telemetry overlap — NOT the probability that a root cause is true.',
    dimensions,
    sharedEvidence,
    conflictingAndDivergentEvidence,
    missingInCurrentIncident,
    documentedHistoricalResolution,
    verificationRecommendations,
  };
}

/**
 * Ranks all other saved investigations in persistent memory against the active incident.
 */
export function rankRelatedIncidents(
  currentIncident: IncidentInvestigation,
  allIncidents: IncidentInvestigation[]
): IncidentSimilarityComparison[] {
  const candidates = allIncidents.filter((i) => i.id !== currentIncident.id);
  return candidates
    .map((hist) => compareIncidentsDeterministically(currentIncident, hist))
    .sort((a, b) => b.overallMatchScore - a.overallMatchScore);
}

/**
 * Detects recurring technical error signatures, common service dependencies,
 * and repeated deployment trigger associations across the stored incident corpus.
 * Explicitly reports sample size and corpus limitations.
 */
export function detectRecurringPatternsAcrossMemory(
  incidents: IncidentInvestigation[]
): {
  patterns: RecurringPatternItem[];
  sampleSize: number;
  demoIncidentCount: number;
  customIncidentCount: number;
  corpusLimitations: string[];
} {
  const sampleSize = incidents.length;
  const demoIncidentCount = incidents.filter((i) =>
    isFictionalDemoIncident(i)
  ).length;
  const customIncidentCount = sampleSize - demoIncidentCount;

  const corpusLimitations: string[] = [
    `Sample Size Limitation: Pattern analysis computed across N=${sampleSize} stored investigation(s) in single-browser localStorage (${demoIncidentCount} fictional demo baseline record(s), ${customIncidentCount} user-created/imported record(s)).`,
    'Historical frequency in a small corpus does not prove causation for a new incident; every recurring pattern must still pass falsification testing.',
  ];

  if (sampleSize < 2) {
    corpusLimitations.unshift(
      'Insufficient Historical Corpus: Fewer than 2 investigations exist in persistent storage. At least 2 stored investigations are required to detect cross-incident recurring patterns.'
    );
    return {
      patterns: [],
      sampleSize,
      demoIncidentCount,
      customIncidentCount,
      corpusLimitations,
    };
  }

  const patterns: RecurringPatternItem[] = [];

  // 1. Recurring Error & Telemetry Signatures across >= 2 incidents
  const sigTracker = new Map<
    string,
    {
      label: string;
      incidentIds: Set<string>;
      recordIds: Set<string>;
      services: Set<string>;
    }
  >();

  for (const inc of incidents) {
    const sigs = extractRecordSignatures(inc.records);
    for (const [token, info] of sigs.entries()) {
      // Only count error/warning records for recurring failure signatures
      const nonInfoRecs = inc.records.filter(
        (r) => info.recordIds.includes(r.id) && r.severity !== 'info'
      );
      if (nonInfoRecs.length === 0) continue;

      const entry = sigTracker.get(token) || {
        label: info.label,
        incidentIds: new Set<string>(),
        recordIds: new Set<string>(),
        services: new Set<string>(),
      };
      entry.incidentIds.add(inc.id);
      for (const r of nonInfoRecs) {
        entry.recordIds.add(r.id);
        entry.services.add(r.service);
      }
      sigTracker.set(token, entry);
    }
  }

  for (const [token, data] of sigTracker.entries()) {
    if (data.incidentIds.size >= 2) {
      patterns.push({
        id: `PAT-SIG-${token}`,
        patternType: 'ERROR_SIGNATURE',
        signature: data.label,
        occurrencesCount: data.incidentIds.size,
        totalCorpusSize: sampleSize,
        incidentIds: Array.from(data.incidentIds),
        citedRecordIds: Array.from(data.recordIds),
        affectedServices: Array.from(data.services),
        explanation: `Recurring technical signature "${data.label}" observed in ${data.incidentIds.size}/${sampleSize} stored investigations (${Array.from(data.incidentIds).join(', ')}) across records ${Array.from(data.recordIds).join(', ')}.`,
        sampleSizeLimitation: `Observed in ${data.incidentIds.size} of N=${sampleSize} stored local investigations.`,
      });
    }
  }

  // 2. Common Service Co-Failure Dependencies across >= 2 incidents
  const pairTracker = new Map<
    string,
    {
      services: [string, string];
      incidentIds: Set<string>;
      recordIds: Set<string>;
    }
  >();

  for (const inc of incidents) {
    const degradedSvcs = inc.affectedServices
      .map((s) => s.name)
      .sort((a, b) => a.localeCompare(b));
    for (let i = 0; i < degradedSvcs.length; i++) {
      for (let j = i + 1; j < degradedSvcs.length; j++) {
        const key = `${degradedSvcs[i]} + ${degradedSvcs[j]}`;
        const entry = pairTracker.get(key) || {
          services: [degradedSvcs[i], degradedSvcs[j]],
          incidentIds: new Set<string>(),
          recordIds: new Set<string>(),
        };
        entry.incidentIds.add(inc.id);
        for (const r of inc.records) {
          if (
            r.service === degradedSvcs[i] ||
            r.service === degradedSvcs[j]
          ) {
            entry.recordIds.add(r.id);
          }
        }
        pairTracker.set(key, entry);
      }
    }
  }

  for (const [pairKey, data] of pairTracker.entries()) {
    if (data.incidentIds.size >= 2) {
      patterns.push({
        id: `PAT-SVC-${pairKey.replace(/[^a-zA-Z0-9]+/g, '-')}`,
        patternType: 'SERVICE_DEPENDENCY',
        signature: `Co-Affected Architecture Pair: ${pairKey}`,
        occurrencesCount: data.incidentIds.size,
        totalCorpusSize: sampleSize,
        incidentIds: Array.from(data.incidentIds),
        citedRecordIds: Array.from(data.recordIds).slice(0, 6),
        affectedServices: data.services,
        explanation: `Services ${data.services[0]} and ${data.services[1]} co-appear in ${data.incidentIds.size}/${sampleSize} stored investigations (${Array.from(data.incidentIds).join(', ')}).`,
        sampleSizeLimitation: `Co-occurrence count ${data.incidentIds.size}/${sampleSize} in local corpus.`,
      });
    }
  }

  // 3. Repeated Deployment-Triggered Failure Associations across >= 2 incidents
  const deployTriggerTracker = new Map<
    string,
    {
      service: string;
      incidentIds: Set<string>;
      recordIds: Set<string>;
    }
  >();

  for (const inc of incidents) {
    const recMap = new Map(inc.records.map((r) => [r.id, r]));
    for (const rel of inc.relationships) {
      const src = recMap.get(rel.sourceId);
      const tgt = recMap.get(rel.targetId);
      if (src && tgt && src.type === 'deployment') {
        const entry = deployTriggerTracker.get(src.service) || {
          service: src.service,
          incidentIds: new Set<string>(),
          recordIds: new Set<string>(),
        };
        entry.incidentIds.add(inc.id);
        entry.recordIds.add(src.id);
        entry.recordIds.add(tgt.id);
        deployTriggerTracker.set(src.service, entry);
      }
    }
  }

  for (const [svc, data] of deployTriggerTracker.entries()) {
    if (data.incidentIds.size >= 2) {
      patterns.push({
        id: `PAT-DEP-${svc}`,
        patternType: 'DEPLOYMENT_TRIGGER',
        signature: `Post-Deployment Regression on ${svc}`,
        occurrencesCount: data.incidentIds.size,
        totalCorpusSize: sampleSize,
        incidentIds: Array.from(data.incidentIds),
        citedRecordIds: Array.from(data.recordIds),
        affectedServices: [svc],
        explanation: `Deployments on ${svc} directly preceded critical error/metric anomalies in ${data.incidentIds.size}/${sampleSize} stored investigations (${Array.from(data.incidentIds).join(', ')}).`,
        sampleSizeLimitation: `Observed across ${data.incidentIds.size}/${sampleSize} stored investigations.`,
      });
    }
  }

  return {
    patterns,
    sampleSize,
    demoIncidentCount,
    customIncidentCount,
    corpusLimitations,
  };
}
