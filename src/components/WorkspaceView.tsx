import React, { useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Clock,
  Code2,
  Cpu,
  ExternalLink,
  FileText,
  Filter,
  GitBranch,
  Layers,
  Loader2,
  Plus,
  Search,
  Server,
  ShieldAlert,
} from 'lucide-react';
import {
  ActiveScreen,
  IncidentInvestigation,
  IncidentStatus,
  RecordType,
  SourceRecord,
} from '../types/trace';
import { calculateEvidenceCompleteness } from '../engine/forensicEngine';
import { rankRelatedIncidents } from '../engine/patternDetectiveEngine';

interface WorkspaceViewProps {
  incidents: IncidentInvestigation[];
  incident: IncidentInvestigation;
  selectedRecordId: string | null;
  onSelectIncident: (id: string) => void;
  onUpdateStatus: (status: IncidentStatus) => void;
  onSelectRecord: (recordId: string) => void;
  onNavigate: (screen: ActiveScreen) => void;
  onOpenMemoryComparison?: (historicalIncidentId: string) => void;
  onAddObservation: (record: SourceRecord) => void;
  onRunGeminiAnalysis: () => Promise<void>;
  isAnalyzingGemini: boolean;
  geminiError: string | null;
}

export const WorkspaceView: React.FC<WorkspaceViewProps> = ({
  incidents,
  incident,
  selectedRecordId,
  onSelectIncident,
  onUpdateStatus,
  onSelectRecord,
  onNavigate,
  onOpenMemoryComparison,
  onAddObservation,
  onRunGeminiAnalysis,
  isAnalyzingGemini,
  geminiError,
}) => {
  const relatedIncidents = rankRelatedIncidents(incident, incidents);
  const [timelineTypeFilter, setTimelineTypeFilter] = useState<'all' | RecordType>('all');
  const [recordSearch, setRecordSearch] = useState('');
  const [isAddRecordOpen, setIsAddRecordOpen] = useState(false);

  // Add Observation form state
  const [obsId, setObsId] = useState(`LOG-${4450 + incident.records.length}`);
  const [obsType, setObsType] = useState<RecordType>('log');
  const [obsService, setObsService] = useState(
    incident.affectedServices[0]?.name || 'checkout-service'
  );
  const [obsSeverity, setObsSeverity] = useState<'critical' | 'warning' | 'info'>('warning');
  const [obsSummary, setObsSummary] = useState('');
  const [obsTraceId, setObsTraceId] = useState('tr-99201a');

  const completeness = calculateEvidenceCompleteness(incident);

  const sortedRecords = [...incident.records].sort((a, b) => {
    const ta = Date.parse(a.timestamp) || 0;
    const tb = Date.parse(b.timestamp) || 0;
    return ta - tb;
  });

  const filteredRecords = sortedRecords.filter((rec) => {
    if (timelineTypeFilter !== 'all' && rec.type !== timelineTypeFilter) return false;
    if (recordSearch.trim()) {
      const q = recordSearch.toLowerCase();
      return (
        rec.id.toLowerCase().includes(q) ||
        rec.service.toLowerCase().includes(q) ||
        rec.summary.toLowerCase().includes(q) ||
        (rec.metadata.traceId && rec.metadata.traceId.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const inspectedRecord =
    incident.records.find((r) => r.id === selectedRecordId) || sortedRecords[0];

  // Render summary text with interactive clickable record ID citations
  const renderGroundedSummary = (text: string) => {
    const parts = text.split(/(\b(?:DEP|LOG|MET|TCK|EVT|WIF)-[A-Z0-9-]+\b)/g);
    const recordIds = new Set(incident.records.map((r) => r.id));

    return parts.map((part, idx) => {
      if (recordIds.has(part)) {
        return (
          <button
            key={idx}
            onClick={() => onSelectRecord(part)}
            className="inline-flex items-center px-1.5 py-0.5 mx-0.5 text-xs font-mono bg-[#0D1117] text-[#38BDF8] border border-[#38BDF8]/40 rounded hover:bg-[#38BDF8]/15 transition-colors cursor-pointer"
            title={`Inspect grounded source record ${part}`}
          >
            {part}
          </button>
        );
      }
      return <span key={idx}>{part}</span>;
    });
  };

  const handleAddObservationSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!obsSummary.trim() || !obsId.trim()) return;
    const nowIso = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const newRec: SourceRecord = {
      id: obsId.trim().toUpperCase(),
      timestamp: nowIso,
      type: obsType,
      service: obsService.trim(),
      summary: obsSummary.trim(),
      rawPayload: JSON.stringify(
        {
          id: obsId.trim().toUpperCase(),
          timestamp: nowIso,
          type: obsType,
          service: obsService.trim(),
          severity: obsSeverity,
          trace_id: obsTraceId.trim() || undefined,
          message: obsSummary.trim(),
        },
        null,
        2
      ),
      severity: obsSeverity,
      sourceOrigin: 'ingested',
      metadata: {
        ...(obsTraceId.trim() ? { traceId: obsTraceId.trim() } : {}),
        environment: incident.environment,
      },
    };
    onAddObservation(newRec);
    setIsAddRecordOpen(false);
    setObsSummary('');
    setObsId(`LOG-${4451 + incident.records.length}`);
  };

  return (
    <div className="space-y-6">
      {/* Top Incident Switcher & Status Control Bar */}
      <div className="bg-[#161B22] border border-[#30363D] rounded p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div>
            <label className="block text-[10px] font-mono text-[#8B949E] uppercase mb-1">
              Active Investigation
            </label>
            <select
              value={incident.id}
              onChange={(e) => onSelectIncident(e.target.value)}
              className="h-[34px] px-3 text-xs font-mono bg-[#0D1117] border border-[#30363D] rounded text-[#F0F6FC] focus:outline-none focus:border-[#8B5CF6]"
            >
              {incidents.map((inc) => (
                <option key={inc.id} value={inc.id}>
                  {inc.id} — {inc.title.slice(0, 58)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-mono text-[#8B949E] uppercase mb-1">
              Incident Status
            </label>
            <div className="flex items-center gap-1 bg-[#0D1117] p-0.5 rounded border border-[#30363D]">
              {(['Investigating', 'Mitigated', 'Resolved'] as IncidentStatus[]).map((st) => (
                <button
                  key={st}
                  onClick={() => onUpdateStatus(st)}
                  className={`h-[26px] px-2.5 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                    incident.status === st
                      ? 'bg-[#8B5CF6] text-white'
                      : 'text-[#8B949E] hover:text-[#F0F6FC]'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setIsAddRecordOpen(true)}
            className="h-[34px] px-3 text-xs font-medium bg-[#21262D] text-[#C9D1D9] border border-[#30363D] rounded hover:bg-[#30363D] hover:text-[#F0F6FC] flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5 text-[#38BDF8]" />
            Log Evidence Record
          </button>
          <button
            onClick={onRunGeminiAnalysis}
            disabled={isAnalyzingGemini}
            className="h-[34px] px-3.5 text-xs font-medium bg-[#8B5CF6] text-white border border-[#A78BFA] rounded hover:bg-[#7C3AED] disabled:opacity-60 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            {isAnalyzingGemini ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Running Grounded Analysis...
              </>
            ) : (
              <>
                <Cpu className="w-3.5 h-3.5" />
                Run Gemini Forensic Synthesis
              </>
            )}
          </button>
        </div>
      </div>

      {/* Incident Overview & Grounded Summary Card */}
      <div className="bg-[#161B22] border border-[#30363D] rounded p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#21262D]">
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
            <span
              className={`px-2 py-0.5 rounded font-semibold ${
                incident.severity === 'SEV-1'
                  ? 'bg-[#F43F5E]/15 text-[#F43F5E] border border-[#F43F5E]/30'
                  : 'bg-[#F59E0B]/15 text-[#F59E0B] border border-[#F59E0B]/30'
              }`}
            >
              {incident.severity}
            </span>
            <span className="text-[#F0F6FC] font-semibold">{incident.id}</span>
            <span className="text-[#484F58]">·</span>
            <span className="text-[#8B949E]">Commander: {incident.commander}</span>
            <span className="text-[#484F58]">·</span>
            <span className="text-[#8B949E]">Env: {incident.environment}</span>
          </div>

          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="text-[#8B949E]">
              Completeness:{' '}
              <strong className="text-[#F0F6FC] tabular-nums">
                {completeness.percentage}%
              </strong>
            </span>
            <span className="text-[#484F58]">·</span>
            <span className="text-[#8B949E]">
              Records:{' '}
              <strong className="text-[#38BDF8] tabular-nums">
                {incident.records.length}
              </strong>
            </span>
          </div>
        </div>

        <div>
          <h1 className="text-xl font-semibold text-[#F0F6FC] mb-2">
            {incident.title}
          </h1>
          <div className="text-xs text-[#C9D1D9] leading-relaxed bg-[#0D1117] border border-[#21262D] rounded p-3.5">
            <div className="text-[11px] font-mono text-[#8B949E] uppercase mb-1">
              Grounded Forensic Summary (Click any Record ID to inspect provenance)
            </div>
            <p className="leading-6">{renderGroundedSummary(incident.summary)}</p>
          </div>
        </div>

        {/* Customer Impact & Quick Navigation Strip */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pt-2">
          <div className="lg:col-span-8 bg-[#0D1117] border border-[#21262D] rounded p-3">
            <div className="text-[11px] font-mono text-[#F43F5E] uppercase mb-1 flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5" />
              Verified Customer & Blast Radius Impact
            </div>
            <p className="text-xs text-[#C9D1D9]">
              {renderGroundedSummary(incident.customerImpact)}
            </p>
          </div>

          <div className="lg:col-span-4 flex flex-col justify-center gap-2 bg-[#0D1117] border border-[#21262D] rounded p-3">
            <div className="text-[11px] font-mono text-[#8B949E] uppercase">
              Forensic Investigation Modules
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onNavigate('evidence-graph')}
                className="h-[28px] px-2.5 text-xs font-mono bg-[#21262D] text-[#38BDF8] border border-[#30363D] rounded hover:bg-[#30363D] flex items-center justify-between cursor-pointer"
              >
                <span>Evidence Graph</span>
                <ExternalLink className="w-3 h-3" />
              </button>
              <button
                onClick={() => onNavigate('hypothesis-lab')}
                className="h-[28px] px-2.5 text-xs font-mono bg-[#21262D] text-[#A78BFA] border border-[#30363D] rounded hover:bg-[#30363D] flex items-center justify-between cursor-pointer"
              >
                <span>Hypothesis Lab</span>
                <ExternalLink className="w-3 h-3" />
              </button>
              <button
                onClick={() => onNavigate('what-if-lab')}
                className="h-[28px] px-2.5 text-xs font-mono bg-[#21262D] text-[#10B981] border border-[#30363D] rounded hover:bg-[#30363D] flex items-center justify-between cursor-pointer"
              >
                <span>What-If Lab</span>
                <ExternalLink className="w-3 h-3" />
              </button>
              <button
                onClick={() => onNavigate('report')}
                className="h-[28px] px-2.5 text-xs font-mono bg-[#21262D] text-[#C9D1D9] border border-[#30363D] rounded hover:bg-[#30363D] flex items-center justify-between cursor-pointer"
              >
                <span>Export Report</span>
                <FileText className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Grounded Forensic Analysis Output Panel with Honest AI Status */}
      {(incident.geminiAnalysis || geminiError) && (
        <div
          className={`bg-[#161B22] border rounded p-4 space-y-3 ${
            incident.geminiAnalysis?.mode === 'gemini-live'
              ? 'border-[#10B981]/50'
              : 'border-[#F59E0B]/50'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[#30363D]">
            <div className="flex flex-wrap items-center gap-2">
              <Cpu
                className={`w-4 h-4 ${
                  incident.geminiAnalysis?.mode === 'gemini-live'
                    ? 'text-[#10B981]'
                    : 'text-[#F59E0B]'
                }`}
              />
              <span className="text-xs font-semibold text-[#F0F6FC]">
                Forensic Synthesis Result
              </span>
              {incident.geminiAnalysis && (
                <>
                  <span
                    className={`px-2 py-0.5 text-[11px] font-mono font-semibold rounded border ${
                      incident.geminiAnalysis.mode === 'gemini-live'
                        ? 'bg-[#10B981]/15 text-[#10B981] border-[#10B981]/40'
                        : 'bg-[#F59E0B]/15 text-[#F59E0B] border-[#F59E0B]/40'
                    }`}
                  >
                    {incident.geminiAnalysis.executionLabel ||
                      (incident.geminiAnalysis.mode === 'gemini-live'
                        ? 'LIVE GEMINI'
                        : 'DETERMINISTIC FALLBACK')}
                  </span>
                  <span className="text-[11px] font-mono text-[#C9D1D9]">
                    Model: <strong>{incident.geminiAnalysis.modelUsed}</strong>
                    {incident.geminiAnalysis.mode === 'deterministic-fallback' &&
                      incident.geminiAnalysis.requestedModel && (
                        <span className="text-[#8B949E]">
                          {' '}
                          (Requested: {incident.geminiAnalysis.requestedModel})
                        </span>
                      )}
                  </span>
                  {incident.geminiAnalysis.requestStatus && (
                    <span className="text-[11px] font-mono text-[#8B949E]">
                      · Status: {incident.geminiAnalysis.requestStatus}
                    </span>
                  )}
                </>
              )}
            </div>
            {incident.geminiAnalysis && (
              <span className="text-[11px] font-mono text-[#10B981] flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Citations Verified Against Record Store (
                {incident.geminiAnalysis.ungroundedCitationsRemoved.length}{' '}
                ungrounded removed)
              </span>
            )}
          </div>

          {(incident.geminiAnalysis?.errorMessage || geminiError) && (
            <div className="text-xs font-mono text-[#F59E0B] bg-[#0D1117] border border-[#F59E0B]/30 rounded p-2.5 space-y-1">
              <div className="font-semibold">
                {incident.geminiAnalysis?.mode === 'deterministic-fallback'
                  ? 'DETERMINISTIC FALLBACK ACTIVE — Live Gemini Request Did Not Complete:'
                  : 'Analysis Diagnostic Notice:'}
              </div>
              <div>{incident.geminiAnalysis?.errorMessage || geminiError}</div>
            </div>
          )}

          {incident.geminiAnalysis && (
            <div className="space-y-3 text-xs">
              <div className="bg-[#0D1117] border border-[#21262D] rounded p-3">
                <div className="text-[10px] font-mono text-[#8B949E] uppercase mb-1">
                  Executive Synthesis (
                  {incident.geminiAnalysis.mode === 'gemini-live'
                    ? 'LIVE GEMINI'
                    : 'DETERMINISTIC FALLBACK'}
                  )
                </div>
                <p className="text-[#C9D1D9] leading-relaxed">
                  {renderGroundedSummary(
                    incident.geminiAnalysis.executiveSynthesis
                  )}
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                {/* 1. Grounded Facts */}
                <div className="bg-[#0D1117] border border-[#21262D] rounded p-3">
                  <div className="text-[11px] font-mono text-[#10B981] uppercase mb-1.5">
                    1. Verified Facts (Grounded in Store)
                  </div>
                  <ul className="space-y-1.5">
                    {incident.geminiAnalysis.groundedFacts.map((fact, i) => (
                      <li
                        key={i}
                        className="text-[#C9D1D9] flex items-start gap-1.5"
                      >
                        <span className="text-[#10B981] font-mono">•</span>
                        <div>
                          <span>{fact.statement} </span>
                          {fact.citedRecordIds.map((cid) => (
                            <button
                              key={cid}
                              onClick={() => onSelectRecord(cid)}
                              className="inline-flex px-1 py-0.2 mx-0.5 font-mono text-[11px] text-[#38BDF8] hover:underline cursor-pointer"
                            >
                              [{cid}]
                            </button>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* 2. Hypotheses & Contradictory Evidence */}
                <div className="bg-[#0D1117] border border-[#21262D] rounded p-3">
                  <div className="text-[11px] font-mono text-[#A78BFA] uppercase mb-1.5">
                    2. Hypotheses & Contradictory Evidence
                  </div>
                  <ul className="space-y-2">
                    {incident.geminiAnalysis.hypothesisCritique.map(
                      (crit, i) => (
                        <li
                          key={i}
                          className="text-[#C9D1D9] pb-1.5 border-b border-[#21262D] last:border-b-0 last:pb-0"
                        >
                          <div>
                            <strong className="font-mono text-[#F0F6FC]">
                              {crit.hypothesisId}:
                            </strong>{' '}
                            {renderGroundedSummary(crit.assessment)}
                          </div>
                          {crit.contradictoryRecordIds &&
                            crit.contradictoryRecordIds.length > 0 && (
                              <div className="text-[11px] font-mono text-[#F43F5E] mt-0.5">
                                Contradictory IDs:{' '}
                                {crit.contradictoryRecordIds.map((cid) => (
                                  <button
                                    key={cid}
                                    onClick={() => onSelectRecord(cid)}
                                    className="mr-1 underline cursor-pointer"
                                  >
                                    [{cid}]
                                  </button>
                                ))}
                              </div>
                            )}
                          <div className="text-[11px] text-[#F59E0B] mt-0.5">
                            Uncertainty: {crit.keyUncertainty}
                          </div>
                        </li>
                      )
                    )}
                  </ul>
                </div>

                {/* 3. Unknowns & Missing Evidence */}
                <div className="bg-[#0D1117] border border-[#21262D] rounded p-3">
                  <div className="text-[11px] font-mono text-[#F59E0B] uppercase mb-1.5">
                    3. Open Unknowns & Missing Evidence
                  </div>
                  <ul className="space-y-1.5">
                    {(
                      incident.geminiAnalysis.unknownsAndGaps ||
                      incident.hypotheses.flatMap((h) =>
                        h.missingInformation.map((m) => ({
                          id: m.id,
                          hypothesisId: h.id,
                          targetService: m.targetService,
                          description: m.description,
                          status: m.resolvedByRecordId
                            ? ('RESOLVED' as const)
                            : ('UNRESOLVED' as const),
                          resolvedByRecordId: m.resolvedByRecordId,
                        }))
                      )
                    ).map((unk) => (
                      <li
                        key={unk.id}
                        className="text-[#C9D1D9] flex items-start gap-1.5"
                      >
                        <span className="text-[#F59E0B] font-mono">•</span>
                        <div>
                          <span className="font-mono text-[11px] text-[#F0F6FC]">
                            [{unk.id} · {unk.hypothesisId}]
                          </span>{' '}
                          <span>{unk.description}</span>{' '}
                          <span
                            className={`font-mono text-[10px] px-1 rounded ${
                              unk.status === 'RESOLVED'
                                ? 'bg-[#10B981]/20 text-[#10B981]'
                                : 'bg-[#F59E0B]/20 text-[#F59E0B]'
                            }`}
                          >
                            {unk.status}
                            {unk.resolvedByRecordId
                              ? ` by ${unk.resolvedByRecordId}`
                              : ''}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Affected Components Health Table */}
      <div className="bg-[#161B22] border border-[#30363D] rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-[#30363D] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-[#38BDF8]" />
            <h2 className="text-sm font-semibold text-[#F0F6FC]">
              Affected Service Components & Telemetry State
            </h2>
          </div>
          <span className="text-xs font-mono text-[#8B949E]">
            {incident.affectedServices.length} Services Monitored
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#21262D] text-[11px] font-mono text-[#8B949E] uppercase bg-[#0D1117]/60">
                <th className="py-2.5 px-4">Service Name</th>
                <th className="py-2.5 px-4">Architecture Tier</th>
                <th className="py-2.5 px-4">Operational Status</th>
                <th className="py-2.5 px-4 text-right">Error Rate</th>
                <th className="py-2.5 px-4 text-right">p99 Latency / Saturation</th>
                <th className="py-2.5 px-4">Owner Team</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#21262D] text-xs">
              {incident.affectedServices.map((svc) => (
                <tr key={svc.name} className="hover:bg-[#21262D]/50 transition-colors">
                  <td className="py-2.5 px-4 font-mono font-medium text-[#F0F6FC]">
                    {svc.name}
                  </td>
                  <td className="py-2.5 px-4 text-[#8B949E]">{svc.tier}</td>
                  <td className="py-2.5 px-4 font-mono">
                    <span
                      className={
                        svc.status === 'Critical'
                          ? 'text-[#F43F5E] font-semibold'
                          : svc.status === 'Degraded'
                          ? 'text-[#F59E0B] font-semibold'
                          : 'text-[#10B981]'
                      }
                    >
                      {svc.status}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 font-mono tabular-nums text-right text-[#F0F6FC]">
                    {svc.errorRate}
                  </td>
                  <td className="py-2.5 px-4 font-mono tabular-nums text-right text-[#C9D1D9]">
                    {svc.p99Latency}
                  </td>
                  <td className="py-2.5 px-4 text-[#8B949E]">{svc.ownerTeam}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Split View: Chronological Forensic Timeline & Source Records (Left 7 cols) + Raw Record Inspector (Right 5 cols) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left: Timeline & Source Records */}
        <div className="xl:col-span-7 bg-[#161B22] border border-[#30363D] rounded flex flex-col">
          <div className="p-4 border-b border-[#30363D] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#A78BFA]" />
                <h2 className="text-sm font-semibold text-[#F0F6FC]">
                  Chronological Forensic Timeline & Source Records ({filteredRecords.length})
                </h2>
              </div>
              <span className="text-xs font-mono text-[#8B949E]">
                UTC Chronological Order
              </span>
            </div>

            {/* Filter & Search controls */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1">
                {(
                  [
                    { id: 'all', label: 'All' },
                    { id: 'deployment', label: 'Deployments' },
                    { id: 'log', label: 'Logs' },
                    { id: 'metric', label: 'Metrics' },
                    { id: 'ticket', label: 'Tickets' },
                    { id: 'service_event', label: 'Events' },
                    { id: 'what_if', label: 'What-If' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setTimelineTypeFilter(tab.id)}
                    className={`h-[26px] px-2 text-[11px] font-mono rounded transition-colors cursor-pointer whitespace-nowrap ${
                      timelineTypeFilter === tab.id
                        ? 'bg-[#8B5CF6] text-white'
                        : 'bg-[#21262D] text-[#8B949E] hover:text-[#F0F6FC]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="relative w-full sm:w-52">
                <Search className="w-3 h-3 text-[#8B949E] absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={recordSearch}
                  onChange={(e) => setRecordSearch(e.target.value)}
                  placeholder="Search ID, trace, text..."
                  className="w-full h-[28px] pl-7 pr-2 text-xs font-mono bg-[#0D1117] border border-[#30363D] rounded text-[#F0F6FC] placeholder-[#8B949E] focus:outline-none focus:border-[#8B5CF6]"
                />
              </div>
            </div>
          </div>

          <div className="divide-y divide-[#21262D] max-h-[540px] overflow-y-auto">
            {filteredRecords.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#8B949E]">
                No source records match the active filter.
              </div>
            ) : (
              filteredRecords.map((rec, idx) => {
                const isSelected = inspectedRecord?.id === rec.id;
                return (
                  <div
                    key={rec.id}
                    onClick={() => onSelectRecord(rec.id)}
                    className={`p-3.5 transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#21262D] border-l-2 border-l-[#8B5CF6]'
                        : 'hover:bg-[#21262D]/50'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[#8B949E] tabular-nums">
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        <span className="text-[#38BDF8] font-semibold">{rec.id}</span>
                        <span className="text-[#484F58]">·</span>
                        <span
                          className={`uppercase ${
                            rec.severity === 'critical'
                              ? 'text-[#F43F5E]'
                              : rec.severity === 'warning'
                              ? 'text-[#F59E0B]'
                              : 'text-[#10B981]'
                          }`}
                        >
                          {rec.type}
                        </span>
                        <span className="text-[#484F58]">·</span>
                        <span className="text-[#C9D1D9]">{rec.service}</span>
                        {rec.sourceOrigin !== 'baseline' && (
                          <span className="px-1.5 py-0.2 text-[10px] bg-[#8B5CF6]/20 text-[#A78BFA] border border-[#8B5CF6]/40 rounded uppercase">
                            {rec.sourceOrigin}
                          </span>
                        )}
                      </div>

                      <span className="text-[#8B949E] tabular-nums">
                        {rec.timestamp.replace('T', ' ').replace('Z', ' UTC')}
                      </span>
                    </div>

                    <p className="text-xs text-[#F0F6FC] leading-relaxed">
                      {rec.summary}
                    </p>

                    {(rec.metadata.traceId || rec.metadata.commitSha) && (
                      <div className="mt-1.5 flex items-center gap-3 text-[11px] font-mono text-[#8B949E]">
                        {rec.metadata.traceId && (
                          <span>trace_id: {rec.metadata.traceId}</span>
                        )}
                        {rec.metadata.commitSha && (
                          <span>commit: {rec.metadata.commitSha}</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Immutable Source Record Inspector */}
        <div className="xl:col-span-5 bg-[#161B22] border border-[#30363D] rounded flex flex-col">
          <div className="p-4 border-b border-[#30363D] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Code2 className="w-4 h-4 text-[#38BDF8]" />
              <h2 className="text-sm font-semibold text-[#F0F6FC]">
                Source Record Provenance Inspector
              </h2>
            </div>
            {inspectedRecord && (
              <span className="text-xs font-mono text-[#38BDF8] font-semibold">
                {inspectedRecord.id}
              </span>
            )}
          </div>

          {inspectedRecord ? (
            <div className="p-4 space-y-4 flex-1">
              {/* Metadata Grid */}
              <div className="grid grid-cols-2 gap-2.5 bg-[#0D1117] border border-[#21262D] rounded p-3 text-xs font-mono">
                <div>
                  <div className="text-[10px] text-[#8B949E] uppercase">Record ID</div>
                  <div className="text-[#F0F6FC] font-semibold">{inspectedRecord.id}</div>
                </div>
                <div>
                  <div className="text-[10px] text-[#8B949E] uppercase">UTC Timestamp</div>
                  <div className="text-[#F0F6FC] tabular-nums">
                    {inspectedRecord.timestamp}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[#8B949E] uppercase">Service</div>
                  <div className="text-[#38BDF8]">{inspectedRecord.service}</div>
                </div>
                <div>
                  <div className="text-[10px] text-[#8B949E] uppercase">Provenance Origin</div>
                  <div className="text-[#10B981] uppercase">
                    {inspectedRecord.sourceOrigin}
                  </div>
                </div>
              </div>

              {/* Linked Hypotheses */}
              <div>
                <div className="text-[11px] font-mono text-[#8B949E] uppercase mb-1.5">
                  Hypotheses Citing {inspectedRecord.id}
                </div>
                <div className="space-y-1.5">
                  {incident.hypotheses.map((hyp) => {
                    const sup = hyp.supportingEvidence.find(
                      (s) => s.recordId === inspectedRecord.id
                    );
                    const con = hyp.contradictoryEvidence.find(
                      (c) => c.recordId === inspectedRecord.id
                    );
                    if (!sup && !con) return null;
                    return (
                      <div
                        key={hyp.id}
                        className="p-2.5 bg-[#0D1117] border border-[#21262D] rounded text-xs"
                      >
                        <div className="flex items-center justify-between font-mono mb-1">
                          <span className="text-[#F0F6FC] font-semibold">{hyp.id}</span>
                          {sup ? (
                            <span className="text-[#10B981]">
                              SUPPORTS (+{sup.weight} wt)
                            </span>
                          ) : (
                            <span className="text-[#F43F5E]">
                              CONTRADICTS ({con?.weight} wt)
                            </span>
                          )}
                        </div>
                        <p className="text-[#C9D1D9] text-[11px]">
                          {sup ? sup.reason : con?.reason}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Raw Payload */}
              <div>
                <div className="text-[11px] font-mono text-[#8B949E] uppercase mb-1.5">
                  Immutable Raw Telemetry Payload (JSON)
                </div>
                <pre className="p-3 bg-[#0D1117] border border-[#21262D] rounded text-[11px] font-mono text-[#C9D1D9] overflow-x-auto max-h-72 leading-relaxed">
                  {inspectedRecord.rawPayload}
                </pre>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-[#8B949E]">
              Select any record on the timeline to inspect its full payload.
            </div>
          )}
        </div>
      </div>

      {/* Related Incidents & Pattern Detective Panel in Investigation Workspace */}
      <div className="bg-[#161B22] border border-[#30363D] rounded p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-[#30363D]">
          <div>
            <div className="flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-[#A78BFA]" />
              <span className="text-xs font-mono uppercase tracking-wider text-[#F0F6FC] font-semibold">
                Related Incidents in Persistent Memory (Pattern Detective)
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#0D1117] text-[#8B949E] border border-[#21262D]">
                0% Title Reliance · Telemetry Signature Match
              </span>
            </div>
            <p className="text-[11px] text-[#8B949E] mt-0.5">
              Compares {incident.id} against {relatedIncidents.length} other saved investigation(s)
              in browser memory. Match scores measure telemetry overlap — NOT root-cause probability.
            </p>
          </div>
          <button
            onClick={() => onNavigate('incident-memory')}
            className="h-[28px] px-3 text-xs font-mono bg-[#8B5CF6]/20 text-[#A78BFA] border border-[#8B5CF6]/40 rounded hover:bg-[#8B5CF6]/30 transition-colors cursor-pointer shrink-0"
          >
            Open Incident Memory & Detective →
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {relatedIncidents.map((rel) => (
            <div
              key={rel.historicalIncidentId}
              className="p-3 bg-[#0D1117] border border-[#21262D] rounded space-y-2 text-xs"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-bold text-[#F0F6FC]">
                    {rel.historicalIncidentId}
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#21262D] text-[#C9D1D9]">
                    {rel.historicalStatus}
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#8B5CF6]/10 text-[#A78BFA] border border-[#8B5CF6]/30">
                    {rel.isDemoRecord ? 'DEMO ARCHIVE' : 'SAVED USER'}
                  </span>
                </div>
                <span
                  className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                    rel.classification === 'HIGH PATTERN MATCH'
                      ? 'bg-[#10B981]/15 text-[#10B981] border-[#10B981]/40'
                      : rel.classification === 'LOW EVIDENCE'
                      ? 'bg-[#F59E0B]/20 text-[#F59E0B] border-[#F59E0B]/50'
                      : 'bg-[#21262D] text-[#8B949E] border-[#30363D]'
                  }`}
                >
                  {rel.overallMatchScore}% · {rel.classification}
                </span>
              </div>

              <div className="text-[#F0F6FC] font-medium line-clamp-1">
                {rel.historicalTitle}
              </div>

              {rel.sharedEvidence.length > 0 ? (
                <p className="text-[11px] text-[#C9D1D9]">
                  <strong className="text-[#10B981]">Shared:</strong>{' '}
                  {rel.sharedEvidence[0].description}
                </p>
              ) : (
                <p className="text-[11px] text-[#8B949E]">
                  No overlapping technical signatures or services with {incident.id}.
                </p>
              )}

              {rel.conflictingAndDivergentEvidence.length > 0 && (
                <p className="text-[11px] text-[#F59E0B]">
                  <strong>Key Divergence:</strong>{' '}
                  {rel.conflictingAndDivergentEvidence[0].description}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-[#161B22]">
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-[10px] font-mono text-[#8B949E]">
                    {incident.id} Refs:
                  </span>
                  {Array.from(
                    new Set(
                      rel.sharedEvidence.flatMap((s) => s.currentRecordIds)
                    )
                  )
                    .slice(0, 4)
                    .map((rid) => (
                      <button
                        key={rid}
                        onClick={() => onSelectRecord(rid)}
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#38BDF8]/15 text-[#38BDF8] hover:underline cursor-pointer"
                      >
                        [{rid}]
                      </button>
                    ))}
                </div>
                <button
                  onClick={() => {
                    if (onOpenMemoryComparison) {
                      onOpenMemoryComparison(rel.historicalIncidentId);
                    } else {
                      onNavigate('incident-memory');
                    }
                  }}
                  className="text-[11px] font-mono text-[#A78BFA] hover:underline cursor-pointer"
                >
                  Inspect Full Comparison →
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add Observation Record Modal */}
      {isAddRecordOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-[#161B22] border border-[#484F58] rounded-lg max-w-md w-full p-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#30363D] mb-4">
              <h3 className="text-base font-semibold text-[#F0F6FC]">
                Append Grounded Telemetry Observation
              </h3>
              <button
                onClick={() => setIsAddRecordOpen(false)}
                className="text-xs font-mono text-[#8B949E] hover:text-[#F0F6FC] cursor-pointer"
              >
                [ESC]
              </button>
            </div>

            <form onSubmit={handleAddObservationSubmit} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono text-[#8B949E] mb-1">
                    Record ID *
                  </label>
                  <input
                    type="text"
                    required
                    value={obsId}
                    onChange={(e) => setObsId(e.target.value)}
                    className="w-full h-[32px] px-2.5 text-xs font-mono bg-[#0D1117] border border-[#30363D] rounded text-[#F0F6FC]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-[#8B949E] mb-1">
                    Type
                  </label>
                  <select
                    value={obsType}
                    onChange={(e) => setObsType(e.target.value as RecordType)}
                    className="w-full h-[32px] px-2.5 text-xs font-mono bg-[#0D1117] border border-[#30363D] rounded text-[#F0F6FC]"
                  >
                    <option value="log">log</option>
                    <option value="metric">metric</option>
                    <option value="deployment">deployment</option>
                    <option value="ticket">ticket</option>
                    <option value="service_event">service_event</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono text-[#8B949E] mb-1">
                    Service *
                  </label>
                  <input
                    type="text"
                    required
                    value={obsService}
                    onChange={(e) => setObsService(e.target.value)}
                    className="w-full h-[32px] px-2.5 text-xs font-mono bg-[#0D1117] border border-[#30363D] rounded text-[#F0F6FC]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-[#8B949E] mb-1">
                    Trace ID (Optional)
                  </label>
                  <input
                    type="text"
                    value={obsTraceId}
                    onChange={(e) => setObsTraceId(e.target.value)}
                    className="w-full h-[32px] px-2.5 text-xs font-mono bg-[#0D1117] border border-[#30363D] rounded text-[#F0F6FC]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono text-[#8B949E] mb-1">
                  Severity
                </label>
                <select
                  value={obsSeverity}
                  onChange={(e) =>
                    setObsSeverity(e.target.value as 'critical' | 'warning' | 'info')
                  }
                  className="w-full h-[32px] px-2.5 text-xs font-mono bg-[#0D1117] border border-[#30363D] rounded text-[#F0F6FC]"
                >
                  <option value="critical">critical</option>
                  <option value="warning">warning</option>
                  <option value="info">info</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-mono text-[#8B949E] mb-1">
                  Observation Summary *
                </label>
                <textarea
                  rows={3}
                  required
                  value={obsSummary}
                  onChange={(e) => setObsSummary(e.target.value)}
                  placeholder="e.g. HikariPool-1 connection acquisition wait exceeded 5000ms on pod checkout-service-7f8b9c"
                  className="w-full p-2.5 text-xs bg-[#0D1117] border border-[#30363D] rounded text-[#F0F6FC]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#30363D]">
                <button
                  type="button"
                  onClick={() => setIsAddRecordOpen(false)}
                  className="h-[32px] px-3 text-xs bg-[#21262D] text-[#C9D1D9] border border-[#30363D] rounded cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="h-[32px] px-3.5 text-xs bg-[#8B5CF6] text-white border border-[#A78BFA] rounded cursor-pointer"
                >
                  Append Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
