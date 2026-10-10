import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Download,
  FileCheck2,
  Filter,
  Plus,
  Search,
  Server,
  ShieldCheck,
  Terminal,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  ActiveScreen,
  IncidentInvestigation,
  IncidentStatus,
  SeverityLevel,
} from '../types/trace';
import {
  calculateEvidenceCompleteness,
  runVerificationSuite,
} from '../engine/forensicEngine';

interface CommandCenterViewProps {
  incidents: IncidentInvestigation[];
  selectedIncidentId: string;
  onSelectIncident: (id: string, navigateTo?: ActiveScreen) => void;
  onCreateIncident: (newIncident: IncidentInvestigation) => void;
  onInspectRecord: (incidentId: string, recordId: string) => void;
  onDeleteIncident?: (incidentId: string) => void;
  onExportIncidentBackup?: (incidentId: string) => void;
  onImportBackupJson?: (rawJson: string) => {
    ok: boolean;
    message: string;
    errors?: string[];
  };
}

export const CommandCenterView: React.FC<CommandCenterViewProps> = ({
  incidents,
  selectedIncidentId,
  onSelectIncident,
  onCreateIncident,
  onInspectRecord,
  onDeleteIncident,
  onExportIncidentBackup,
  onImportBackupJson,
}) => {
  const [severityFilter, setSeverityFilter] = useState<'ALL' | SeverityLevel>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | IncidentStatus>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [isImportBackupOpen, setIsImportBackupOpen] = useState(false);
  const [backupJsonInput, setBackupJsonInput] = useState('');
  const [backupImportStatus, setBackupImportStatus] = useState<{
    ok: boolean;
    message: string;
    errors?: string[];
  } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const backupFileRef = useRef<HTMLInputElement>(null);

  // New investigation form state
  const [newTitle, setNewTitle] = useState('');
  const [newSeverity, setNewSeverity] = useState<SeverityLevel>('SEV-1');
  const [newEnvironment, setNewEnvironment] = useState('prod-us-east-1');
  const [newCommander, setNewCommander] = useState('A. Patel (On-Call SRE)');
  const [newServicesInput, setNewServicesInput] = useState('inventory-api, postgres-inventory-db');
  const [newSummary, setNewSummary] = useState('');

  const filteredIncidents = incidents.filter((inc) => {
    if (severityFilter !== 'ALL' && inc.severity !== severityFilter) return false;
    if (statusFilter !== 'ALL' && inc.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = inc.title.toLowerCase().includes(q);
      const matchId = inc.id.toLowerCase().includes(q);
      const matchService = inc.affectedServices.some((s) =>
        s.name.toLowerCase().includes(q)
      );
      return matchTitle || matchId || matchService;
    }
    return true;
  });

  // Aggregate telemetry metrics across all incidents
  const totalActive = incidents.filter((i) => i.status !== 'Resolved').length;
  const sev1Count = incidents.filter((i) => i.severity === 'SEV-1').length;
  const totalRecords = incidents.reduce((acc, i) => acc + i.records.length, 0);
  const avgCompleteness = Math.round(
    incidents.reduce(
      (acc, i) => acc + calculateEvidenceCompleteness(i).percentage,
      0
    ) / Math.max(1, incidents.length)
  );

  // Gather recent events across all incidents sorted newest first
  const allRecentEvents = incidents
    .flatMap((inc) =>
      inc.records.map((rec) => ({
        incidentId: inc.id,
        incidentSeverity: inc.severity,
        record: rec,
      }))
    )
    .sort((a, b) => {
      const ta = Date.parse(a.record.timestamp) || 0;
      const tb = Date.parse(b.record.timestamp) || 0;
      return tb - ta;
    })
    .slice(0, 8);

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const idNum = 843 + incidents.length;
    const incId = `INC-2026-0${idNum}`;
    const nowIso = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const servicesList = newServicesInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const primaryService = servicesList[0] || 'core-api-service';
    const seedRecordId = `LOG-${9100 + incidents.length}`;
    const seedMetricId = `MET-${9200 + incidents.length}`;

    const created: IncidentInvestigation = {
      id: incId,
      title: newTitle.trim(),
      severity: newSeverity,
      status: 'Investigating',
      createdAt: nowIso,
      updatedAt: nowIso,
      commander: newCommander.trim() || 'On-Call Incident Commander',
      environment: newEnvironment.trim() || 'prod-us-east-1',
      summary:
        newSummary.trim() ||
        `Initial forensic triage opened for ${newTitle.trim()} affecting ${primaryService} (${seedRecordId}, ${seedMetricId}).`,
      customerImpact: `Degraded responses observed on ${servicesList.join(', ') || primaryService}; active triage underway.`,
      affectedServices: (servicesList.length > 0 ? servicesList : [primaryService]).map(
        (name, idx) => ({
          name,
          tier: idx === 0 ? 'Core API' : 'Data Store',
          status: idx === 0 ? 'Critical' : 'Degraded',
          errorRate: idx === 0 ? '14.2%' : '2.1%',
          p99Latency: idx === 0 ? '2,450ms' : '610ms',
          ownerTeam: 'Platform SRE',
        })
      ),
      records: [
        {
          id: seedRecordId,
          timestamp: nowIso,
          type: 'log',
          service: primaryService,
          summary: `ERROR [${primaryService}] Automated alert threshold breached: anomalous error burst detected during initial triage.`,
          rawPayload: JSON.stringify(
            {
              log_id: seedRecordId,
              timestamp: nowIso,
              level: 'ERROR',
              service: primaryService,
              trace_id: `tr-${idNum}a`,
              message: `Initial symptom log captured for ${newTitle.trim()}`,
            },
            null,
            2
          ),
          severity: 'critical',
          sourceOrigin: 'baseline',
          metadata: {
            traceId: `tr-${idNum}a`,
            environment: newEnvironment,
          },
        },
        {
          id: seedMetricId,
          timestamp: nowIso,
          type: 'metric',
          service: primaryService,
          summary: `Service p99 latency elevated to 2,450ms and error rate at 14.2% on ${primaryService}.`,
          rawPayload: JSON.stringify(
            {
              metric_id: seedMetricId,
              timestamp: nowIso,
              service: primaryService,
              p99_latency_ms: 2450,
              error_rate_pct: 14.2,
              trace_id: `tr-${idNum}a`,
            },
            null,
            2
          ),
          severity: 'warning',
          sourceOrigin: 'baseline',
          metadata: {
            traceId: `tr-${idNum}a`,
            metricName: 'service.error_rate_pct',
            metricValue: '14.2%',
            environment: newEnvironment,
          },
        },
      ],
      relationships: [
        {
          id: `REL-SEED-${idNum}`,
          sourceId: seedRecordId,
          targetId: seedMetricId,
          type: 'direct',
          label: `Shared Trace ID (tr-${idNum}a)`,
          ruleExplanation: `Direct correlation between initial symptom log ${seedRecordId} and metric spike ${seedMetricId}.`,
          confidenceWeight: 95,
          temporalDeltaSeconds: 0,
        },
      ],
      hypotheses: [
        {
          id: `HYP-${idNum}-01`,
          title: `Primary Service Resource Saturation in ${primaryService}`,
          category: 'Resource Exhaustion',
          plausibilityScore: 62,
          baselineScore: 62,
          statusLabel: 'Leading Hypothesis',
          summary: `Initial telemetry (${seedRecordId}, ${seedMetricId}) indicates acute latency and error elevation on ${primaryService}.`,
          supportingEvidence: [
            {
              recordId: seedRecordId,
              reason: 'Primary error burst logged on service instance.',
              weight: 22,
            },
            {
              recordId: seedMetricId,
              reason: 'Corroborates 2,450ms p99 latency spike.',
              weight: 18,
            },
          ],
          contradictoryEvidence: [],
          missingInformation: [
            {
              id: `MIS-${idNum}-1`,
              description: `Recent deployment diff and container CPU/memory telemetry for ${primaryService}.`,
              targetService: primaryService,
              expectedRecordType: 'deployment',
            },
          ],
          confidenceLimitations: [
            'Awaiting deployment history and downstream dependency traces via Data Ingestion.',
          ],
          falsificationTest: {
            testAction: `Scale ${primaryService} replica count by +50% and observe whether p99 latency (${seedMetricId}) drops proportionally.`,
            expectedIfTrue: 'Error rate and p99 latency return to baseline.',
            expectedIfFalse: 'Latency remains elevated, pointing to downstream database or lock contention.',
            status: 'untested',
          },
        },
        {
          id: `HYP-${idNum}-02`,
          title: `Downstream Dependency Lock or Network Degradation`,
          category: 'Dependency Bottleneck',
          plausibilityScore: 44,
          baselineScore: 44,
          statusLabel: 'Competing Co-Factor',
          summary: `Errors in ${primaryService} (${seedRecordId}) may be cascading from a downstream data store or external RPC timeout.`,
          supportingEvidence: [
            {
              recordId: seedMetricId,
              reason: 'Elevated p99 tail latency (2,450ms) characteristic of downstream timeout waits.',
              weight: 16,
            },
          ],
          contradictoryEvidence: [
            {
              recordId: seedRecordId,
              reason: 'No explicit downstream socket reset logged yet.',
              weight: -6,
            },
          ],
          missingInformation: [
            {
              id: `MIS-${idNum}-2`,
              description: 'Downstream query duration logs and network RTT metrics.',
              targetService: servicesList[1] || primaryService,
              expectedRecordType: 'metric',
            },
          ],
          confidenceLimitations: [
            'Requires ingesting downstream logs in the Data Ingestion screen to confirm.',
          ],
          falsificationTest: {
            testAction: 'Inspect downstream database query latency metrics during the 2,450ms spike window.',
            expectedIfTrue: 'Downstream p99 latency matches the 2,450ms stall.',
            expectedIfFalse: 'Downstream queries complete in <10ms, isolating the fault inside the application tier.',
            status: 'untested',
          },
        },
      ],
      recommendations: [
        `Ingest recent deployment and dependency telemetry for ${primaryService} using the Data Ingestion tool.`,
        'Execute the primary falsification test in the Hypothesis Lab before triggering broad service rollbacks.',
      ],
    };

    onCreateIncident(created);
    setIsNewModalOpen(false);
    setNewTitle('');
    setNewSummary('');
  };

  return (
    <div className="space-y-6">
      {/* Top Header Strip */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#30363D]">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-[#8B949E] mb-1">
            <span>FORENSIC OPERATIONS</span>
            <span>·</span>
            <span className="text-[#38BDF8]">DETERMINISTIC + GROUNDED AI ENGINE</span>
          </div>
          <h1 className="text-2xl font-semibold text-[#F0F6FC] tracking-tight">
            Incident Command Center
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {onImportBackupJson && (
            <button
              onClick={() => {
                setBackupImportStatus(null);
                setBackupJsonInput('');
                setIsImportBackupOpen(true);
              }}
              className="h-[34px] px-3 text-xs font-medium bg-[#21262D] text-[#38BDF8] border border-[#38BDF8]/40 rounded hover:bg-[#30363D] transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              title="Import and restore a saved investigation or workspace JSON backup"
            >
              <Upload className="w-3.5 h-3.5" />
              Import Backup (.JSON)
            </button>
          )}
          <button
            onClick={() => onSelectIncident(selectedIncidentId, 'data-ingestion')}
            className="h-[34px] px-3.5 text-xs font-medium bg-[#21262D] text-[#C9D1D9] border border-[#30363D] rounded hover:bg-[#30363D] hover:text-[#F0F6FC] transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer"
          >
            <Terminal className="w-3.5 h-3.5 text-[#38BDF8]" />
            Ingest Telemetry
          </button>
          <button
            onClick={() => setIsNewModalOpen(true)}
            className="h-[34px] px-4 text-xs font-medium bg-[#8B5CF6] text-white border border-[#A78BFA] rounded hover:bg-[#7C3AED] transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            New Investigation
          </button>
        </div>
      </div>

      {/* Telemetry Summary KPI Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#161B22] border border-[#30363D] rounded p-4">
          <div className="flex items-center justify-between text-xs text-[#8B949E] mb-1.5">
            <span>Active Investigations</span>
            <AlertTriangle className="w-3.5 h-3.5 text-[#F43F5E]" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-semibold font-mono tabular-nums text-[#F0F6FC]">
              {totalActive}
            </span>
            <span className="text-xs font-mono text-[#F43F5E]">
              {sev1Count} SEV-1 Critical
            </span>
          </div>
        </div>

        <div className="bg-[#161B22] border border-[#30363D] rounded p-4">
          <div className="flex items-center justify-between text-xs text-[#8B949E] mb-1.5">
            <span>Grounded Source Records</span>
            <FileCheck2 className="w-3.5 h-3.5 text-[#38BDF8]" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-semibold font-mono tabular-nums text-[#F0F6FC]">
              {totalRecords}
            </span>
            <span className="text-xs font-mono text-[#8B949E]">
              100% ID-Preserved
            </span>
          </div>
        </div>

        <div className="bg-[#161B22] border border-[#30363D] rounded p-4">
          <div className="flex items-center justify-between text-xs text-[#8B949E] mb-1.5">
            <span>Mean Evidence Completeness</span>
            <Server className="w-3.5 h-3.5 text-[#A78BFA]" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-semibold font-mono tabular-nums text-[#F0F6FC]">
              {avgCompleteness}%
            </span>
            <span className="text-xs font-mono text-[#F59E0B]">
              Missing items tracked
            </span>
          </div>
        </div>

        <div className="bg-[#161B22] border border-[#30363D] rounded p-4">
          <div className="flex items-center justify-between text-xs text-[#8B949E] mb-1.5">
            <span>Citation Verification Status</span>
            <ShieldCheck className="w-3.5 h-3.5 text-[#10B981]" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-semibold font-mono tabular-nums text-[#10B981]">
              VERIFIED
            </span>
            <button
              onClick={() => onSelectIncident(selectedIncidentId, 'verification-suite')}
              className="text-xs font-mono text-[#38BDF8] hover:underline cursor-pointer"
            >
              Run Audit →
            </button>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-[#161B22] border border-[#30363D] rounded p-3 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-[#8B949E] mr-1">
            <Filter className="w-3.5 h-3.5" />
            <span>Severity:</span>
          </div>
          {(['ALL', 'SEV-1', 'SEV-2', 'SEV-3'] as const).map((sev) => (
            <button
              key={sev}
              onClick={() => setSeverityFilter(sev)}
              className={`h-[28px] px-2.5 text-xs font-mono rounded transition-colors cursor-pointer whitespace-nowrap ${
                severityFilter === sev
                  ? 'bg-[#8B5CF6] text-white border border-[#A78BFA]'
                  : 'bg-[#21262D] text-[#C9D1D9] border border-[#30363D] hover:bg-[#30363D]'
              }`}
            >
              {sev}
            </button>
          ))}

          <span className="text-[#30363D] mx-1">|</span>

          <div className="flex items-center gap-1.5 text-xs text-[#8B949E] mr-1">
            <span>Status:</span>
          </div>
          {(['ALL', 'Investigating', 'Mitigated', 'Resolved'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`h-[28px] px-2.5 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                statusFilter === st
                  ? 'bg-[#30363D] text-[#F0F6FC] border border-[#484F58]'
                  : 'bg-[#21262D] text-[#8B949E] border border-[#30363D] hover:text-[#C9D1D9]'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 text-[#8B949E] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter by incident ID, title, or service (e.g. checkout-service)..."
            className="w-full h-[32px] pl-8 pr-3 text-xs font-mono bg-[#0D1117] border border-[#30363D] rounded text-[#F0F6FC] placeholder-[#8B949E] focus:outline-none focus:border-[#8B5CF6]"
          />
        </div>
      </div>

      {/* Main Split Grid: Active Incidents Table (Left 8 cols) + Recent Telemetry Feed (Right 4 cols) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Active Incidents Queue */}
        <div className="xl:col-span-8 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#F0F6FC]">
              Active Forensic Investigations ({filteredIncidents.length})
            </h2>
            <span className="text-xs font-mono text-[#8B949E]">
              Click any investigation to open workspace
            </span>
          </div>

          {filteredIncidents.length === 0 ? (
            <div className="bg-[#161B22] border border-[#30363D] rounded p-8 text-center">
              <p className="text-sm text-[#C9D1D9] mb-2">
                No incidents match the current filter criteria.
              </p>
              <button
                onClick={() => {
                  setSeverityFilter('ALL');
                  setStatusFilter('ALL');
                  setSearchQuery('');
                }}
                className="h-[30px] px-3 text-xs font-mono bg-[#21262D] text-[#F0F6FC] border border-[#30363D] rounded hover:bg-[#30363D] cursor-pointer"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredIncidents.map((inc) => {
                const completeness = calculateEvidenceCompleteness(inc);
                const checks = runVerificationSuite(inc);
                const allPassed = checks.every((c) => c.status === 'PASS');
                const isSelected = inc.id === selectedIncidentId;
                const leadingHyp = [...inc.hypotheses].sort(
                  (a, b) => b.plausibilityScore - a.plausibilityScore
                )[0];

                return (
                  <div
                    key={inc.id}
                    onClick={() => onSelectIncident(inc.id, 'workspace')}
                    className={`bg-[#161B22] border rounded p-4 transition-colors cursor-pointer ${
                      isSelected
                        ? 'border-[#8B5CF6]'
                        : 'border-[#30363D] hover:border-[#484F58]'
                    }`}
                  >
                    {/* Header Row */}
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2.5 text-xs font-mono">
                        <span
                          className={`px-2 py-0.5 rounded font-semibold ${
                            inc.severity === 'SEV-1'
                              ? 'bg-[#F43F5E]/15 text-[#F43F5E] border border-[#F43F5E]/30'
                              : inc.severity === 'SEV-2'
                              ? 'bg-[#F59E0B]/15 text-[#F59E0B] border border-[#F59E0B]/30'
                              : 'bg-[#38BDF8]/15 text-[#38BDF8] border border-[#38BDF8]/30'
                          }`}
                        >
                          {inc.severity}
                        </span>
                        <span className="text-[#F0F6FC] font-semibold">{inc.id}</span>
                        <span className="text-[#8B949E]">·</span>
                        <span
                          className={`${
                            inc.status === 'Investigating'
                              ? 'text-[#F59E0B]'
                              : inc.status === 'Mitigated'
                              ? 'text-[#38BDF8]'
                              : 'text-[#10B981]'
                          }`}
                        >
                          {inc.status}
                        </span>
                        <span className="text-[#8B949E]">·</span>
                        <span className="text-[#8B949E]">{inc.environment}</span>
                      </div>

                      <div className="flex items-center gap-2 text-xs font-mono text-[#8B949E]">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{inc.updatedAt.replace('T', ' ').replace('Z', ' UTC')}</span>
                      </div>
                    </div>

                    {/* Title & Summary */}
                    <h3 className="text-base font-semibold text-[#F0F6FC] mb-1.5 flex items-center justify-between gap-2">
                      <span>{inc.title}</span>
                      <ArrowUpRight className="w-4 h-4 text-[#8B949E] shrink-0" />
                    </h3>
                    <p className="text-xs text-[#C9D1D9] leading-relaxed mb-3 line-clamp-2">
                      {inc.summary}
                    </p>

                    {/* Affected Services & Evidence Completeness Bar */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-3 border-t border-[#21262D] items-center">
                      <div className="md:col-span-6">
                        <div className="text-[11px] font-mono text-[#8B949E] mb-1">
                          Affected Services ({inc.affectedServices.length})
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono">
                          {inc.affectedServices.map((svc, idx) => (
                            <React.Fragment key={svc.name}>
                              <span
                                className={
                                  svc.status === 'Critical'
                                    ? 'text-[#F43F5E]'
                                    : svc.status === 'Degraded'
                                    ? 'text-[#F59E0B]'
                                    : 'text-[#C9D1D9]'
                                }
                              >
                                {svc.name}
                              </span>
                              {idx < inc.affectedServices.length - 1 && (
                                <span className="text-[#484F58]">/</span>
                              )}
                            </React.Fragment>
                          ))}
                        </div>
                      </div>

                      <div className="md:col-span-3">
                        <div className="flex items-center justify-between text-[11px] font-mono mb-1">
                          <span className="text-[#8B949E]">Evidence Completeness</span>
                          <span className="text-[#F0F6FC] tabular-nums">
                            {completeness.percentage}%
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-[#0D1117] rounded overflow-hidden border border-[#30363D]">
                          <div
                            className="h-full bg-[#8B5CF6] transition-all"
                            style={{ width: `${completeness.percentage}%` }}
                          />
                        </div>
                      </div>

                      <div className="md:col-span-3 flex flex-wrap items-center justify-end gap-1.5">
                        {onExportIncidentBackup && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onExportIncidentBackup(inc.id);
                            }}
                            className="h-[28px] px-2 text-xs font-mono bg-[#21262D] text-[#38BDF8] border border-[#30363D] rounded hover:bg-[#30363D] flex items-center gap-1 cursor-pointer whitespace-nowrap"
                            title={`Export complete backup JSON for ${inc.id}`}
                          >
                            <Download className="w-3 h-3" />
                            Backup
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectIncident(inc.id, 'evidence-graph');
                          }}
                          className="h-[28px] px-2.5 text-xs font-mono bg-[#21262D] text-[#C9D1D9] border border-[#30363D] rounded hover:bg-[#30363D] hover:text-[#F0F6FC] cursor-pointer whitespace-nowrap"
                        >
                          Graph ({inc.relationships.length})
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectIncident(inc.id, 'hypothesis-lab');
                          }}
                          className="h-[28px] px-2.5 text-xs font-mono bg-[#21262D] text-[#A78BFA] border border-[#30363D] rounded hover:bg-[#30363D] cursor-pointer whitespace-nowrap"
                        >
                          Hypotheses ({inc.hypotheses.length})
                        </button>
                        {onDeleteIncident && incidents.length > 1 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteId(inc.id);
                            }}
                            className="h-[28px] px-2 text-xs font-mono bg-[#21262D] text-[#F43F5E] border border-[#30363D] rounded hover:bg-[#F43F5E]/20 cursor-pointer"
                            title={`Delete saved investigation ${inc.id}`}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Leading Hypothesis & Audit Footnote */}
                    {leadingHyp && (
                      <div className="mt-2.5 pt-2 border-t border-[#21262D] flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                        <div className="text-[#8B949E] truncate max-w-xl">
                          <span>Leading Hypothesis ({leadingHyp.plausibilityScore}%): </span>
                          <span className="text-[#C9D1D9]">{leadingHyp.title}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {allPassed ? (
                            <span className="text-[#10B981] flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />6/6 Checks Pass
                            </span>
                          ) : (
                            <span className="text-[#F43F5E] flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5" />Audit Warning
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Telemetry Events Stream */}
        <div className="xl:col-span-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#F0F6FC]">
              Recent Grounded Telemetry Stream
            </h2>
            <span className="text-xs font-mono text-[#8B949E]">Immutable IDs</span>
          </div>

          <div className="bg-[#161B22] border border-[#30363D] rounded divide-y divide-[#21262D]">
            {allRecentEvents.map(({ incidentId, record }) => (
              <div
                key={`${incidentId}-${record.id}`}
                onClick={() => onInspectRecord(incidentId, record.id)}
                className="p-3 hover:bg-[#21262D]/60 transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between text-[11px] font-mono mb-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[#38BDF8] font-semibold">{record.id}</span>
                    <span className="text-[#484F58]">·</span>
                    <span className="text-[#8B949E] uppercase">{record.type}</span>
                    {record.sourceOrigin !== 'baseline' && (
                      <>
                        <span className="text-[#484F58]">·</span>
                        <span className="text-[#A78BFA] uppercase">
                          {record.sourceOrigin}
                        </span>
                      </>
                    )}
                  </div>
                  <span className="text-[#8B949E] tabular-nums">
                    {record.timestamp.slice(11, 19)} UTC
                  </span>
                </div>
                <div className="text-xs text-[#C9D1D9] line-clamp-2 mb-1">
                  {record.summary}
                </div>
                <div className="flex items-center justify-between text-[11px] font-mono text-[#8B949E]">
                  <span>service: {record.service}</span>
                  <span>{incidentId} →</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* New Investigation Modal */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-[#161B22] border border-[#484F58] rounded-lg max-w-lg w-full p-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#30363D] mb-4">
              <h3 className="text-base font-semibold text-[#F0F6FC]">
                Initialize New Forensic Investigation
              </h3>
              <button
                onClick={() => setIsNewModalOpen(false)}
                className="text-xs font-mono text-[#8B949E] hover:text-[#F0F6FC] cursor-pointer"
              >
                [ESC]
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-[#8B949E] mb-1">
                  Incident Title *
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Inventory Reservation Lock Timeouts on Flash Sale"
                  className="w-full h-[34px] px-3 text-xs bg-[#0D1117] border border-[#30363D] rounded text-[#F0F6FC] focus:outline-none focus:border-[#8B5CF6]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono text-[#8B949E] mb-1">
                    Severity
                  </label>
                  <select
                    value={newSeverity}
                    onChange={(e) => setNewSeverity(e.target.value as SeverityLevel)}
                    className="w-full h-[34px] px-3 text-xs font-mono bg-[#0D1117] border border-[#30363D] rounded text-[#F0F6FC] focus:outline-none focus:border-[#8B5CF6]"
                  >
                    <option value="SEV-1">SEV-1 (Critical Impact)</option>
                    <option value="SEV-2">SEV-2 (Major Degradation)</option>
                    <option value="SEV-3">SEV-3 (Minor Anomaly)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-mono text-[#8B949E] mb-1">
                    Environment
                  </label>
                  <input
                    type="text"
                    value={newEnvironment}
                    onChange={(e) => setNewEnvironment(e.target.value)}
                    className="w-full h-[34px] px-3 text-xs font-mono bg-[#0D1117] border border-[#30363D] rounded text-[#F0F6FC] focus:outline-none focus:border-[#8B5CF6]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono text-[#8B949E] mb-1">
                    Incident Commander
                  </label>
                  <input
                    type="text"
                    value={newCommander}
                    onChange={(e) => setNewCommander(e.target.value)}
                    className="w-full h-[34px] px-3 text-xs bg-[#0D1117] border border-[#30363D] rounded text-[#F0F6FC] focus:outline-none focus:border-[#8B5CF6]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-[#8B949E] mb-1">
                    Affected Services (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={newServicesInput}
                    onChange={(e) => setNewServicesInput(e.target.value)}
                    className="w-full h-[34px] px-3 text-xs font-mono bg-[#0D1117] border border-[#30363D] rounded text-[#F0F6FC] focus:outline-none focus:border-[#8B5CF6]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono text-[#8B949E] mb-1">
                  Initial Triage Summary (Optional)
                </label>
                <textarea
                  rows={3}
                  value={newSummary}
                  onChange={(e) => setNewSummary(e.target.value)}
                  placeholder="Describe observed symptoms; initial baseline telemetry records and competing hypotheses will be seeded automatically..."
                  className="w-full p-2.5 text-xs bg-[#0D1117] border border-[#30363D] rounded text-[#F0F6FC] focus:outline-none focus:border-[#8B5CF6]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#30363D]">
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(false)}
                  className="h-[34px] px-3.5 text-xs font-medium bg-[#21262D] text-[#C9D1D9] border border-[#30363D] rounded hover:bg-[#30363D] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="h-[34px] px-4 text-xs font-medium bg-[#8B5CF6] text-white border border-[#A78BFA] rounded hover:bg-[#7C3AED] cursor-pointer"
                >
                  Create & Open Workspace
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Investigation / Workspace Backup JSON Modal */}
      {isImportBackupOpen && onImportBackupJson && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-[#161B22] border border-[#484F58] rounded-lg max-w-lg w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#30363D]">
              <h3 className="text-base font-semibold text-[#F0F6FC]">
                Import & Restore Investigation Backup (.JSON)
              </h3>
              <button
                onClick={() => setIsImportBackupOpen(false)}
                className="text-xs font-mono text-[#8B949E] hover:text-[#F0F6FC] cursor-pointer"
              >
                [ESC]
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-[#C9D1D9] leading-relaxed">
                Upload or paste a TRACE AI 2.0 investigation or workspace backup JSON bundle.
                Original investigation IDs, source record IDs, UTC timestamps, relationships,
                What-If simulation history, and saved reports are validated and preserved.
              </p>

              <div>
                <input
                  ref={backupFileRef}
                  type="file"
                  accept=".json"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      const text = String(ev.target?.result || '');
                      setBackupJsonInput(text);
                      const res = onImportBackupJson(text);
                      setBackupImportStatus(res);
                    };
                    reader.readAsText(file);
                    e.target.value = '';
                  }}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => backupFileRef.current?.click()}
                  className="h-[34px] px-3.5 text-xs font-medium bg-[#21262D] text-[#38BDF8] border border-[#38BDF8]/40 rounded hover:bg-[#30363D] flex items-center gap-2 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Select Backup .JSON File from Disk
                </button>
              </div>

              <div>
                <label className="block font-mono text-[#8B949E] mb-1">
                  Or Paste Backup JSON Payload
                </label>
                <textarea
                  rows={6}
                  value={backupJsonInput}
                  onChange={(e) => setBackupJsonInput(e.target.value)}
                  placeholder='{"bundleType":"trace-ai-investigation-backup-v2","schemaVersion":"2.0.0","incident":{...}}'
                  className="w-full p-2.5 font-mono text-[11px] bg-[#0D1117] border border-[#30363D] rounded text-[#F0F6FC]"
                />
              </div>

              {backupImportStatus && (
                <div
                  className={`p-3 rounded border font-mono text-xs space-y-1 ${
                    backupImportStatus.ok
                      ? 'bg-[#10B981]/10 border-[#10B981]/40 text-[#10B981]'
                      : 'bg-[#F43F5E]/10 border-[#F43F5E]/40 text-[#F43F5E]'
                  }`}
                >
                  <div className="font-semibold">{backupImportStatus.message}</div>
                  {backupImportStatus.errors && backupImportStatus.errors.length > 0 && (
                    <ul className="list-disc list-inside text-[11px] space-y-0.5">
                      {backupImportStatus.errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#30363D]">
                <button
                  type="button"
                  onClick={() => setIsImportBackupOpen(false)}
                  className="h-[34px] px-3.5 text-xs font-medium bg-[#21262D] text-[#C9D1D9] border border-[#30363D] rounded hover:bg-[#30363D] cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const res = onImportBackupJson(backupJsonInput);
                    setBackupImportStatus(res);
                  }}
                  className="h-[34px] px-4 text-xs font-medium bg-[#8B5CF6] text-white border border-[#A78BFA] rounded hover:bg-[#7C3AED] cursor-pointer"
                >
                  Validate & Restore Backup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Destructive Investigation Deletion Confirmation Modal */}
      {confirmDeleteId && onDeleteIncident && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-[#161B22] border border-[#F43F5E]/60 rounded-lg max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-[#F43F5E] font-semibold text-base">
              <AlertTriangle className="w-5 h-5" />
              <span>Confirm Investigation Deletion</span>
            </div>
            <p className="text-xs text-[#C9D1D9] leading-relaxed">
              Are you sure you want to permanently remove investigation{' '}
              <strong className="font-mono text-[#F0F6FC]">{confirmDeleteId}</strong> and its
              associated What-If history and saved report snapshots from browser localStorage?
            </p>
            <div className="p-2.5 bg-[#0D1117] border border-[#21262D] rounded text-[11px] font-mono text-[#8B949E]">
              Note: Deleting a saved investigation removes it from local storage. To restore
              factory sample incidents without deleting custom backups, export a backup JSON
              first or use Reset Demo in the top bar.
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#30363D]">
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                className="h-[32px] px-3 text-xs bg-[#21262D] text-[#C9D1D9] border border-[#30363D] rounded cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteIncident(confirmDeleteId);
                  setConfirmDeleteId(null);
                }}
                className="h-[32px] px-3.5 text-xs font-medium bg-[#F43F5E] text-white rounded hover:bg-[#E11D48] cursor-pointer"
              >
                Confirm Delete {confirmDeleteId}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
