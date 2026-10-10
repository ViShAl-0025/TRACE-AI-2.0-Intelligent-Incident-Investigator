import React, { useState } from 'react';
import {
  AlertCircle,
  Beaker,
  CheckCircle2,
  Cpu,
  FlaskConical,
  HelpCircle,
  Loader2,
  Plus,
  Scale,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import {
  ActiveScreen,
  FalsificationProtocol,
  Hypothesis,
  IncidentInvestigation,
} from '../types/trace';

interface HypothesisLabViewProps {
  incident: IncidentInvestigation;
  onSelectRecord: (recordId: string, navigateTo?: ActiveScreen) => void;
  onNavigateToWhatIf: (presetId?: string) => void;
  onUpdateFalsificationStatus: (
    hypothesisId: string,
    status: FalsificationProtocol['status']
  ) => void;
  onAddHypothesis: (hypothesis: Hypothesis) => void;
  onRunGeminiAnalysis: () => Promise<void>;
  isAnalyzingGemini: boolean;
}

export const HypothesisLabView: React.FC<HypothesisLabViewProps> = ({
  incident,
  onSelectRecord,
  onNavigateToWhatIf,
  onUpdateFalsificationStatus,
  onAddHypothesis,
  onRunGeminiAnalysis,
  isAnalyzingGemini,
}) => {
  const [isNewHypModalOpen, setIsNewHypModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Infrastructure / Config');
  const [summary, setSummary] = useState('');
  const [supportingId, setSupportingId] = useState(incident.records[0]?.id || '');
  const [supportingReason, setSupportingReason] = useState('');
  const [contradictoryId, setContradictoryId] = useState(incident.records[1]?.id || '');
  const [contradictoryReason, setContradictoryReason] = useState('');
  const [missingDesc, setMissingDesc] = useState('');
  const [limitationDesc, setLimitationDesc] = useState('');
  const [falsificationAction, setFalsificationAction] = useState('');

  const handleCreateHypothesis = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !summary.trim() || !falsificationAction.trim()) return;

    const newHyp: Hypothesis = {
      id: `HYP-0${incident.hypotheses.length + 1}`,
      title: title.trim(),
      category: category.trim(),
      plausibilityScore: 52,
      baselineScore: 52,
      statusLabel: 'Competing Co-Factor',
      summary: summary.trim(),
      supportingEvidence: supportingId
        ? [
            {
              recordId: supportingId,
              reason:
                supportingReason.trim() ||
                `Corroborates ${title.trim()} via ${supportingId}.`,
              weight: 20,
            },
          ]
        : [],
      contradictoryEvidence: contradictoryId
        ? [
            {
              recordId: contradictoryId,
              reason:
                contradictoryReason.trim() ||
                `Alternative signal observed in ${contradictoryId}.`,
              weight: -10,
            },
          ]
        : [],
      missingInformation: [
        {
          id: `MIS-CUST-${Date.now()}`,
          description:
            missingDesc.trim() ||
            'Additional pod-level telemetry required to isolate this mechanism.',
          targetService: incident.affectedServices[0]?.name || 'checkout-service',
          expectedRecordType: 'log',
        },
      ],
      confidenceLimitations: [
        limitationDesc.trim() ||
          'Requires executing the falsification test to disambiguate from competing hypotheses.',
      ],
      falsificationTest: {
        testAction: falsificationAction.trim(),
        expectedIfTrue: 'Error rate and latency return to baseline.',
        expectedIfFalse: 'Incident symptoms persist unchanged.',
        status: 'untested',
      },
    };

    onAddHypothesis(newHyp);
    setIsNewHypModalOpen(false);
    setTitle('');
    setSummary('');
    setFalsificationAction('');
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="bg-[#161B22] border border-[#30363D] rounded p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-[#8B949E] mb-1">
            <span>EPISTEMIC HYPOTHESIS LAB</span>
            <span>·</span>
            <span className="text-[#38BDF8]">{incident.id}</span>
          </div>
          <h1 className="text-lg font-semibold text-[#F0F6FC]">
            Competing Root-Cause Hypotheses & Falsification Protocols
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => onNavigateToWhatIf()}
            className="h-[34px] px-3 text-xs font-medium bg-[#21262D] text-[#C9D1D9] border border-[#30363D] rounded hover:bg-[#30363D] hover:text-[#F0F6FC] flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <FlaskConical className="w-3.5 h-3.5 text-[#38BDF8]" />
            Open What-If Simulator
          </button>
          <button
            onClick={onRunGeminiAnalysis}
            disabled={isAnalyzingGemini}
            className="h-[34px] px-3 text-xs font-medium bg-[#21262D] text-[#A78BFA] border border-[#8B5CF6]/40 rounded hover:bg-[#30363D] flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            {isAnalyzingGemini ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Evaluating...
              </>
            ) : (
              <>
                <Cpu className="w-3.5 h-3.5" />
                Gemini Critique
              </>
            )}
          </button>
          <button
            onClick={() => setIsNewHypModalOpen(true)}
            className="h-[34px] px-3.5 text-xs font-medium bg-[#8B5CF6] text-white border border-[#A78BFA] rounded hover:bg-[#7C3AED] flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            Propose Competing Hypothesis
          </button>
        </div>
      </div>

      {/* Honest AI Synthesis Status Strip (when analysis has been executed) */}
      {incident.geminiAnalysis && (
        <div
          className={`bg-[#161B22] border rounded p-3.5 flex flex-col gap-2 text-xs font-mono ${
            incident.geminiAnalysis.mode === 'gemini-live'
              ? 'border-[#10B981]/50'
              : 'border-[#F59E0B]/50'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`px-2 py-0.5 rounded font-semibold border ${
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
              <span className="text-[#F0F6FC]">
                Model: <strong>{incident.geminiAnalysis.modelUsed}</strong>
              </span>
              <span className="text-[#8B949E]">
                · {incident.geminiAnalysis.requestStatus}
              </span>
            </div>
            <span className="text-[#10B981]">
              Citations Verified ({incident.geminiAnalysis.ungroundedCitationsRemoved.length}{' '}
              ungrounded removed)
            </span>
          </div>
          {incident.geminiAnalysis.errorMessage && (
            <div className="text-[#F59E0B] bg-[#0D1117] border border-[#F59E0B]/30 rounded p-2">
              Fallback Diagnostic: {incident.geminiAnalysis.errorMessage}
            </div>
          )}
        </div>
      )}

      {/* Plausibility Comparison Strip */}
      <div className="bg-[#161B22] border border-[#30363D] rounded p-4">
        <div className="flex items-center justify-between text-xs font-mono text-[#8B949E] mb-3">
          <span>DETERMINISTIC PLAUSIBILITY SCORING MATRIX</span>
          <span>
            Grounded in Supporting (+) vs Contradictory (-) Evidence Weights & Unresolved Unknowns
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {incident.hypotheses.map((hyp) => {
            const delta = hyp.plausibilityScore - hyp.baselineScore;
            return (
              <div
                key={hyp.id}
                className="bg-[#0D1117] border border-[#21262D] rounded p-3 flex flex-col justify-between"
              >
                <div className="flex items-center justify-between text-xs font-mono mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[#F0F6FC] font-semibold">{hyp.id}</span>
                    <span className="text-[#484F58]">·</span>
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
                  <div className="flex items-center gap-1.5 tabular-nums">
                    <span className="text-base font-semibold text-[#F0F6FC]">
                      {hyp.plausibilityScore}%
                    </span>
                    {delta !== 0 && (
                      <span
                        className={`text-xs ${
                          delta > 0 ? 'text-[#10B981]' : 'text-[#F43F5E]'
                        }`}
                      >
                        ({delta > 0 ? `+${delta}%` : `${delta}%`} vs baseline)
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-xs font-medium text-[#C9D1D9] mb-2 truncate">
                  {hyp.title}
                </div>
                <div className="w-full h-2 bg-[#161B22] rounded overflow-hidden border border-[#30363D]">
                  <div
                    className={`h-full transition-all ${
                      hyp.plausibilityScore >= 70
                        ? 'bg-[#10B981]'
                        : hyp.plausibilityScore >= 40
                        ? 'bg-[#F59E0B]'
                        : 'bg-[#F43F5E]'
                    }`}
                    style={{ width: `${hyp.plausibilityScore}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detailed Hypothesis Cards Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {incident.hypotheses.map((hyp) => {
          const geminiCritique = incident.geminiAnalysis?.hypothesisCritique.find(
            (c) => c.hypothesisId === hyp.id
          );

          return (
            <div
              key={hyp.id}
              className="bg-[#161B22] border border-[#30363D] rounded flex flex-col justify-between"
            >
              <div className="p-5 space-y-5">
                {/* Card Header */}
                <div className="pb-3 border-b border-[#21262D]">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[#A78BFA] font-semibold">{hyp.id}</span>
                      <span className="text-[#484F58]">·</span>
                      <span className="text-[#8B949E]">{hyp.category}</span>
                    </div>
                    <span
                      className={`font-semibold ${
                        hyp.statusLabel === 'Leading Hypothesis'
                          ? 'text-[#10B981]'
                          : hyp.statusLabel === 'Competing Co-Factor'
                          ? 'text-[#F59E0B]'
                          : 'text-[#F43F5E]'
                      }`}
                    >
                      {hyp.statusLabel} ({hyp.plausibilityScore}%)
                    </span>
                  </div>
                  <h2 className="text-base font-semibold text-[#F0F6FC] leading-snug mb-2">
                    {hyp.title}
                  </h2>
                  <p className="text-xs text-[#C9D1D9] leading-relaxed">
                    {hyp.summary}
                  </p>
                </div>

                {/* 1. Supporting Evidence */}
                <div>
                  <div className="flex items-center justify-between text-xs font-mono text-[#10B981] mb-2">
                    <span className="flex items-center gap-1.5 uppercase">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Supporting Evidence ({hyp.supportingEvidence.length})
                    </span>
                    <span>Click ID to inspect source</span>
                  </div>
                  <div className="space-y-2">
                    {hyp.supportingEvidence.map((item) => (
                      <div
                        key={item.recordId}
                        className="p-2.5 bg-[#0D1117] border border-[#10B981]/25 rounded text-xs"
                      >
                        <div className="flex items-center justify-between font-mono mb-1">
                          <button
                            onClick={() => onSelectRecord(item.recordId, 'workspace')}
                            className="text-[#38BDF8] font-semibold hover:underline cursor-pointer"
                          >
                            [{item.recordId}] →
                          </button>
                          <span className="text-[#10B981] tabular-nums">
                            +{item.weight} weight
                          </span>
                        </div>
                        <p className="text-[#C9D1D9] text-[11px] leading-relaxed">
                          {item.reason}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 2. Contradictory / Ambiguous Evidence */}
                <div>
                  <div className="flex items-center justify-between text-xs font-mono text-[#F43F5E] mb-2">
                    <span className="flex items-center gap-1.5 uppercase">
                      <XCircle className="w-3.5 h-3.5" />
                      Contradictory & Ambiguous Evidence ({hyp.contradictoryEvidence.length})
                    </span>
                  </div>
                  {hyp.contradictoryEvidence.length === 0 ? (
                    <div className="p-2.5 bg-[#0D1117] border border-[#21262D] rounded text-xs text-[#8B949E]">
                      No direct contradictory records currently active in store.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {hyp.contradictoryEvidence.map((item) => (
                        <div
                          key={item.recordId}
                          className="p-2.5 bg-[#0D1117] border border-[#F43F5E]/25 rounded text-xs"
                        >
                          <div className="flex items-center justify-between font-mono mb-1">
                            <button
                              onClick={() => onSelectRecord(item.recordId, 'workspace')}
                              className="text-[#38BDF8] font-semibold hover:underline cursor-pointer"
                            >
                              [{item.recordId}] →
                            </button>
                            <span className="text-[#F43F5E] tabular-nums">
                              {item.weight} weight
                            </span>
                          </div>
                          <p className="text-[#C9D1D9] text-[11px] leading-relaxed">
                            {item.reason}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 3. Missing Information & Epistemic Gaps */}
                <div>
                  <div className="flex items-center justify-between text-xs font-mono text-[#F59E0B] mb-2">
                    <span className="flex items-center gap-1.5 uppercase">
                      <HelpCircle className="w-3.5 h-3.5" />
                      Missing Information & Evidence Gaps ({hyp.missingInformation.length})
                    </span>
                  </div>
                  <div className="space-y-2">
                    {hyp.missingInformation.map((mis) => (
                      <div
                        key={mis.id}
                        className={`p-2.5 bg-[#0D1117] border rounded text-xs ${
                          mis.resolvedByRecordId
                            ? 'border-[#10B981]/40'
                            : 'border-[#F59E0B]/30'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] mb-1">
                          <span className="text-[#F0F6FC]">
                            {mis.id} · Target: {mis.targetService} ({mis.expectedRecordType})
                          </span>
                          {mis.resolvedByRecordId ? (
                            <span className="text-[#10B981] font-semibold">
                              RESOLVED BY [{mis.resolvedByRecordId}]
                            </span>
                          ) : (
                            <button
                              onClick={() => onNavigateToWhatIf(mis.whatIfPresetId)}
                              className="text-[#A78BFA] hover:underline cursor-pointer"
                            >
                              Simulate in What-If Lab →
                            </button>
                          )}
                        </div>
                        <p className="text-[#C9D1D9] text-[11px] leading-relaxed">
                          {mis.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 4. Confidence Limitations */}
                <div className="bg-[#0D1117] border border-[#21262D] rounded p-3">
                  <div className="text-[11px] font-mono text-[#8B949E] uppercase mb-1.5 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-[#F59E0B]" />
                    Confidence Limitations & Confounding Factors
                  </div>
                  <ul className="space-y-1 text-xs text-[#C9D1D9]">
                    {hyp.confidenceLimitations.map((lim, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-[#8B949E] font-mono">•</span>
                        <span>{lim}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Grounded Critique Box — Honest LIVE GEMINI vs DETERMINISTIC FALLBACK Label */}
                {geminiCritique && incident.geminiAnalysis && (
                  <div
                    className={`bg-[#0D1117] border rounded p-3 text-xs ${
                      incident.geminiAnalysis.mode === 'gemini-live'
                        ? 'border-[#10B981]/40'
                        : 'border-[#F59E0B]/40'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono uppercase mb-1">
                      <span
                        className={
                          incident.geminiAnalysis.mode === 'gemini-live'
                            ? 'text-[#10B981] font-semibold'
                            : 'text-[#F59E0B] font-semibold'
                        }
                      >
                        {incident.geminiAnalysis.mode === 'gemini-live'
                          ? 'LIVE GEMINI CRITIQUE'
                          : 'DETERMINISTIC FALLBACK CRITIQUE'}{' '}
                        · {incident.geminiAnalysis.modelUsed}
                      </span>
                      <span className="text-[#8B949E] text-[10px]">
                        {incident.geminiAnalysis.requestStatus}
                      </span>
                    </div>
                    <p className="text-[#C9D1D9] mb-1">{geminiCritique.assessment}</p>
                    <p className="text-[11px] font-mono text-[#F59E0B]">
                      Uncertainty: {geminiCritique.keyUncertainty}
                    </p>
                  </div>
                )}
              </div>

              {/* 5. Falsification Test Protocol Footer */}
              <div className="p-4 bg-[#0D1117] border-t border-[#30363D] rounded-b space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-mono text-[#38BDF8] uppercase flex items-center gap-1.5 font-semibold">
                    <Beaker className="w-3.5 h-3.5" />
                    Falsification Test Protocol
                  </div>
                  <div className="flex items-center gap-1">
                    {(
                      ['untested', 'confirmed', 'falsified', 'inconclusive'] as const
                    ).map((st) => (
                      <button
                        key={st}
                        onClick={() => onUpdateFalsificationStatus(hyp.id, st)}
                        className={`h-[24px] px-2 text-[10px] font-mono uppercase rounded transition-colors cursor-pointer ${
                          hyp.falsificationTest.status === st
                            ? st === 'confirmed'
                              ? 'bg-[#10B981] text-[#0D1117] font-semibold'
                              : st === 'falsified'
                              ? 'bg-[#F43F5E] text-white font-semibold'
                              : 'bg-[#8B5CF6] text-white'
                            : 'bg-[#161B22] text-[#8B949E] border border-[#30363D] hover:text-[#F0F6FC]'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>

                <p className="text-xs text-[#F0F6FC] font-medium leading-relaxed">
                  {hyp.falsificationTest.testAction}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2 bg-[#161B22] border border-[#21262D] rounded">
                    <span className="font-mono text-[#10B981] block mb-0.5">
                      IF HYPOTHESIS TRUE:
                    </span>
                    <span className="text-[#C9D1D9]">
                      {hyp.falsificationTest.expectedIfTrue}
                    </span>
                  </div>
                  <div className="p-2 bg-[#161B22] border border-[#21262D] rounded">
                    <span className="font-mono text-[#F43F5E] block mb-0.5">
                      IF DISPROVED / FALSE:
                    </span>
                    <span className="text-[#C9D1D9]">
                      {hyp.falsificationTest.expectedIfFalse}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Propose Competing Hypothesis Modal */}
      {isNewHypModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-[#161B22] border border-[#484F58] rounded-lg max-w-lg w-full p-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#30363D] mb-4">
              <h3 className="text-base font-semibold text-[#F0F6FC]">
                Propose Competing Forensic Hypothesis
              </h3>
              <button
                onClick={() => setIsNewHypModalOpen(false)}
                className="text-xs font-mono text-[#8B949E] hover:text-[#F0F6FC] cursor-pointer"
              >
                [ESC]
              </button>
            </div>

            <form onSubmit={handleCreateHypothesis} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-mono text-[#8B949E] mb-1">
                  Hypothesis Title *
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Envoy Ingress Keep-Alive Pool Exhaustion on Edge Router"
                  className="w-full h-[32px] px-2.5 bg-[#0D1117] border border-[#30363D] rounded text-[#F0F6FC]"
                />
              </div>

              <div>
                <label className="block font-mono text-[#8B949E] mb-1">
                  Mechanism & Explanation *
                </label>
                <textarea
                  rows={2}
                  required
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="Explain the causal mechanism and how it connects the observed telemetry..."
                  className="w-full p-2.5 bg-[#0D1117] border border-[#30363D] rounded text-[#F0F6FC]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-mono text-[#10B981] mb-1">
                    Supporting Record ID
                  </label>
                  <select
                    value={supportingId}
                    onChange={(e) => setSupportingId(e.target.value)}
                    className="w-full h-[32px] px-2 font-mono bg-[#0D1117] border border-[#30363D] rounded text-[#F0F6FC]"
                  >
                    {incident.records.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.id} ({r.service})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-mono text-[#F43F5E] mb-1">
                    Contradictory Record ID
                  </label>
                  <select
                    value={contradictoryId}
                    onChange={(e) => setContradictoryId(e.target.value)}
                    className="w-full h-[32px] px-2 font-mono bg-[#0D1117] border border-[#30363D] rounded text-[#F0F6FC]"
                  >
                    {incident.records.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.id} ({r.service})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-mono text-[#F59E0B] mb-1">
                  Missing Information / Evidence Required
                </label>
                <input
                  type="text"
                  value={missingDesc}
                  onChange={(e) => setMissingDesc(e.target.value)}
                  placeholder="e.g. Envoy upstream connection pool metrics from api-edge-router"
                  className="w-full h-[32px] px-2.5 bg-[#0D1117] border border-[#30363D] rounded text-[#F0F6FC]"
                />
              </div>

              <div>
                <label className="block font-mono text-[#38BDF8] mb-1">
                  Falsification Test Action *
                </label>
                <textarea
                  rows={2}
                  required
                  value={falsificationAction}
                  onChange={(e) => setFalsificationAction(e.target.value)}
                  placeholder="Describe the concrete engineering test that would disprove this hypothesis..."
                  className="w-full p-2.5 bg-[#0D1117] border border-[#30363D] rounded text-[#F0F6FC]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#30363D]">
                <button
                  type="button"
                  onClick={() => setIsNewHypModalOpen(false)}
                  className="h-[32px] px-3 bg-[#21262D] text-[#C9D1D9] border border-[#30363D] rounded cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="h-[32px] px-3.5 bg-[#8B5CF6] text-white border border-[#A78BFA] rounded cursor-pointer"
                >
                  Add Hypothesis
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
