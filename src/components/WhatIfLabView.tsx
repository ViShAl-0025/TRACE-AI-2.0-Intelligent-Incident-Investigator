import React, { useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  FlaskConical,
  GitBranch,
  Plus,
  RotateCcw,
  Sparkles,
  Zap,
} from 'lucide-react';
import {
  ActiveScreen,
  IncidentInvestigation,
  SourceRecord,
  WhatIfPreset,
  WhatIfSimulationEntry,
} from '../types/trace';
import { WHAT_IF_PRESETS } from '../data/sampleIncidents';

interface WhatIfLabViewProps {
  incident: IncidentInvestigation;
  activePresetIds: string[];
  whatIfHistory?: WhatIfSimulationEntry[];
  onTogglePreset: (preset: WhatIfPreset) => void;
  onInjectCustomWhatIf: (
    record: SourceRecord,
    targetHypothesisId: string,
    role: 'supporting' | 'contradictory',
    weight: number,
    reason: string
  ) => void;
  onResetWhatIf: () => void;
  onNavigate: (screen: ActiveScreen) => void;
}

export const WhatIfLabView: React.FC<WhatIfLabViewProps> = ({
  incident,
  activePresetIds,
  whatIfHistory = [],
  onTogglePreset,
  onInjectCustomWhatIf,
  onResetWhatIf,
  onNavigate,
}) => {
  const [customService, setCustomService] = useState(
    incident.affectedServices[0]?.name || 'checkout-service'
  );
  const [customSummary, setCustomSummary] = useState('');
  const [customTraceId, setCustomTraceId] = useState('tr-99201a');
  const [targetHypId, setTargetHypId] = useState(
    incident.hypotheses[0]?.id || 'HYP-01'
  );
  const [impactRole, setImpactRole] = useState<'supporting' | 'contradictory'>(
    'supporting'
  );
  const [impactWeight, setImpactWeight] = useState<number>(18);

  const incidentPresets = WHAT_IF_PRESETS.filter(
    (p) => p.incidentId === incident.id
  );

  const injectedRecords = incident.records.filter(
    (r) => r.sourceOrigin === 'what_if' || r.type === 'what_if'
  );

  const newlyComputedEdges = incident.relationships.filter(
    (rel) =>
      rel.id.startsWith('REL-AUTO-') ||
      rel.id.startsWith('REL-INF-') ||
      injectedRecords.some(
        (r) => r.id === rel.sourceId || r.id === rel.targetId
      )
  );

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customSummary.trim()) return;

    const id = `WIF-CUST-${810 + injectedRecords.length}`;
    const nowIso = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

    const newRec: SourceRecord = {
      id,
      timestamp: nowIso,
      type: 'what_if',
      service: customService,
      summary: `[WHAT-IF] ${customSummary.trim()}`,
      rawPayload: JSON.stringify(
        {
          what_if_id: id,
          timestamp: nowIso,
          service: customService,
          trace_id: customTraceId.trim() || undefined,
          simulated_observation: customSummary.trim(),
        },
        null,
        2
      ),
      severity: 'warning',
      sourceOrigin: 'what_if',
      metadata: {
        ...(customTraceId.trim() ? { traceId: customTraceId.trim() } : {}),
        environment: incident.environment,
      },
    };

    const signedWeight =
      impactRole === 'supporting'
        ? Math.abs(impactWeight)
        : -Math.abs(impactWeight);

    onInjectCustomWhatIf(
      newRec,
      targetHypId,
      impactRole,
      signedWeight,
      `Custom What-If injection ${id}: ${customSummary.trim()}`
    );
    setCustomSummary('');
  };

  return (
    <div className="space-y-6">
      {/* Header & Reset Control */}
      <div className="bg-[#161B22] border border-[#30363D] rounded p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-[#8B949E] mb-1">
            <span>COUNTERFACTUAL & WHAT-IF EVIDENCE SANDBOX</span>
            <span>·</span>
            <span className="text-[#38BDF8]">{incident.id}</span>
          </div>
          <h1 className="text-lg font-semibold text-[#F0F6FC]">
            What-If Evidence Lab & Dynamic Hypothesis Recomputation
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-xs font-mono text-[#A78BFA]">
            Active What-If Records: {injectedRecords.length}
          </span>
          <button
            onClick={onResetWhatIf}
            disabled={injectedRecords.length === 0}
            className="h-[34px] px-3.5 text-xs font-medium bg-[#21262D] text-[#F43F5E] border border-[#F43F5E]/40 rounded hover:bg-[#F43F5E]/15 disabled:opacity-40 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Scenario to Baseline
          </button>
        </div>
      </div>

      {/* Live Before vs. After Hypothesis Plausibility Shift Matrix */}
      <div className="bg-[#161B22] border border-[#30363D] rounded p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#21262D]">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-[#A78BFA]" />
            <h2 className="text-sm font-semibold text-[#F0F6FC]">
              Real-Time Plausibility & Relationship Delta (Baseline vs. Current What-If State)
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onNavigate('evidence-graph')}
              className="text-xs font-mono text-[#38BDF8] hover:underline cursor-pointer"
            >
              Inspect Graph ({incident.relationships.length} edges) →
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {incident.hypotheses.map((hyp) => {
            const delta = hyp.plausibilityScore - hyp.baselineScore;
            const resolvedItems = hyp.missingInformation.filter((m) =>
              Boolean(m.resolvedByRecordId)
            );
            const whatIfCites = [
              ...hyp.supportingEvidence.filter((s) =>
                s.recordId.startsWith('WIF-')
              ),
              ...hyp.contradictoryEvidence.filter((c) =>
                c.recordId.startsWith('WIF-')
              ),
            ];

            return (
              <div
                key={hyp.id}
                className="bg-[#0D1117] border border-[#21262D] rounded p-4 space-y-3"
              >
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-[#A78BFA] font-semibold">{hyp.id}</span>
                  <span
                    className={
                      hyp.statusLabel === 'Leading Hypothesis'
                        ? 'text-[#10B981]'
                        : hyp.statusLabel === 'Competing Co-Factor'
                        ? 'text-[#F59E0B]'
                        : 'text-[#F43F5E]'
                    }
                  >
                    {hyp.statusLabel}
                  </span>
                </div>

                <div className="text-xs font-semibold text-[#F0F6FC]">
                  {hyp.title}
                </div>

                {/* Score Transition Bar */}
                <div className="flex items-center justify-between bg-[#161B22] border border-[#30363D] rounded p-2.5 font-mono text-xs tabular-nums">
                  <div>
                    <span className="text-[#8B949E] block text-[10px]">
                      BASELINE SCORE
                    </span>
                    <span className="text-sm text-[#C9D1D9]">
                      {hyp.baselineScore}%
                    </span>
                  </div>

                  <ArrowRight className="w-4 h-4 text-[#8B949E]" />

                  <div>
                    <span className="text-[#8B949E] block text-[10px]">
                      RECOMPUTED SCORE
                    </span>
                    <span className="text-sm font-bold text-[#F0F6FC]">
                      {hyp.plausibilityScore}%
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-[#8B949E] block text-[10px]">
                      NET SHIFT
                    </span>
                    <span
                      className={`text-sm font-semibold ${
                        delta > 0
                          ? 'text-[#10B981]'
                          : delta < 0
                          ? 'text-[#F43F5E]'
                          : 'text-[#8B949E]'
                      }`}
                    >
                      {delta > 0 ? `+${delta}%` : `${delta}%`}
                    </span>
                  </div>
                </div>

                {/* Explanation of What Changed */}
                {whatIfCites.length > 0 || resolvedItems.length > 0 ? (
                  <div className="space-y-1.5 pt-1 text-[11px]">
                    <div className="font-mono text-[#8B949E] uppercase">
                      Causal Explanation of Shift:
                    </div>
                    {whatIfCites.map((c) => (
                      <div
                        key={c.recordId}
                        className="p-2 bg-[#161B22] border border-[#21262D] rounded text-[#C9D1D9]"
                      >
                        <span
                          className={`font-mono font-semibold mr-1.5 ${
                            c.weight > 0 ? 'text-[#10B981]' : 'text-[#F43F5E]'
                          }`}
                        >
                          [{c.recordId} {c.weight > 0 ? `+${c.weight}` : c.weight}]:
                        </span>
                        <span>{c.reason}</span>
                      </div>
                    ))}
                    {resolvedItems.map((m) => (
                      <div
                        key={m.id}
                        className="text-[#10B981] font-mono flex items-center gap-1"
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        <span>
                          Resolved missing evidence {m.id} (+3% epistemic completeness bonus)
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[11px] font-mono text-[#8B949E]">
                    No What-If shifts currently applied to {hyp.id}. Inject a scenario below to test sensitivity.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Split: Curated What-If Presets (Left 7 cols) + Custom What-If Evidence Builder (Right 5 cols) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left: Preset What-If Scenarios */}
        <div className="xl:col-span-7 space-y-4">
          <div className="bg-[#161B22] border border-[#30363D] rounded p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[#F0F6FC]">
                Curated Counterfactual Evidence Scenarios ({incidentPresets.length})
              </h2>
              <span className="text-xs font-mono text-[#8B949E]">
                Toggle to inject or remove
              </span>
            </div>

            {incidentPresets.length === 0 ? (
              <div className="p-6 text-center text-xs text-[#8B949E] bg-[#0D1117] border border-[#21262D] rounded">
                Use the Custom What-If Builder on the right to inject synthetic evidence for{' '}
                {incident.id}.
              </div>
            ) : (
              <div className="space-y-3">
                {incidentPresets.map((preset) => {
                  const isActive = incident.records.some(
                    (r) => r.id === preset.recordToInject.id
                  );
                  return (
                    <div
                      key={preset.id}
                      className={`p-4 bg-[#0D1117] border rounded transition-colors ${
                        isActive
                          ? 'border-[#8B5CF6]'
                          : 'border-[#21262D] hover:border-[#484F58]'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2 text-xs font-mono">
                          <span className="text-[#38BDF8] font-semibold">
                            {preset.recordToInject.id}
                          </span>
                          <span className="text-[#484F58]">·</span>
                          <span className="text-[#A78BFA]">
                            {preset.expectedImpactBadge}
                          </span>
                        </div>

                        <button
                          onClick={() => onTogglePreset(preset)}
                          className={`h-[28px] px-3 text-xs font-mono rounded transition-colors cursor-pointer ${
                            isActive
                              ? 'bg-[#F43F5E]/20 text-[#F43F5E] border border-[#F43F5E]/40 hover:bg-[#F43F5E]/30'
                              : 'bg-[#8B5CF6] text-white border border-[#A78BFA] hover:bg-[#7C3AED]'
                          }`}
                        >
                          {isActive ? 'Remove Injected Evidence' : 'Inject What-If Evidence'}
                        </button>
                      </div>

                      <h3 className="text-sm font-semibold text-[#F0F6FC] mb-1">
                        {preset.title}
                      </h3>
                      <p className="text-xs text-[#C9D1D9] leading-relaxed mb-2.5">
                        {preset.description}
                      </p>

                      <div className="p-2.5 bg-[#161B22] border border-[#21262D] rounded text-[11px] font-mono text-[#8B949E]">
                        <div className="text-[#C9D1D9] mb-1">
                          Record Summary: {preset.recordToInject.summary}
                        </div>
                        <div>
                          Service: {preset.recordToInject.service} · Trace:{' '}
                          {preset.recordToInject.metadata.traceId || 'N/A'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Newly Computed Graph Relationships from What-If / Ingestion */}
          <div className="bg-[#161B22] border border-[#30363D] rounded p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-[#38BDF8]" />
                <h2 className="text-sm font-semibold text-[#F0F6FC]">
                  Dynamically Computed Evidence Graph Links ({newlyComputedEdges.length})
                </h2>
              </div>
              <span className="text-xs font-mono text-[#8B949E]">
                Auto-correlated by trace_id, commitSha, or service
              </span>
            </div>

            {newlyComputedEdges.length === 0 ? (
              <div className="p-4 bg-[#0D1117] border border-[#21262D] rounded text-xs text-[#8B949E]">
                Inject a What-If scenario above to see how TRACE AI automatically computes new
                direct and inferred graph relationships.
              </div>
            ) : (
              <div className="space-y-2">
                {newlyComputedEdges.map((edge) => (
                  <div
                    key={edge.id}
                    className="p-3 bg-[#0D1117] border border-[#21262D] rounded text-xs flex flex-col gap-1"
                  >
                    <div className="flex items-center justify-between font-mono">
                      <span className="text-[#F0F6FC] font-semibold">
                        {edge.sourceId} → {edge.targetId}
                      </span>
                      <span
                        className={
                          edge.type === 'direct'
                            ? 'text-[#38BDF8]'
                            : 'text-[#A78BFA]'
                        }
                      >
                        {edge.type.toUpperCase()} ({edge.confidenceWeight}% conf)
                      </span>
                    </div>
                    <p className="text-[#C9D1D9] text-[11px]">
                      {edge.ruleExplanation}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Custom What-If Evidence Builder */}
        <div className="xl:col-span-5 bg-[#161B22] border border-[#30363D] rounded p-4 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="pb-3 border-b border-[#30363D]">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#F0F6FC]">
                <FlaskConical className="w-4 h-4 text-[#A78BFA]" />
                <span>Custom What-If Evidence Builder</span>
              </div>
              <p className="text-xs text-[#8B949E] mt-1">
                Construct a custom hypothetical observation, bind it to a service and trace ID,
                and test how competing hypotheses respond.
              </p>
            </div>

            <form onSubmit={handleCustomSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-mono text-[#8B949E] mb-1">
                  Target Service Component
                </label>
                <select
                  value={customService}
                  onChange={(e) => setCustomService(e.target.value)}
                  className="w-full h-[32px] px-2.5 font-mono bg-[#0D1117] border border-[#30363D] rounded text-[#F0F6FC]"
                >
                  {incident.affectedServices.map((s) => (
                    <option key={s.name} value={s.name}>
                      {s.name} ({s.tier})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-mono text-[#8B949E] mb-1">
                  Correlated Trace ID (Creates Direct Graph Edge)
                </label>
                <input
                  type="text"
                  value={customTraceId}
                  onChange={(e) => setCustomTraceId(e.target.value)}
                  placeholder="e.g. tr-99201a"
                  className="w-full h-[32px] px-2.5 font-mono bg-[#0D1117] border border-[#30363D] rounded text-[#F0F6FC]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-mono text-[#8B949E] mb-1">
                    Target Hypothesis
                  </label>
                  <select
                    value={targetHypId}
                    onChange={(e) => setTargetHypId(e.target.value)}
                    className="w-full h-[32px] px-2 font-mono bg-[#0D1117] border border-[#30363D] rounded text-[#F0F6FC]"
                  >
                    {incident.hypotheses.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.id} ({h.plausibilityScore}%)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-mono text-[#8B949E] mb-1">
                    Evidentiary Direction
                  </label>
                  <select
                    value={impactRole}
                    onChange={(e) =>
                      setImpactRole(e.target.value as 'supporting' | 'contradictory')
                    }
                    className="w-full h-[32px] px-2 font-mono bg-[#0D1117] border border-[#30363D] rounded text-[#F0F6FC]"
                  >
                    <option value="supporting">Supports (+)</option>
                    <option value="contradictory">Contradicts (-)</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="flex justify-between font-mono text-[#8B949E] mb-1">
                  <span>Evidentiary Weight Magnitude</span>
                  <span className="text-[#F0F6FC] tabular-nums">
                    {impactRole === 'supporting' ? `+${impactWeight}` : `-${impactWeight}`} pts
                  </span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={35}
                  value={impactWeight}
                  onChange={(e) => setImpactWeight(Number(e.target.value))}
                  className="w-full accent-[#8B5CF6]"
                />
              </div>

              <div>
                <label className="block font-mono text-[#8B949E] mb-1">
                  Simulated Observation Summary *
                </label>
                <textarea
                  rows={3}
                  required
                  value={customSummary}
                  onChange={(e) => setCustomSummary(e.target.value)}
                  placeholder="e.g. Synthetic load test with HikariPool size=60 reproduced zero DB waits while payment gateway p99 remained 4800ms."
                  className="w-full p-2.5 bg-[#0D1117] border border-[#30363D] rounded text-[#F0F6FC]"
                />
              </div>

              <button
                type="submit"
                className="w-full h-[34px] px-4 text-xs font-medium bg-[#8B5CF6] text-white border border-[#A78BFA] rounded hover:bg-[#7C3AED] flex items-center justify-center gap-2 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Inject Custom What-If Observation
              </button>
            </form>
          </div>

          <div className="mt-6 pt-3 border-t border-[#21262D] text-[11px] font-mono text-[#8B949E]">
            Note: All What-If records are stamped with sourceOrigin="what_if" so they never
            contaminate verified baseline telemetry and can be reset in one click.
          </div>
        </div>
      </div>

      {/* Persisted What-If Simulation History Log */}
      <div className="bg-[#161B22] border border-[#30363D] rounded p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#30363D]">
          <div className="flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-[#A78BFA]" />
            <h2 className="text-sm font-semibold text-[#F0F6FC]">
              Persisted What-If Simulation Audit Log ({incident.id})
            </h2>
          </div>
          <span className="text-xs font-mono text-[#10B981]">
            Persisted in Browser localStorage Across Reloads
          </span>
        </div>

        {whatIfHistory.filter((h) => h.incidentId === incident.id).length === 0 ? (
          <div className="p-4 bg-[#0D1117] border border-[#21262D] rounded text-xs text-[#8B949E] font-mono">
            No What-If simulation events recorded yet for {incident.id}. Toggle a preset or
            inject custom evidence above to record a persisted simulation entry.
          </div>
        ) : (
          <div className="divide-y divide-[#21262D] bg-[#0D1117] border border-[#21262D] rounded max-h-64 overflow-y-auto">
            {whatIfHistory
              .filter((h) => h.incidentId === incident.id)
              .map((entry) => (
                <div key={entry.id} className="p-3 text-xs space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2 font-mono">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-1.5 py-0.5 text-[10px] rounded uppercase font-semibold ${
                          entry.actionType === 'preset_injected' ||
                          entry.actionType === 'custom_injected'
                            ? 'bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30'
                            : entry.actionType === 'preset_removed'
                            ? 'bg-[#F59E0B]/15 text-[#F59E0B] border border-[#F59E0B]/30'
                            : 'bg-[#38BDF8]/15 text-[#38BDF8] border border-[#38BDF8]/30'
                        }`}
                      >
                        {entry.actionType.replace('_', ' ')}
                      </span>
                      {entry.recordId && (
                        <span className="text-[#38BDF8] font-semibold">
                          [{entry.recordId}]
                        </span>
                      )}
                      <span className="text-[#F0F6FC] font-medium">{entry.title}</span>
                    </div>
                    <span className="text-[#8B949E] tabular-nums">{entry.timestamp}</span>
                  </div>
                  <p className="text-[#C9D1D9] text-[11px]">{entry.summary}</p>
                  {entry.hypothesisDeltas.length > 0 && (
                    <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono pt-0.5">
                      {entry.hypothesisDeltas.map((d) => (
                        <span key={d.hypothesisId} className="text-[#A78BFA] tabular-nums">
                          {d.hypothesisId}: {d.beforeScore}% → {d.afterScore}%
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
};
