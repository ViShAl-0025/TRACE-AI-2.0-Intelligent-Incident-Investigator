export type RecordType =
  | 'deployment'
  | 'log'
  | 'metric'
  | 'ticket'
  | 'service_event'
  | 'what_if';

export type SeverityLevel = 'SEV-1' | 'SEV-2' | 'SEV-3';

export type IncidentStatus = 'Investigating' | 'Mitigated' | 'Resolved';

export interface SourceRecord {
  id: string;
  timestamp: string; // ISO-8601 UTC
  type: RecordType;
  service: string;
  summary: string;
  rawPayload: string;
  severity: 'critical' | 'warning' | 'info';
  sourceOrigin: 'baseline' | 'ingested' | 'what_if';
  metadata: {
    commitSha?: string;
    traceId?: string;
    metricName?: string;
    metricValue?: string;
    author?: string;
    environment?: string;
    [key: string]: string | undefined;
  };
}

export type RelationshipType = 'direct' | 'inferred';

export interface EvidenceRelationship {
  id: string;
  sourceId: string;
  targetId: string;
  type: RelationshipType;
  label: string;
  ruleExplanation: string;
  confidenceWeight: number; // 0 to 100
  temporalDeltaSeconds?: number;
}

export interface EvidenceCitationReason {
  recordId: string;
  reason: string;
  weight: number; // +5 to +35 for supporting, -5 to -30 for contradictory
}

export interface MissingEvidenceItem {
  id: string;
  description: string;
  targetService: string;
  expectedRecordType: RecordType;
  resolvedByRecordId?: string;
  whatIfPresetId?: string;
}

export interface FalsificationProtocol {
  testAction: string;
  expectedIfTrue: string;
  expectedIfFalse: string;
  status: 'untested' | 'confirmed' | 'falsified' | 'inconclusive';
}

export interface Hypothesis {
  id: string;
  title: string;
  category: string;
  plausibilityScore: number; // 0-100 computed deterministically
  baselineScore: number;
  statusLabel: 'Leading Hypothesis' | 'Competing Co-Factor' | 'Low Plausibility' | 'Disproved';
  summary: string;
  supportingEvidence: EvidenceCitationReason[];
  contradictoryEvidence: EvidenceCitationReason[];
  missingInformation: MissingEvidenceItem[];
  confidenceLimitations: string[];
  falsificationTest: FalsificationProtocol;
}

export interface ServiceComponentStatus {
  name: string;
  tier: 'Edge' | 'Core API' | 'Data Store' | 'External Proxy';
  status: 'Degraded' | 'Critical' | 'Nominal';
  errorRate: string;
  p99Latency: string;
  ownerTeam: string;
}

export interface GeminiForensicAnalysis {
  generatedAt: string;
  mode: 'gemini-live' | 'deterministic-fallback';
  executionLabel: 'LIVE GEMINI' | 'DETERMINISTIC FALLBACK';
  modelUsed: string;
  requestedModel: string;
  requestStatus: string;
  httpStatusCode?: number;
  attempts: number;
  retried: boolean;
  errorMessage?: string | null;
  executiveSynthesis: string;
  groundedFacts: Array<{
    statement: string;
    citedRecordIds: string[];
  }>;
  hypothesisCritique: Array<{
    hypothesisId: string;
    assessment: string;
    keyUncertainty: string;
    citedRecordIds: string[];
    supportingRecordIds?: string[];
    contradictoryRecordIds?: string[];
  }>;
  unknownsAndGaps?: Array<{
    id: string;
    hypothesisId: string;
    targetService: string;
    description: string;
    status: 'UNRESOLVED' | 'RESOLVED';
    resolvedByRecordId?: string;
  }>;
  recommendedNextSteps: Array<{
    priority: 'IMMEDIATE' | 'NEXT' | 'FOLLOW_UP';
    action: string;
    rationaleRecordId: string;
  }>;
  ungroundedCitationsRemoved: string[];
}

export interface HistoricalResolution {
  summary: string;
  rootCauseConfirmed: string;
  remediationApplied: string;
  verifiedByRecordIds: string[];
  isDemoArchive?: boolean;
}

export interface IncidentInvestigation {
  id: string;
  title: string;
  severity: SeverityLevel;
  status: IncidentStatus;
  createdAt: string;
  updatedAt: string;
  commander: string;
  environment: string;
  summary: string;
  customerImpact: string;
  affectedServices: ServiceComponentStatus[];
  records: SourceRecord[];
  relationships: EvidenceRelationship[];
  hypotheses: Hypothesis[];
  recommendations: string[];
  geminiAnalysis?: GeminiForensicAnalysis;
  historicalResolution?: HistoricalResolution;
}

export interface WhatIfPreset {
  id: string;
  incidentId: string;
  title: string;
  description: string;
  expectedImpactBadge: string;
  recordToInject: SourceRecord;
  resolvesMissingId?: string;
  hypothesisImpacts: Array<{
    hypothesisId: string;
    role: 'supporting' | 'contradictory';
    reason: string;
    weight: number;
  }>;
}

export interface VerificationCheckResult {
  id: string;
  code: string;
  name: string;
  category: 'Provenance' | 'Graph Topology' | 'Chronology' | 'Epistemic Rigor' | 'Citation Coverage' | 'Security';
  status: 'PASS' | 'FAIL' | 'WARN';
  checkedCount: number;
  violationCount: number;
  summary: string;
  details: string[];
  offendingIds: string[];
  executedAt: string;
}

export interface IngestionValidationRow {
  rowIndex: number;
  rawRecord: Record<string, unknown>;
  sanitizedRecord?: SourceRecord;
  status: 'valid' | 'warning' | 'rejected';
  messages: string[];
}

export type ActiveScreen =
  | 'command-center'
  | 'workspace'
  | 'evidence-graph'
  | 'hypothesis-lab'
  | 'data-ingestion'
  | 'what-if-lab'
  | 'report'
  | 'verification-suite'
  | 'incident-memory';

export interface SimilarityDimensionBreakdown {
  dimension:
    | 'Service Overlap'
    | 'Error & Metric Signatures'
    | 'Deployment & Config Triggers'
    | 'Evidence Graph Topology'
    | 'Temporal & Anomaly Profile';
  score: number; // 0 to 100
  weight: number; // e.g., 0.30
  weightedContribution: number;
  explanation: string;
  matchedTokens: string[];
  currentRecordIds: string[];
  historicalRecordIds: string[];
}

export interface IncidentSimilarityComparison {
  currentIncidentId: string;
  historicalIncidentId: string;
  historicalTitle: string;
  historicalStatus: IncidentStatus;
  historicalSeverity: SeverityLevel;
  historicalUpdatedAt: string;
  isDemoRecord: boolean;
  overallMatchScore: number; // 0-100 Structural & Evidentiary Similarity (NOT root-cause probability)
  classification:
    | 'HIGH PATTERN MATCH'
    | 'PARTIAL PATTERN MATCH'
    | 'WEAK / INCIDENTAL OVERLAP'
    | 'UNRELATED'
    | 'LOW EVIDENCE';
  lowEvidenceWarning: string | null;
  scoringMethodologyNote: string;
  dimensions: SimilarityDimensionBreakdown[];
  sharedEvidence: Array<{
    category: string;
    description: string;
    currentRecordIds: string[];
    historicalRecordIds: string[];
  }>;
  conflictingAndDivergentEvidence: Array<{
    category: string;
    description: string;
    currentRecordIds: string[];
    historicalRecordIds: string[];
    epistemicImpact: string;
  }>;
  missingInCurrentIncident: Array<{
    description: string;
    targetService: string;
    historicalPrecedentRecordIds: string[];
  }>;
  documentedHistoricalResolution: {
    available: boolean;
    summary: string;
    rootCauseConfirmed: string;
    remediationApplied: string;
    verifiedByRecordIds: string[];
  };
  verificationRecommendations: Array<{
    priority: 'IMMEDIATE' | 'HIGH' | 'FOLLOW_UP';
    action: string;
    rationale: string;
    citedRecordIds: string[];
  }>;
}

export interface RecurringPatternItem {
  id: string;
  patternType: 'ERROR_SIGNATURE' | 'SERVICE_DEPENDENCY' | 'DEPLOYMENT_TRIGGER';
  signature: string;
  occurrencesCount: number;
  totalCorpusSize: number;
  incidentIds: string[];
  citedRecordIds: string[];
  affectedServices: string[];
  explanation: string;
  sampleSizeLimitation: string;
}

export interface GeminiMemoryComparisonSynthesis {
  generatedAt: string;
  mode: 'gemini-live' | 'deterministic-fallback';
  executionLabel: 'LIVE GEMINI' | 'DETERMINISTIC FALLBACK';
  modelUsed: string;
  requestedModel: string;
  requestStatus: string;
  httpStatusCode?: number;
  attempts: number;
  retried: boolean;
  errorMessage?: string | null;
  currentIncidentId: string;
  historicalIncidentId: string;
  executiveComparison: string;
  keySimilarities: Array<{
    statement: string;
    citedRecordIds: string[];
  }>;
  criticalDifferencesAndConflicts: Array<{
    statement: string;
    citedRecordIds: string[];
  }>;
  recommendedVerificationSteps: Array<{
    action: string;
    citedRecordIds: string[];
  }>;
  epistemicCaveat: string;
  ungroundedCitationsRemoved: string[];
}

export interface WhatIfSimulationEntry {
  id: string;
  incidentId: string;
  timestamp: string;
  actionType:
    | 'preset_injected'
    | 'preset_removed'
    | 'custom_injected'
    | 'scenario_reset';
  recordId?: string;
  title: string;
  summary: string;
  hypothesisDeltas: Array<{
    hypothesisId: string;
    beforeScore: number;
    afterScore: number;
  }>;
}

export interface SavedReportSnapshot {
  id: string;
  incidentId: string;
  incidentTitle: string;
  savedAt: string;
  completenessPercentage: number;
  passedChecks: number;
  totalChecks: number;
  synthesisExecutionLabel: string;
  markdownReport: string;
}

export interface PersistedWorkspaceEnvelope {
  schemaVersion: '2.0.0';
  storageEngine: 'browser-localStorage';
  savedAt: string;
  selectedIncidentId: string;
  selectedRecordId: string | null;
  activePresetIds: string[];
  incidents: IncidentInvestigation[];
  whatIfHistory: WhatIfSimulationEntry[];
  savedReports: SavedReportSnapshot[];
}

export interface InvestigationBackupBundle {
  bundleType:
    | 'trace-ai-investigation-backup-v2'
    | 'trace-ai-workspace-backup-v2';
  schemaVersion: '2.0.0';
  exportedAt: string;
  storageScope: 'single-browser-local-demo';
  incident?: IncidentInvestigation;
  incidents?: IncidentInvestigation[];
  whatIfHistory?: WhatIfSimulationEntry[];
  savedReports?: SavedReportSnapshot[];
}
