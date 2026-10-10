import React, { useMemo, useState } from 'react';
import {
  BookmarkCheck,
  Check,
  Copy,
  Download,
  FileCode2,
  FileText,
  Printer,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { IncidentInvestigation, SavedReportSnapshot } from '../types/trace';
import {
  calculateEvidenceCompleteness,
  runVerificationSuite,
} from '../engine/forensicEngine';

interface ReportViewProps {
  incident: IncidentInvestigation;
  savedReports?: SavedReportSnapshot[];
  onSaveReportSnapshot?: (snapshot: SavedReportSnapshot) => void;
  onDeleteReportSnapshot?: (reportId: string) => void;
  onSelectRecord: (recordId: string) => void;
}

export const ReportView: React.FC<ReportViewProps> = ({
  incident,
  savedReports = [],
  onSaveReportSnapshot,
  onDeleteReportSnapshot,
  onSelectRecord,
}) => {
  const [copiedMd, setCopiedMd] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const [justSavedSnapshot, setJustSavedSnapshot] = useState(false);

  const completeness = calculateEvidenceCompleteness(incident);
  const verificationChecks = runVerificationSuite(incident);
  const passedChecks = verificationChecks.filter((c) => c.status === 'PASS').length;

  const sortedRecords = useMemo(() => {
    return [...incident.records].sort((a, b) => {
      const ta = Date.parse(a.timestamp) || 0;
      const tb = Date.parse(b.timestamp) || 0;
      return ta - tb;
    });
  }, [incident.records]);

  const allUnknowns = useMemo(() => {
    return incident.hypotheses.flatMap((h) =>
      h.missingInformation.map((m) => ({
        hypothesisId: h.id,
        ...m,
      }))
    );
  }, [incident.hypotheses]);

  // Construct complete Markdown Postmortem Document
  const markdownReport = useMemo(() => {
    const lines: string[] = [
      `# TRACE AI 2.0 — FORENSIC INCIDENT INVESTIGATION REPORT`,
      `**Incident ID:** ${incident.id}`,
      `**Title:** ${incident.title}`,
      `**Severity:** ${incident.severity} | **Status:** ${incident.status}`,
      `**Environment:** ${incident.environment} | **Commander:** ${incident.commander}`,
      `**Evidence Completeness:** ${completeness.percentage}% | **Verification Checks:** ${passedChecks}/${verificationChecks.length} PASS`,
      `**Mode Notice:** Grounded Deterministic + AI Forensic Analysis (Demo Mode — Local Telemetry Store)`,
      ...(incident.geminiAnalysis
        ? [
            `**Synthesis Execution Mode:** ${
              incident.geminiAnalysis.executionLabel ||
              (incident.geminiAnalysis.mode === 'gemini-live'
                ? 'LIVE GEMINI'
                : 'DETERMINISTIC FALLBACK')
            }`,
            `**Model Used:** ${incident.geminiAnalysis.modelUsed} (Requested: ${
              incident.geminiAnalysis.requestedModel || 'gemini-3.8-flash'
            })`,
            `**Request Status:** ${incident.geminiAnalysis.requestStatus}`,
            ...(incident.geminiAnalysis.errorMessage
              ? [`**Fallback / Error Diagnostic:** ${incident.geminiAnalysis.errorMessage}`]
              : []),
          ]
        : [
            `**Synthesis Execution Mode:** DETERMINISTIC BASELINE (On-demand Gemini synthesis not yet triggered)`,
          ]),
      ``,
      `## 1. Executive Summary`,
      incident.summary,
      ``,
      `## 2. Customer & Blast Radius Impact`,
      incident.customerImpact,
      ``,
      `### Affected Service Components`,
      ...incident.affectedServices.map(
        (s) =>
          `- **${s.name}** (${s.tier}): Status=${s.status}, ErrorRate=${s.errorRate}, p99=${s.p99Latency} [Owner: ${s.ownerTeam}]`
      ),
      ``,
      `## 3. Verified Grounded Facts & Source Provenance`,
      ...sortedRecords.map(
        (r) =>
          `- **[${r.id}]** (${r.timestamp} · ${r.service} · ${r.type.toUpperCase()} · Origin: ${r.sourceOrigin}): ${r.summary}`
      ),
      ``,
      `## 4. Competing Root-Cause Hypotheses`,
      ...incident.hypotheses.flatMap((h) => [
        `### ${h.id}: ${h.title}`,
        `- **Status:** ${h.statusLabel} | **Plausibility Score:** ${h.plausibilityScore}% (Baseline: ${h.baselineScore}%)`,
        `- **Mechanism:** ${h.summary}`,
        `- **Supporting Evidence:** ${
          h.supportingEvidence
            .map((s) => `[${s.recordId}] (+${s.weight}: ${s.reason})`)
            .join('; ') || 'None'
        }`,
        `- **Contradictory Evidence:** ${
          h.contradictoryEvidence
            .map((c) => `[${c.recordId}] (${c.weight}: ${c.reason})`)
            .join('; ') || 'None'
        }`,
        `- **Confidence Limitations:** ${h.confidenceLimitations.join(' | ')}`,
        `- **Falsification Test (${h.falsificationTest.status.toUpperCase()}):** ${
          h.falsificationTest.testAction
        }`,
        ``,
      ]),
      `## 5. Open Unknowns & Missing Evidence`,
      ...allUnknowns.map(
        (u) =>
          `- **[${u.id}]** (${u.hypothesisId} · ${u.targetService}): ${u.description} — Status: ${
            u.resolvedByRecordId ? `RESOLVED by [${u.resolvedByRecordId}]` : 'UNRESOLVED'
          }`
      ),
      ``,
      `## 6. Remediation & Engineering Recommendations`,
      ...incident.recommendations.map((rec, idx) => `${idx + 1}. ${rec}`),
      ``,
    ];
    return lines.join('\n');
  }, [incident, completeness, passedChecks, verificationChecks.length, sortedRecords, allUnknowns]);

  const handleCopyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(markdownReport);
      setCopiedMd(true);
      setTimeout(() => setCopiedMd(false), 2000);
    } catch {
      // Fallback textarea copy
      const ta = document.createElement('textarea');
      ta.value = markdownReport;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopiedMd(true);
      setTimeout(() => setCopiedMd(false), 2000);
    }
  };

  const handleCopyJson = async () => {
    const bundle = JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        generator: 'TRACE AI 2.0 Forensic Engine',
        demoMode: true,
        evidenceCompleteness: completeness,
        verificationAudit: verificationChecks,
        incident,
      },
      null,
      2
    );
    try {
      await navigator.clipboard.writeText(bundle);
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 2000);
    } catch {
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 2000);
    }
  };

  const handleDownloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header & Working Export / Copy Actions */}
      <div className="bg-[#161B22] border border-[#30363D] rounded p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-[#8B949E] mb-1">
            <span>POSTMORTEM & FORENSIC DOSSIER</span>
            <span>·</span>
            <span className="text-[#38BDF8]">{incident.id}</span>
          </div>
          <h1 className="text-lg font-semibold text-[#F0F6FC]">
            Grounded Investigation Report & Export Bundle
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onSaveReportSnapshot && (
            <button
              onClick={() => {
                const nowIso = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
                const synthesisLabel = incident.geminiAnalysis
                  ? incident.geminiAnalysis.executionLabel ||
                    (incident.geminiAnalysis.mode === 'gemini-live'
                      ? 'LIVE GEMINI'
                      : 'DETERMINISTIC FALLBACK')
                  : 'DETERMINISTIC BASELINE';
                onSaveReportSnapshot({
                  id: `RPT-${incident.id}-${Date.now().toString().slice(-5)}`,
                  incidentId: incident.id,
                  incidentTitle: incident.title,
                  savedAt: nowIso,
                  completenessPercentage: completeness.percentage,
                  passedChecks,
                  totalChecks: verificationChecks.length,
                  synthesisExecutionLabel: synthesisLabel,
                  markdownReport,
                });
                setJustSavedSnapshot(true);
                setTimeout(() => setJustSavedSnapshot(false), 2000);
              }}
              className="h-[34px] px-3 text-xs font-medium bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/40 rounded hover:bg-[#10B981]/25 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              title="Save this generated report snapshot to browser localStorage across reloads"
            >
              {justSavedSnapshot ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Snapshot Saved!</span>
                </>
              ) : (
                <>
                  <BookmarkCheck className="w-3.5 h-3.5" />
                  <span>Save Report Snapshot</span>
                </>
              )}
            </button>
          )}

          <button
            onClick={handleCopyMarkdown}
            className="h-[34px] px-3 text-xs font-medium bg-[#21262D] text-[#F0F6FC] border border-[#30363D] rounded hover:bg-[#30363D] flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            {copiedMd ? (
              <>
                <Check className="w-3.5 h-3.5 text-[#10B981]" />
                <span className="text-[#10B981]">Copied Markdown!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-[#38BDF8]" />
                <span>Copy Markdown</span>
              </>
            )}
          </button>

          <button
            onClick={handleCopyJson}
            className="h-[34px] px-3 text-xs font-medium bg-[#21262D] text-[#C9D1D9] border border-[#30363D] rounded hover:bg-[#30363D] flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            {copiedJson ? (
              <>
                <Check className="w-3.5 h-3.5 text-[#10B981]" />
                <span className="text-[#10B981]">Copied JSON!</span>
              </>
            ) : (
              <>
                <FileCode2 className="w-3.5 h-3.5 text-[#A78BFA]" />
                <span>Copy JSON Bundle</span>
              </>
            )}
          </button>

          <button
            onClick={() =>
              handleDownloadFile(
                markdownReport,
                `${incident.id}-forensic-report.md`,
                'text/markdown;charset=utf-8'
              )
            }
            className="h-[34px] px-3.5 text-xs font-medium bg-[#8B5CF6] text-white border border-[#A78BFA] rounded hover:bg-[#7C3AED] flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Export .MD
          </button>

          <button
            onClick={() =>
              handleDownloadFile(
                JSON.stringify(
                  {
                    exportedAt: new Date().toISOString(),
                    evidenceCompleteness: completeness,
                    verificationAudit: verificationChecks,
                    incident,
                  },
                  null,
                  2
                ),
                `${incident.id}-forensic-bundle.json`,
                'application/json;charset=utf-8'
              )
            }
            className="h-[34px] px-3.5 text-xs font-medium bg-[#21262D] text-[#38BDF8] border border-[#38BDF8]/40 rounded hover:bg-[#30363D] flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Export .JSON
          </button>
        </div>
      </div>

      {/* Structured Forensic Dossier Document */}
      <div className="bg-[#161B22] border border-[#30363D] rounded p-6 space-y-6">
        {/* Document Metadata Header */}
        <div className="pb-5 border-b border-[#30363D] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-mono text-[#10B981] flex items-center gap-1.5 mb-1">
              <ShieldCheck className="w-4 h-4" />
              <span>
                ATTESTED FORENSIC REPORT · {passedChecks}/{verificationChecks.length}{' '}
                VERIFICATION CHECKS PASSED
              </span>
            </div>
            <h2 className="text-xl font-semibold text-[#F0F6FC]">
              {incident.id}: {incident.title}
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-[#8B949E] mt-1">
              <span>Severity: {incident.severity}</span>
              <span>·</span>
              <span>Status: {incident.status}</span>
              <span>·</span>
              <span>Commander: {incident.commander}</span>
              <span>·</span>
              <span>Environment: {incident.environment}</span>
              <span>·</span>
              <span>Completeness: {completeness.percentage}%</span>
            </div>
          </div>
          {incident.geminiAnalysis && (
            <div className="flex flex-col items-start lg:items-end gap-1 text-xs font-mono">
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
              <span className="text-[11px] text-[#C9D1D9]">
                Model: {incident.geminiAnalysis.modelUsed}
              </span>
              <span className="text-[10px] text-[#8B949E]">
                {incident.geminiAnalysis.requestStatus}
              </span>
            </div>
          )}
        </div>

        {/* Section 1 & 2: Summary and Customer Impact */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-[#0D1117] border border-[#21262D] rounded p-4">
            <h3 className="text-xs font-mono text-[#8B949E] uppercase mb-2">
              01. Executive Incident Summary
            </h3>
            <p className="text-xs text-[#F0F6FC] leading-relaxed">
              {incident.summary}
            </p>
          </div>
          <div className="bg-[#0D1117] border border-[#21262D] rounded p-4">
            <h3 className="text-xs font-mono text-[#F43F5E] uppercase mb-2">
              02. Customer & Blast Radius Impact
            </h3>
            <p className="text-xs text-[#F0F6FC] leading-relaxed">
              {incident.customerImpact}
            </p>
          </div>
        </div>

        {/* Section 3: Chronological Timeline & Verified Facts */}
        <div>
          <h3 className="text-xs font-mono text-[#8B949E] uppercase mb-3">
            03. Chronological Event Timeline & Verified Facts ({sortedRecords.length}{' '}
            Grounded Records)
          </h3>
          <div className="bg-[#0D1117] border border-[#21262D] rounded overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#21262D] text-[11px] font-mono text-[#8B949E] uppercase bg-[#161B22]">
                  <th className="py-2 px-3">UTC Timestamp</th>
                  <th className="py-2 px-3">Record ID</th>
                  <th className="py-2 px-3">Type / Origin</th>
                  <th className="py-2 px-3">Service</th>
                  <th className="py-2 px-3">Grounded Fact Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#21262D] text-xs">
                {sortedRecords.map((rec) => (
                  <tr key={rec.id} className="hover:bg-[#161B22]/60">
                    <td className="py-2.5 px-3 font-mono tabular-nums text-[#8B949E] whitespace-nowrap">
                      {rec.timestamp}
                    </td>
                    <td className="py-2.5 px-3 font-mono">
                      <button
                        onClick={() => onSelectRecord(rec.id)}
                        className="text-[#38BDF8] font-semibold hover:underline cursor-pointer"
                      >
                        {rec.id}
                      </button>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[#C9D1D9] whitespace-nowrap">
                      {rec.type} · {rec.sourceOrigin}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[#C9D1D9] whitespace-nowrap">
                      {rec.service}
                    </td>
                    <td className="py-2.5 px-3 text-[#F0F6FC]">{rec.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 4: Competing Hypotheses Evaluation */}
        <div>
          <h3 className="text-xs font-mono text-[#8B949E] uppercase mb-3">
            04. Hypotheses, Evidence Alignment & Falsification Tests
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {incident.hypotheses.map((hyp) => (
              <div
                key={hyp.id}
                className="bg-[#0D1117] border border-[#21262D] rounded p-4 space-y-2.5 text-xs"
              >
                <div className="flex items-center justify-between font-mono">
                  <span className="text-[#A78BFA] font-semibold">
                    {hyp.id} · {hyp.statusLabel}
                  </span>
                  <span className="text-[#F0F6FC] font-bold tabular-nums">
                    {hyp.plausibilityScore}% Plausibility
                  </span>
                </div>
                <div className="font-semibold text-[#F0F6FC]">{hyp.title}</div>
                <p className="text-[#C9D1D9] leading-relaxed">{hyp.summary}</p>
                <div className="pt-2 border-t border-[#21262D] font-mono text-[11px] space-y-1">
                  <div className="text-[#10B981]">
                    Supporting:{' '}
                    {hyp.supportingEvidence.map((s) => s.recordId).join(', ') || 'None'}
                  </div>
                  <div className="text-[#F43F5E]">
                    Contradictory:{' '}
                    {hyp.contradictoryEvidence.map((c) => c.recordId).join(', ') ||
                      'None'}
                  </div>
                  <div className="text-[#38BDF8]">
                    Falsification ({hyp.falsificationTest.status.toUpperCase()}):{' '}
                    <span className="text-[#C9D1D9]">
                      {hyp.falsificationTest.testAction}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Section 5 & 6: Unknowns and Recommendations */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-[#0D1117] border border-[#21262D] rounded p-4">
            <h3 className="text-xs font-mono text-[#F59E0B] uppercase mb-2.5">
              05. Open Unknowns & Missing Evidence
            </h3>
            <ul className="space-y-2 text-xs">
              {allUnknowns.map((u) => (
                <li key={u.id} className="flex items-start gap-2">
                  <span className="font-mono text-[#F59E0B] shrink-0">[{u.id}]</span>
                  <div className="text-[#C9D1D9]">
                    <span>{u.description} </span>
                    <span
                      className={`font-mono text-[11px] ${
                        u.resolvedByRecordId ? 'text-[#10B981]' : 'text-[#F59E0B]'
                      }`}
                    >
                      (
                      {u.resolvedByRecordId
                        ? `Resolved by ${u.resolvedByRecordId}`
                        : 'Unresolved'}
                      )
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-[#0D1117] border border-[#21262D] rounded p-4">
            <h3 className="text-xs font-mono text-[#10B981] uppercase mb-2.5">
              06. Remediation & Engineering Recommendations
            </h3>
            <ol className="space-y-2 text-xs text-[#F0F6FC] list-decimal list-inside">
              {incident.recommendations.map((rec, idx) => (
                <li key={idx} className="leading-relaxed">
                  {rec}
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* Raw Markdown Preview */}
        <div>
          <h3 className="text-xs font-mono text-[#8B949E] uppercase mb-2">
            Raw Exportable Markdown Preview
          </h3>
          <pre className="p-4 bg-[#0D1117] border border-[#21262D] rounded text-[11px] font-mono text-[#C9D1D9] overflow-x-auto max-h-64 leading-relaxed">
            {markdownReport}
          </pre>
        </div>

        {/* Persisted Report Snapshots Archive */}
        <div className="pt-4 border-t border-[#30363D] space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-mono text-[#38BDF8] uppercase">
              07. Persisted Report Snapshots ({savedReports.length} Saved in Browser Storage)
            </h3>
            <span className="text-[11px] font-mono text-[#8B949E]">
              Retained across page reloads in single-browser localStorage
            </span>
          </div>

          {savedReports.length === 0 ? (
            <div className="p-4 bg-[#0D1117] border border-[#21262D] rounded text-xs font-mono text-[#8B949E]">
              No report snapshots saved yet. Click &quot;Save Report Snapshot&quot; above to persist a
              point-in-time dossier snapshot across page reloads.
            </div>
          ) : (
            <div className="divide-y divide-[#21262D] bg-[#0D1117] border border-[#21262D] rounded">
              {savedReports.map((snap) => (
                <div
                  key={snap.id}
                  className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 font-mono">
                      <span className="text-[#38BDF8] font-semibold">{snap.id}</span>
                      <span className="text-[#484F58]">·</span>
                      <span className="text-[#F0F6FC]">{snap.incidentId}</span>
                      <span className="text-[#484F58]">·</span>
                      <span className="text-[#10B981]">
                        {snap.passedChecks}/{snap.totalChecks} Checks PASS
                      </span>
                      <span className="text-[#484F58]">·</span>
                      <span className="text-[#A78BFA]">{snap.synthesisExecutionLabel}</span>
                    </div>
                    <div className="text-[11px] font-mono text-[#8B949E]">
                      Saved at: {snap.savedAt} · Completeness: {snap.completenessPercentage}%
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() =>
                        handleDownloadFile(
                          snap.markdownReport,
                          `${snap.id}.md`,
                          'text/markdown;charset=utf-8'
                        )
                      }
                      className="h-[28px] px-2.5 text-[11px] font-mono bg-[#21262D] text-[#F0F6FC] border border-[#30363D] rounded hover:bg-[#30363D] flex items-center gap-1 cursor-pointer"
                    >
                      <Download className="w-3 h-3 text-[#38BDF8]" />
                      Download .MD
                    </button>
                    {onDeleteReportSnapshot && (
                      <button
                        onClick={() => onDeleteReportSnapshot(snap.id)}
                        className="h-[28px] px-2 text-[11px] font-mono bg-[#21262D] text-[#F43F5E] border border-[#30363D] rounded hover:bg-[#F43F5E]/20 flex items-center gap-1 cursor-pointer"
                        title="Delete saved report snapshot"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
