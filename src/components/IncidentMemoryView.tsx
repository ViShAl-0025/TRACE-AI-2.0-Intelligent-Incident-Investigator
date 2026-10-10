import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Cpu,
  Database,
  ExternalLink,
  FileSearch,
  Filter,
  GitCompare,
  History,
  Info,
  Layers,
  Search,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import {
  ActiveScreen,
  GeminiMemoryComparisonSynthesis,
  IncidentInvestigation,
  RecordType,
  SourceRecord,
} from '../types/trace';
import {
  compareIncidentsDeterministically,
  detectRecurringPatternsAcrossMemory,
  isFictionalDemoIncident,
  rankRelatedIncidents,
  searchIncidentMemory,
} from '../engine/patternDetectiveEngine';

interface IncidentMemoryViewProps {
  incidents: IncidentInvestigation[];
  currentIncident: IncidentInvestigation;
  initialComparedIncidentId?: string | null;
  onSelectIncident: (incidentId: string, navigateTo?: ActiveScreen) => void;
  onInspectRecordInWorkspace: (incidentId: string, recordId: string) => void;
}

export const IncidentMemoryView: React.FC<IncidentMemoryViewProps> = ({
  incidents,
  currentIncident,
  initialComparedIncidentId,
  onSelectIncident,
  onInspectRecordInWorkspace,
}) => {
  // Search & Filter state for Incident Memory Index
  const [searchQuery, setSearchQuery] = useState('');
  const [serviceFilter, setServiceFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [recordTypeFilter, setRecordTypeFilter] = useState<'all' | RecordType>(
    'all'
  );

  // Ranked related incidents for currentIncident
  const rankedComparisons = useMemo(
    () => rankRelatedIncidents(currentIncident, incidents),
    [currentIncident, incidents]
  );

  const [selectedHistoricalId, setSelectedHistoricalId] = useState<string>(
    () => {
      if (
        initialComparedIncidentId &&
        initialComparedIncidentId !== currentIncident.id &&
        incidents.some((i) => i.id === initialComparedIncidentId)
      ) {
        return initialComparedIncidentId;
      }
      return rankedComparisons[0]?.historicalIncidentId || '';
    }
  );

  // Keep selectedHistoricalId valid when currentIncident changes
  const effectiveHistoricalId = useMemo(() => {
    if (
      selectedHistoricalId &&
      selectedHistoricalId !== currentIncident.id &&
      incidents.some((i) => i.id === selectedHistoricalId)
    ) {
      return selectedHistoricalId;
    }
    return rankedComparisons[0]?.historicalIncidentId || '';
  }, [selectedHistoricalId, currentIncident.id, incidents, rankedComparisons]);

  const historicalIncident = useMemo(
    () => incidents.find((i) => i.id === effectiveHistoricalId) || null,
    [incidents, effectiveHistoricalId]
  );

  const activeComparison = useMemo(() => {
    if (!historicalIncident) return null;
    return compareIncidentsDeterministically(
      currentIncident,
      historicalIncident
    );
  }, [currentIncident, historicalIncident]);

  // Recurring pattern detection across stored corpus
  const patternReport = useMemo(
    () => detectRecurringPatternsAcrossMemory(incidents),
    [incidents]
  );

  // Search results in Incident Memory
  const memorySearchResults = useMemo(
    () =>
      searchIncidentMemory(incidents, {
        query: searchQuery,
        serviceFilter,
        statusFilter,
        recordTypeFilter,
      }),
    [incidents, searchQuery, serviceFilter, statusFilter, recordTypeFilter]
  );

  // All unique services across stored incidents for filter dropdown
  const allServices = useMemo(() => {
    const set = new Set<string>();
    for (const inc of incidents) {
      for (const s of inc.affectedServices) set.add(s.name);
      for (const r of inc.records) set.add(r.service);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [incidents]);

  // Record Inspector Modal state (allows inspecting any record from either current or historical incident)
  const [inspectedRecordInfo, setInspectedRecordInfo] = useState<{
    incident: IncidentInvestigation;
    record: SourceRecord;
  } | null>(null);

  const handleOpenRecordModal = (recordId: string, preferredIncidentId?: string) => {
    if (preferredIncidentId) {
      const prefInc = incidents.find((i) => i.id === preferredIncidentId);
      const prefRec = prefInc?.records.find((r) => r.id === recordId);
      if (prefInc && prefRec) {
        setInspectedRecordInfo({ incident: prefInc, record: prefRec });
        return;
      }
    }
    for (const inc of incidents) {
      const found = inc.records.find((r) => r.id === recordId);
      if (found) {
        setInspectedRecordInfo({ incident: inc, record: found });
        return;
      }
    }
  };

  // Gemini Memory Comparison Synthesis state (keyed by pair currentId::historicalId)
  const [synthesisMap, setSynthesisMap] = useState<
    Record<string, GeminiMemoryComparisonSynthesis>
  >({});
  const [isRunningSynthesis, setIsRunningSynthesis] = useState(false);
  const [synthesisNotice, setSynthesisNotice] = useState<string | null>(null);

  const pairKey = `${currentIncident.id}::${effectiveHistoricalId}`;
  const activeSynthesis = synthesisMap[pairKey] || null;

  const handleRunGeminiComparison = async () => {
    if (!historicalIncident || !activeComparison) return;
    setIsRunningSynthesis(true);
    setSynthesisNotice(null);
    try {
      const res = await fetch('/api/analyze-memory-comparison', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentIncident,
          historicalIncident,
          comparison: activeComparison,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to analyze memory comparison.');
      }
      if (data.synthesis) {
        setSynthesisMap((prev) => ({
          ...prev,
          [pairKey]: data.synthesis as GeminiMemoryComparisonSynthesis,
        }));
      }
      if (data.notice) {
        setSynthesisNotice(data.notice);
      }
    } catch (err: unknown) {
      setSynthesisNotice(
        err instanceof Error
          ? err.message
          : 'Unable to reach /api/analyze-memory-comparison'
      );
    } finally {
      setIsRunningSynthesis(false);
    }
  };

  const getClassificationBadgeStyle = (
    classification: string
  ): string => {
    switch (classification) {
      case 'HIGH PATTERN MATCH':
        return 'bg-[#10B981]/15 text-[#10B981] border-[#10B981]/40';
      case 'PARTIAL PATTERN MATCH':
        return 'bg-[#38BDF8]/15 text-[#38BDF8] border-[#38BDF8]/40';
      case 'LOW EVIDENCE':
        return 'bg-[#F59E0B]/20 text-[#F59E0B] border-[#F59E0B]/50';
      case 'WEAK / INCIDENTAL OVERLAP':
        return 'bg-[#F59E0B]/15 text-[#F59E0B] border-[#F59E0B]/40';
      default:
        return 'bg-[#21262D] text-[#8B949E] border-[#30363D]';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Banner */}
      <div className="bg-[#161B22] border border-[#30363D] rounded p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-[#8B5CF6]/15 text-[#A78BFA] border border-[#8B5CF6]/30 flex items-center gap-1.5">
              <History className="w-3.5 h-3.5" />
              Screen 9 · Incident Memory & Pattern Detective
            </span>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-[#21262D] text-[#38BDF8] border border-[#30363D]">
              STORED CORPUS: N={incidents.length} INVESTIGATIONS
            </span>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-[#0D1117] text-[#8B949E] border border-[#21262D]">
              PERSISTENCE: BROWSER LOCALSTORAGE
            </span>
          </div>
          <h1 className="text-xl font-bold text-[#F0F6FC] tracking-tight">
            Historical Incident Memory, Explainable Similarity & Pattern Detective
          </h1>
          <p className="text-xs text-[#8B949E] max-w-4xl">
            Compares active investigation{' '}
            <span className="font-mono text-[#F0F6FC] font-semibold">
              {currentIncident.id}
            </span>{' '}
            against saved investigations in persistent browser memory across service overlap,
            technical error signatures, deployment triggers, and causal graph topology.
          </p>
        </div>

        {/* Target Comparison Selector */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
          <div className="bg-[#0D1117] border border-[#30363D] rounded px-3 py-1.5">
            <label className="block text-[10px] font-mono text-[#8B949E] uppercase">
              Compare {currentIncident.id} Against Stored Incident
            </label>
            <select
              aria-label="Compare against stored incident"
              value={effectiveHistoricalId}
              onChange={(e) => setSelectedHistoricalId(e.target.value)}
              className="mt-0.5 bg-transparent text-xs font-mono text-[#F0F6FC] focus:outline-none cursor-pointer"
            >
              {rankedComparisons.map((comp) => (
                <option
                  key={comp.historicalIncidentId}
                  value={comp.historicalIncidentId}
                  className="bg-[#161B22] text-[#F0F6FC]"
                >
                  {comp.historicalIncidentId} — {comp.overallMatchScore}% Match (
                  {comp.classification})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleRunGeminiComparison}
            disabled={isRunningSynthesis || !historicalIncident}
            className="h-[42px] px-3.5 text-xs font-mono font-medium bg-[#8B5CF6] text-white border border-[#A78BFA] rounded hover:bg-[#7C3AED] disabled:opacity-50 transition-colors flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <Cpu className="w-4 h-4" />
            {isRunningSynthesis
              ? 'Synthesizing Comparison...'
              : 'Run Gemini Pattern Comparison'}
          </button>
        </div>
      </div>

      {/* Epistemic Guardrail Notice */}
      <div className="bg-[#161B22] border border-[#38BDF8]/40 rounded p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-start gap-2.5">
          <Info className="w-4 h-4 text-[#38BDF8] shrink-0 mt-0.5" />
          <div className="text-[#C9D1D9]">
            <span className="font-mono font-semibold text-[#38BDF8]">
              EPISTEMIC GUARDRAIL (SIMILARITY ≠ CAUSATION):
            </span>{' '}
            Match scores quantify structural and evidentiary telemetry overlap (0% reliance on
            incident titles). A high match score is <strong>not</strong> the probability that the
            historical root cause is true for {currentIncident.id}. Always inspect conflicting
            evidence and execute falsification tests.
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 font-mono text-[11px]">
          <span className="px-2 py-0.5 rounded bg-[#21262D] text-[#A78BFA] border border-[#30363D]">
            {patternReport.demoIncidentCount} Fictional Demo
          </span>
          <span className="px-2 py-0.5 rounded bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30">
            {patternReport.customIncidentCount} User Saved
          </span>
        </div>
      </div>

      {/* SECTION 1: SIDE-BY-SIDE EXPLAINABLE SIMILARITY & EVIDENCE COMPARISON */}
      {activeComparison && historicalIncident ? (
        <div className="space-y-4">
          {/* Low Evidence Warning Banner when triggered */}
          {activeComparison.lowEvidenceWarning && (
            <div className="bg-[#F59E0B]/10 border border-[#F59E0B]/50 rounded p-3.5 flex items-start gap-2.5 text-xs text-[#F59E0B]">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <div className="font-mono font-bold uppercase">
                  LOW EVIDENCE WARNING
                </div>
                <p className="mt-0.5 text-[#F0F6FC]">
                  {activeComparison.lowEvidenceWarning}
                </p>
              </div>
            </div>
          )}

          {/* Ranked Related Incidents Strip */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {rankedComparisons.map((comp) => {
              const isSelected =
                comp.historicalIncidentId === effectiveHistoricalId;
              return (
                <div
                  key={comp.historicalIncidentId}
                  onClick={() =>
                    setSelectedHistoricalId(comp.historicalIncidentId)
                  }
                  className={`p-4 rounded border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#161B22] border-[#8B5CF6] shadow-lg'
                      : 'bg-[#161B22]/60 border-[#30363D] hover:border-[#484F58]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-[#F0F6FC]">
                        {comp.historicalIncidentId}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#21262D] text-[#C9D1D9]">
                        {comp.historicalStatus}
                      </span>
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                          comp.isDemoRecord
                            ? 'bg-[#8B5CF6]/10 text-[#A78BFA] border-[#8B5CF6]/30'
                            : 'bg-[#10B981]/15 text-[#10B981] border-[#10B981]/30'
                        }`}
                      >
                        {comp.isDemoRecord
                          ? 'FICTIONAL DEMO ARCHIVE'
                          : 'SAVED USER INVESTIGATION'}
                      </span>
                    </div>
                    <span
                      className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded border ${getClassificationBadgeStyle(
                        comp.classification
                      )}`}
                    >
                      {comp.classification}
                    </span>
                  </div>

                  <div className="text-xs font-medium text-[#F0F6FC] line-clamp-1 mb-2">
                    {comp.historicalTitle}
                  </div>

                  <div className="flex items-center justify-between text-[11px] font-mono text-[#8B949E]">
                    <span>
                      Shared Signals: {comp.sharedEvidence.length} · Divergent:{' '}
                      {comp.conflictingAndDivergentEvidence.length}
                    </span>
                    <span className="text-sm font-bold text-[#F0F6FC] tabular-nums">
                      {comp.overallMatchScore}% STRUCTURAL MATCH
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Gemini / Deterministic Comparison Synthesis Output Panel */}
          {(activeSynthesis || synthesisNotice) && (
            <div
              className={`bg-[#161B22] border rounded p-4 space-y-3 ${
                activeSynthesis?.mode === 'gemini-live'
                  ? 'border-[#10B981]/60'
                  : 'border-[#F59E0B]/60'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[#30363D]">
                <div className="flex flex-wrap items-center gap-2">
                  <Sparkles
                    className={`w-4 h-4 ${
                      activeSynthesis?.mode === 'gemini-live'
                        ? 'text-[#10B981]'
                        : 'text-[#F59E0B]'
                    }`}
                  />
                  <span className="text-xs font-mono uppercase tracking-wider text-[#F0F6FC] font-semibold">
                    Pattern Detective Comparison Synthesis
                  </span>
                  {activeSynthesis && (
                    <span
                      className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded border ${
                        activeSynthesis.mode === 'gemini-live'
                          ? 'bg-[#10B981]/20 text-[#10B981] border-[#10B981]/50'
                          : 'bg-[#F59E0B]/20 text-[#F59E0B] border-[#F59E0B]/50'
                      }`}
                    >
                      {activeSynthesis.executionLabel}
                    </span>
                  )}
                  {activeSynthesis && (
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#0D1117] text-[#C9D1D9] border border-[#30363D]">
                      MODEL: {activeSynthesis.modelUsed}
                    </span>
                  )}
                </div>
                {activeSynthesis && (
                  <span className="text-[11px] font-mono text-[#8B949E]">
                    {activeSynthesis.requestStatus}
                  </span>
                )}
              </div>

              {(activeSynthesis?.errorMessage || synthesisNotice) && (
                <div className="p-2.5 bg-[#F59E0B]/10 border border-[#F59E0B]/40 rounded text-xs font-mono text-[#F59E0B]">
                  {activeSynthesis?.errorMessage || synthesisNotice}
                </div>
              )}

              {activeSynthesis && (
                <div className="space-y-3 text-xs">
                  <div className="p-3 bg-[#0D1117] border border-[#21262D] rounded">
                    <div className="text-[10px] font-mono text-[#A78BFA] uppercase mb-1">
                      Executive Comparison ({activeSynthesis.currentIncidentId} vs{' '}
                      {activeSynthesis.historicalIncidentId})
                    </div>
                    <p className="text-[#F0F6FC] leading-relaxed">
                      {activeSynthesis.executiveComparison}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <div className="p-3 bg-[#0D1117] border border-[#21262D] rounded space-y-2">
                      <div className="text-[10px] font-mono text-[#10B981] uppercase font-semibold">
                        Verified Key Similarities
                      </div>
                      {activeSynthesis.keySimilarities.map((sim, idx) => (
                        <div
                          key={idx}
                          className="p-2 bg-[#161B22] border border-[#30363D] rounded space-y-1"
                        >
                          <p className="text-[#C9D1D9]">{sim.statement}</p>
                          <div className="flex flex-wrap gap-1">
                            {sim.citedRecordIds.map((rid) => (
                              <button
                                key={rid}
                                onClick={() => handleOpenRecordModal(rid)}
                                className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#10B981]/15 text-[#10B981] hover:underline cursor-pointer"
                              >
                                [{rid}]
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="p-3 bg-[#0D1117] border border-[#21262D] rounded space-y-2">
                      <div className="text-[10px] font-mono text-[#F59E0B] uppercase font-semibold">
                        Critical Differences & Confounding Signals
                      </div>
                      {activeSynthesis.criticalDifferencesAndConflicts.map(
                        (diff, idx) => (
                          <div
                            key={idx}
                            className="p-2 bg-[#161B22] border border-[#30363D] rounded space-y-1"
                          >
                            <p className="text-[#C9D1D9]">{diff.statement}</p>
                            <div className="flex flex-wrap gap-1">
                              {diff.citedRecordIds.map((rid) => (
                                <button
                                  key={rid}
                                  onClick={() => handleOpenRecordModal(rid)}
                                  className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#F59E0B]/15 text-[#F59E0B] hover:underline cursor-pointer"
                                >
                                  [{rid}]
                                </button>
                              ))}
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  </div>

                  <div className="p-2.5 bg-[#0D1117] border border-[#30363D] rounded flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-[#8B949E]">
                    <span>CAVEAT: {activeSynthesis.epistemicCaveat}</span>
                    <span>
                      Ungrounded Citations Stripped:{' '}
                      {activeSynthesis.ungroundedCitationsRemoved.length}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Explainable Match Score Breakdown Card */}
          <div className="bg-[#161B22] border border-[#30363D] rounded p-5 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-[#30363D]">
              <div>
                <div className="flex items-center gap-2">
                  <GitCompare className="w-4 h-4 text-[#A78BFA]" />
                  <h2 className="text-sm font-mono uppercase tracking-wider text-[#F0F6FC] font-semibold">
                    Explainable Match Score Breakdown: {currentIncident.id} vs.{' '}
                    {historicalIncident.id}
                  </h2>
                </div>
                <p className="text-xs text-[#8B949E] mt-1">
                  {activeComparison.scoringMethodologyNote}
                </p>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right">
                  <div className="text-[10px] font-mono text-[#8B949E] uppercase">
                    Structural Telemetry Overlap
                  </div>
                  <div className="text-2xl font-mono font-bold text-[#F0F6FC] tabular-nums">
                    {activeComparison.overallMatchScore}/100
                  </div>
                </div>
                <span
                  className={`text-xs font-mono font-bold px-2.5 py-1 rounded border ${getClassificationBadgeStyle(
                    activeComparison.classification
                  )}`}
                >
                  {activeComparison.classification}
                </span>
              </div>
            </div>

            {/* 5 Transparent Comparison Dimensions Table */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
              {activeComparison.dimensions.map((dim) => (
                <div
                  key={dim.dimension}
                  className="p-3 bg-[#0D1117] border border-[#21262D] rounded flex flex-col justify-between space-y-2.5"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span className="text-[#A78BFA] font-semibold">
                        Weight {Math.round(dim.weight * 100)}%
                      </span>
                      <span className="text-[#F0F6FC] font-bold tabular-nums">
                        {dim.score}% (+{dim.weightedContribution} pts)
                      </span>
                    </div>
                    <div className="text-xs font-semibold text-[#F0F6FC]">
                      {dim.dimension}
                    </div>
                    <div className="w-full h-1.5 bg-[#21262D] rounded overflow-hidden">
                      <div
                        className="h-full bg-[#8B5CF6]"
                        style={{ width: `${dim.score}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-[#8B949E] leading-relaxed">
                      {dim.explanation}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-[#21262D] space-y-1">
                    <div className="text-[10px] font-mono text-[#8B949E]">
                      CITED EVIDENCE:
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {dim.currentRecordIds.map((id) => (
                        <button
                          key={`cur-${id}`}
                          onClick={() =>
                            handleOpenRecordModal(id, currentIncident.id)
                          }
                          className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#38BDF8]/15 text-[#38BDF8] hover:underline cursor-pointer"
                          title={`Inspect ${currentIncident.id} record ${id}`}
                        >
                          {id}
                        </button>
                      ))}
                      {dim.historicalRecordIds.map((id) => (
                        <button
                          key={`hist-${id}`}
                          onClick={() =>
                            handleOpenRecordModal(id, historicalIncident.id)
                          }
                          className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#8B5CF6]/15 text-[#A78BFA] hover:underline cursor-pointer"
                          title={`Inspect ${historicalIncident.id} record ${id}`}
                        >
                          {id}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* 4-Column Evidence Comparison Matrix: Shared, Conflicting/Divergent, Missing, Historical Resolution */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
              {/* Shared Evidence */}
              <div className="p-4 bg-[#0D1117] border border-[#21262D] rounded space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase text-[#10B981] font-semibold flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    1. Shared Technical Evidence ({activeComparison.sharedEvidence.length})
                  </span>
                </div>
                {activeComparison.sharedEvidence.length === 0 ? (
                  <p className="text-xs text-[#8B949E] font-mono">
                    No shared technical error signatures or deployment triggers between{' '}
                    {currentIncident.id} and {historicalIncident.id}.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {activeComparison.sharedEvidence.map((item, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 bg-[#161B22] border border-[#30363D] rounded space-y-1.5 text-xs"
                      >
                        <div className="font-mono text-[10px] text-[#10B981] uppercase">
                          {item.category}
                        </div>
                        <p className="text-[#F0F6FC]">{item.description}</p>
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <span className="text-[10px] font-mono text-[#8B949E]">
                            {currentIncident.id}:
                          </span>
                          {item.currentRecordIds.map((id) => (
                            <button
                              key={id}
                              onClick={() =>
                                handleOpenRecordModal(id, currentIncident.id)
                              }
                              className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#38BDF8]/15 text-[#38BDF8] hover:underline cursor-pointer"
                            >
                              [{id}]
                            </button>
                          ))}
                          <span className="text-[10px] font-mono text-[#8B949E] ml-1">
                            {historicalIncident.id}:
                          </span>
                          {item.historicalRecordIds.map((id) => (
                            <button
                              key={id}
                              onClick={() =>
                                handleOpenRecordModal(id, historicalIncident.id)
                              }
                              className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#8B5CF6]/15 text-[#A78BFA] hover:underline cursor-pointer"
                            >
                              [{id}]
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Conflicting & Divergent Evidence */}
              <div className="p-4 bg-[#0D1117] border border-[#21262D] rounded space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase text-[#F59E0B] font-semibold flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    2. Conflicting & Divergent Evidence (
                    {activeComparison.conflictingAndDivergentEvidence.length})
                  </span>
                </div>
                {activeComparison.conflictingAndDivergentEvidence.length === 0 ? (
                  <p className="text-xs text-[#8B949E] font-mono">
                    No conflicting technical signatures detected.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {activeComparison.conflictingAndDivergentEvidence.map(
                      (item, idx) => (
                        <div
                          key={idx}
                          className="p-2.5 bg-[#161B22] border border-[#F59E0B]/30 rounded space-y-1.5 text-xs"
                        >
                          <div className="font-mono text-[10px] text-[#F59E0B] uppercase">
                            {item.category}
                          </div>
                          <p className="text-[#F0F6FC]">{item.description}</p>
                          <p className="text-[11px] text-[#8B949E]">
                            <strong>Epistemic Impact:</strong> {item.epistemicImpact}
                          </p>
                          <div className="flex flex-wrap gap-1 pt-1">
                            {item.currentRecordIds.map((id) => (
                              <button
                                key={id}
                                onClick={() =>
                                  handleOpenRecordModal(id, currentIncident.id)
                                }
                                className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#F59E0B]/15 text-[#F59E0B] hover:underline cursor-pointer"
                              >
                                [{currentIncident.id}: {id}]
                              </button>
                            ))}
                            {item.historicalRecordIds.map((id) => (
                              <button
                                key={id}
                                onClick={() =>
                                  handleOpenRecordModal(
                                    id,
                                    historicalIncident.id
                                  )
                                }
                                className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#8B5CF6]/15 text-[#A78BFA] hover:underline cursor-pointer"
                              >
                                [{historicalIncident.id}: {id}]
                              </button>
                            ))}
                          </div>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>

              {/* Documented Historical Resolution */}
              <div className="p-4 bg-[#0D1117] border border-[#21262D] rounded space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase text-[#38BDF8] font-semibold">
                    3. Documented Historical Resolution ({historicalIncident.id})
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#21262D] text-[#C9D1D9]">
                    {activeComparison.documentedHistoricalResolution.available
                      ? 'VERIFIED ARCHIVE RESOLUTION'
                      : 'OPEN / UNRESOLVED'}
                  </span>
                </div>
                <div className="p-3 bg-[#161B22] border border-[#30363D] rounded space-y-2 text-xs">
                  <div>
                    <span className="font-mono text-[10px] text-[#8B949E] uppercase block">
                      Confirmed Historical Root Cause:
                    </span>
                    <p className="text-[#F0F6FC] font-medium">
                      {
                        activeComparison.documentedHistoricalResolution
                          .rootCauseConfirmed
                      }
                    </p>
                  </div>
                  <div>
                    <span className="font-mono text-[10px] text-[#8B949E] uppercase block">
                      Historical Remediation Applied:
                    </span>
                    <p className="text-[#C9D1D9]">
                      {
                        activeComparison.documentedHistoricalResolution
                          .remediationApplied
                      }
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[10px] font-mono text-[#8B949E]">
                      Verified By Historical Records:
                    </span>
                    {activeComparison.documentedHistoricalResolution.verifiedByRecordIds.map(
                      (id) => (
                        <button
                          key={id}
                          onClick={() =>
                            handleOpenRecordModal(id, historicalIncident.id)
                          }
                          className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#38BDF8]/15 text-[#38BDF8] hover:underline cursor-pointer"
                        >
                          [{id}]
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>

              {/* Missing Evidence & Follow-Up Verification Checks */}
              <div className="p-4 bg-[#0D1117] border border-[#21262D] rounded space-y-2.5">
                <span className="text-xs font-mono uppercase text-[#A78BFA] font-semibold block">
                  4. Missing Evidence in {currentIncident.id} & Verification Checks
                </span>

                {activeComparison.missingInCurrentIncident.length > 0 && (
                  <div className="space-y-1.5">
                    {activeComparison.missingInCurrentIncident
                      .slice(0, 2)
                      .map((m, idx) => (
                        <div
                          key={idx}
                          className="p-2 bg-[#161B22] border border-[#30363D] rounded text-xs"
                        >
                          <span className="font-mono text-[10px] text-[#F59E0B] uppercase">
                            Missing on {m.targetService}:
                          </span>
                          <p className="text-[#C9D1D9] mt-0.5">{m.description}</p>
                        </div>
                      ))}
                  </div>
                )}

                <div className="space-y-1.5 pt-1">
                  {activeComparison.verificationRecommendations.map(
                    (rec, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 bg-[#161B22] border border-[#8B5CF6]/30 rounded space-y-1 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[#8B5CF6]/20 text-[#A78BFA]">
                            {rec.priority} VERIFICATION
                          </span>
                          <div className="flex gap-1">
                            {rec.citedRecordIds.map((id) => (
                              <button
                                key={id}
                                onClick={() => handleOpenRecordModal(id)}
                                className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#21262D] text-[#38BDF8] hover:underline cursor-pointer"
                              >
                                [{id}]
                              </button>
                            ))}
                          </div>
                        </div>
                        <p className="text-[#F0F6FC] font-medium">{rec.action}</p>
                        <p className="text-[11px] text-[#8B949E]">
                          {rec.rationale}
                        </p>
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* SECTION 2: CROSS-CORPUS RECURRING PATTERN DETECTIVE */}
      <div className="bg-[#161B22] border border-[#30363D] rounded p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pb-3 border-b border-[#30363D]">
          <div>
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#38BDF8]" />
              <h2 className="text-sm font-mono uppercase tracking-wider text-[#F0F6FC] font-semibold">
                Cross-Corpus Pattern Detective (Sample Size N={patternReport.sampleSize} Stored
                Investigations)
              </h2>
            </div>
            <p className="text-xs text-[#8B949E] mt-1">
              Automatically identifies recurring error signatures, co-failing service dependencies,
              and repeated post-deployment failure associations across stored investigations.
            </p>
          </div>
          <span className="text-xs font-mono px-2.5 py-1 rounded bg-[#0D1117] text-[#38BDF8] border border-[#21262D] shrink-0">
            {patternReport.patterns.length} Recurring Pattern(s) Verified
          </span>
        </div>

        {/* Sample Size & Statistical Limitations Box */}
        <div className="p-3 bg-[#0D1117] border border-[#30363D] rounded space-y-1 text-xs font-mono text-[#8B949E]">
          <div className="text-[#F59E0B] font-semibold uppercase text-[10px]">
            Sample Size & Statistical Limitations
          </div>
          {patternReport.corpusLimitations.map((lim, i) => (
            <div key={i}>• {lim}</div>
          ))}
        </div>

        {patternReport.patterns.length === 0 ? (
          <div className="p-6 text-center text-xs font-mono text-[#8B949E]">
            No recurring patterns found across ≥2 investigations in the current corpus.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {patternReport.patterns.map((pat) => (
              <div
                key={pat.id}
                className="p-3.5 bg-[#0D1117] border border-[#21262D] rounded flex flex-col justify-between space-y-3"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#8B5CF6]/15 text-[#A78BFA] border border-[#8B5CF6]/30">
                      {pat.patternType.replace('_', ' ')}
                    </span>
                    <span className="text-xs font-mono font-bold text-[#10B981]">
                      {pat.occurrencesCount}/{pat.totalCorpusSize} Incidents
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-[#F0F6FC]">
                    {pat.signature}
                  </div>
                  <p className="text-[11px] text-[#C9D1D9] leading-relaxed">
                    {pat.explanation}
                  </p>
                </div>

                <div className="pt-2 border-t border-[#21262D] space-y-1.5">
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-[10px] font-mono text-[#8B949E]">
                      INCIDENTS:
                    </span>
                    {pat.incidentIds.map((incId) => (
                      <button
                        key={incId}
                        onClick={() => onSelectIncident(incId, 'workspace')}
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#21262D] text-[#F0F6FC] hover:bg-[#30363D] cursor-pointer"
                      >
                        {incId}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-[10px] font-mono text-[#8B949E]">
                      EVIDENCE:
                    </span>
                    {pat.citedRecordIds.map((rid) => (
                      <button
                        key={rid}
                        onClick={() => handleOpenRecordModal(rid)}
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#38BDF8]/15 text-[#38BDF8] hover:underline cursor-pointer"
                      >
                        [{rid}]
                      </button>
                    ))}
                  </div>
                  <div className="text-[10px] font-mono text-[#8B949E]">
                    {pat.sampleSizeLimitation}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SECTION 3: SEARCHABLE INCIDENT MEMORY & EVIDENCE INDEX */}
      <div className="bg-[#161B22] border border-[#30363D] rounded p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-[#30363D]">
          <div>
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-[#10B981]" />
              <h2 className="text-sm font-mono uppercase tracking-wider text-[#F0F6FC] font-semibold">
                Searchable Incident Memory & Evidence Index
              </h2>
            </div>
            <p className="text-xs text-[#8B949E] mt-1">
              Query across all saved investigations, source record payloads, commit SHAs,
              distributed trace IDs, and historical resolutions in persistent storage.
            </p>
          </div>
          <span className="text-xs font-mono text-[#8B949E]">
            Showing {memorySearchResults.length} of {incidents.length} Stored Investigations
          </span>
        </div>

        {/* Search & Filter Controls */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2 relative">
            <Search className="w-3.5 h-3.5 text-[#8B949E] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by record ID (LOG-3102), signature (HikariPool, 504), service, trace_id..."
              className="w-full h-[34px] pl-8 pr-3 text-xs font-mono bg-[#0D1117] border border-[#30363D] rounded text-[#F0F6FC] placeholder-[#8B949E] focus:outline-none focus:border-[#8B5CF6]"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-[#8B949E] shrink-0" />
            <select
              aria-label="Filter memory by service"
              value={serviceFilter}
              onChange={(e) => setServiceFilter(e.target.value)}
              className="w-full h-[34px] px-2.5 text-xs font-mono bg-[#0D1117] border border-[#30363D] rounded text-[#F0F6FC] focus:outline-none focus:border-[#8B5CF6]"
            >
              <option value="ALL">All Services ({allServices.length})</option>
              {allServices.map((svc) => (
                <option key={svc} value={svc}>
                  {svc}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <select
              aria-label="Filter memory by status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full h-[34px] px-2 text-xs font-mono bg-[#0D1117] border border-[#30363D] rounded text-[#F0F6FC] focus:outline-none focus:border-[#8B5CF6]"
            >
              <option value="ALL">All Statuses</option>
              <option value="Investigating">Investigating</option>
              <option value="Mitigated">Mitigated</option>
              <option value="Resolved">Resolved</option>
            </select>

            <select
              aria-label="Filter memory by record type"
              value={recordTypeFilter}
              onChange={(e) =>
                setRecordTypeFilter(e.target.value as 'all' | RecordType)
              }
              className="w-full h-[34px] px-2 text-xs font-mono bg-[#0D1117] border border-[#30363D] rounded text-[#F0F6FC] focus:outline-none focus:border-[#8B5CF6]"
            >
              <option value="all">All Record Types</option>
              <option value="deployment">deployment</option>
              <option value="log">log</option>
              <option value="metric">metric</option>
              <option value="ticket">ticket</option>
              <option value="service_event">service_event</option>
              <option value="what_if">what_if</option>
            </select>
          </div>
        </div>

        {/* Search Results List */}
        <div className="space-y-3">
          {memorySearchResults.map((entry) => {
            const { incident, matchedRecords, extractedSignatures, isDemoRecord } =
              entry;
            const isCurrent = incident.id === currentIncident.id;
            return (
              <div
                key={incident.id}
                className="p-4 bg-[#0D1117] border border-[#21262D] rounded space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-mono font-bold text-[#F0F6FC]">
                      {incident.id}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#21262D] text-[#C9D1D9]">
                      {incident.severity} · {incident.status}
                    </span>
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                        isDemoRecord
                          ? 'bg-[#8B5CF6]/10 text-[#A78BFA] border-[#8B5CF6]/30'
                          : 'bg-[#10B981]/15 text-[#10B981] border-[#10B981]/30'
                      }`}
                    >
                      {isDemoRecord
                        ? 'FICTIONAL DEMO ARCHIVE'
                        : 'SAVED USER INVESTIGATION'}
                    </span>
                    {isCurrent && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#38BDF8]/15 text-[#38BDF8] border border-[#38BDF8]/30">
                        ACTIVE WORKSPACE INCIDENT
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {!isCurrent && (
                      <button
                        onClick={() => setSelectedHistoricalId(incident.id)}
                        className="h-[26px] px-2.5 text-[11px] font-mono bg-[#21262D] text-[#A78BFA] border border-[#8B5CF6]/40 rounded hover:bg-[#30363D] cursor-pointer"
                      >
                        Compare with {currentIncident.id}
                      </button>
                    )}
                    <button
                      onClick={() => onSelectIncident(incident.id, 'workspace')}
                      className="h-[26px] px-2.5 text-[11px] font-mono bg-[#161B22] text-[#F0F6FC] border border-[#30363D] rounded hover:bg-[#21262D] flex items-center gap-1 cursor-pointer"
                    >
                      Open in Workspace
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                <div>
                  <div className="text-sm font-semibold text-[#F0F6FC]">
                    {incident.title}
                  </div>
                  <p className="text-xs text-[#8B949E] mt-0.5">
                    {incident.summary}
                  </p>
                </div>

                {/* Extracted Technical Signatures */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-mono text-[#8B949E] uppercase">
                    Extracted Technical Signatures:
                  </span>
                  {extractedSignatures.length === 0 ? (
                    <span className="text-[10px] font-mono text-[#8B949E]">
                      None
                    </span>
                  ) : (
                    extractedSignatures.map((sig) => (
                      <span
                        key={sig}
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#161B22] text-[#38BDF8] border border-[#30363D]"
                      >
                        {sig}
                      </span>
                    ))
                  )}
                </div>

                {/* Matched Source Records */}
                <div className="pt-2 border-t border-[#161B22] flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-mono text-[#8B949E] uppercase">
                    Matched Source Records ({matchedRecords.length}):
                  </span>
                  {matchedRecords.map((rec) => (
                    <button
                      key={rec.id}
                      onClick={() => handleOpenRecordModal(rec.id, incident.id)}
                      className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#161B22] text-[#C9D1D9] border border-[#30363D] hover:border-[#38BDF8] hover:text-[#38BDF8] cursor-pointer"
                      title={rec.summary}
                    >
                      [{rec.id}] {rec.service} ({rec.type})
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Record Provenance Inspector Modal */}
      {inspectedRecordInfo && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-[#161B22] border border-[#484F58] rounded-lg max-w-2xl w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#30363D]">
              <div className="flex items-center gap-2">
                <FileSearch className="w-4 h-4 text-[#38BDF8]" />
                <h3 className="text-sm font-mono font-bold text-[#F0F6FC]">
                  Source Record Provenance: [{inspectedRecordInfo.record.id}] (
                  {inspectedRecordInfo.incident.id})
                </h3>
              </div>
              <button
                onClick={() => setInspectedRecordInfo(null)}
                className="text-xs font-mono text-[#8B949E] hover:text-[#F0F6FC] cursor-pointer"
              >
                [CLOSE]
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono">
                <div className="p-2 bg-[#0D1117] border border-[#21262D] rounded">
                  <span className="text-[10px] text-[#8B949E] block">
                    RECORD ID
                  </span>
                  <span className="text-[#38BDF8] font-bold">
                    {inspectedRecordInfo.record.id}
                  </span>
                </div>
                <div className="p-2 bg-[#0D1117] border border-[#21262D] rounded">
                  <span className="text-[10px] text-[#8B949E] block">
                    SERVICE
                  </span>
                  <span className="text-[#F0F6FC]">
                    {inspectedRecordInfo.record.service}
                  </span>
                </div>
                <div className="p-2 bg-[#0D1117] border border-[#21262D] rounded">
                  <span className="text-[10px] text-[#8B949E] block">
                    TYPE / SEVERITY
                  </span>
                  <span className="text-[#A78BFA]">
                    {inspectedRecordInfo.record.type} ·{' '}
                    {inspectedRecordInfo.record.severity}
                  </span>
                </div>
                <div className="p-2 bg-[#0D1117] border border-[#21262D] rounded">
                  <span className="text-[10px] text-[#8B949E] block">
                    TIMESTAMP (UTC)
                  </span>
                  <span className="text-[#C9D1D9]">
                    {inspectedRecordInfo.record.timestamp}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-[#0D1117] border border-[#21262D] rounded">
                <span className="text-[10px] font-mono text-[#8B949E] uppercase block mb-1">
                  Summary
                </span>
                <p className="text-[#F0F6FC]">
                  {inspectedRecordInfo.record.summary}
                </p>
              </div>

              <div className="p-3 bg-[#0D1117] border border-[#21262D] rounded">
                <span className="text-[10px] font-mono text-[#8B949E] uppercase block mb-1">
                  Immutable Raw Telemetry Payload
                </span>
                <pre className="text-[11px] font-mono text-[#C9D1D9] overflow-x-auto max-h-56">
                  {inspectedRecordInfo.record.rawPayload}
                </pre>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-[#30363D]">
              <span className="text-[11px] font-mono text-[#8B949E]">
                Investigation: {inspectedRecordInfo.incident.id} (
                {isFictionalDemoIncident(inspectedRecordInfo.incident)
                  ? 'Fictional Demo Archive'
                  : 'Saved User Investigation'}
                )
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const incId = inspectedRecordInfo.incident.id;
                    const recId = inspectedRecordInfo.record.id;
                    setInspectedRecordInfo(null);
                    onInspectRecordInWorkspace(incId, recId);
                  }}
                  className="h-[30px] px-3 text-xs font-mono bg-[#8B5CF6] text-white rounded hover:bg-[#7C3AED] flex items-center gap-1.5 cursor-pointer"
                >
                  Open in Investigation Workspace
                  <ExternalLink className="w-3 h-3" />
                </button>
                <button
                  onClick={() => setInspectedRecordInfo(null)}
                  className="h-[30px] px-3 text-xs font-mono bg-[#21262D] text-[#C9D1D9] border border-[#30363D] rounded cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
