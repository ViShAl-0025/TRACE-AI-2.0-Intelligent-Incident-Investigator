import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FileCode2,
  FileSpreadsheet,
  ShieldAlert,
  Upload,
  XCircle,
} from 'lucide-react';
import {
  ActiveScreen,
  IncidentInvestigation,
  SourceRecord,
} from '../types/trace';
import { SAMPLE_INGESTION_BATCHES } from '../data/sampleIncidents';
import { validateIngestionPayload } from '../engine/forensicEngine';

interface DataIngestionViewProps {
  incident: IncidentInvestigation;
  onIngestRecords: (newRecords: SourceRecord[]) => void;
  onNavigate: (screen: ActiveScreen) => void;
}

export const DataIngestionView: React.FC<DataIngestionViewProps> = ({
  incident,
  onIngestRecords,
  onNavigate,
}) => {
  const [format, setFormat] = useState<'json' | 'csv'>('json');
  const [rawInput, setRawInput] = useState<string>(
    SAMPLE_INGESTION_BATCHES.jvm_diagnostics.payload
  );
  const [lastIngestedCount, setLastIngestedCount] = useState<number | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const validation = useMemo(() => {
    if (!rawInput.trim()) return { rows: [] };
    return validateIngestionPayload(rawInput, format, incident.records);
  }, [rawInput, format, incident.records]);

  const validRecordsToIngest = useMemo(() => {
    return validation.rows
      .filter((r) => (r.status === 'valid' || r.status === 'warning') && r.sanitizedRecord)
      .map((r) => r.sanitizedRecord!);
  }, [validation.rows]);

  const rejectedCount = validation.rows.filter((r) => r.status === 'rejected').length;
  const warningCount = validation.rows.filter((r) => r.status === 'warning').length;

  const handleLoadSample = (batchKey: keyof typeof SAMPLE_INGESTION_BATCHES) => {
    const batch = SAMPLE_INGESTION_BATCHES[batchKey];
    if (!batch) return;
    setFormat(batch.format);
    setRawInput(batch.payload);
    setUploadedFileName(null);
    setLastIngestedCount(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFileName(file.name);
    setLastIngestedCount(null);

    if (file.name.toLowerCase().endsWith('.csv')) {
      setFormat('csv');
    } else {
      setFormat('json');
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = typeof ev.target?.result === 'string' ? ev.target.result : '';
      setRawInput(content);
    };
    reader.readAsText(file);
  };

  const handleCommitIngestion = () => {
    if (validRecordsToIngest.length === 0) return;
    onIngestRecords(validRecordsToIngest);
    setLastIngestedCount(validRecordsToIngest.length);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-[#161B22] border border-[#30363D] rounded p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-[#8B949E] mb-1">
            <span>UNTRUSTED TELEMETRY INGESTION PIPELINE</span>
            <span>·</span>
            <span className="text-[#38BDF8]">{incident.id}</span>
          </div>
          <h1 className="text-lg font-semibold text-[#F0F6FC]">
            Data Ingestion, Schema Validation & Sanitization
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.csv,.txt"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="h-[34px] px-3.5 text-xs font-medium bg-[#21262D] text-[#F0F6FC] border border-[#30363D] rounded hover:bg-[#30363D] flex items-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5 text-[#38BDF8]" />
            Upload .JSON / .CSV File
          </button>

          <button
            onClick={handleCommitIngestion}
            disabled={validRecordsToIngest.length === 0}
            className="h-[34px] px-4 text-xs font-medium bg-[#8B5CF6] text-white border border-[#A78BFA] rounded hover:bg-[#7C3AED] disabled:opacity-40 flex items-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <Database className="w-3.5 h-3.5" />
            Commit Validated Records ({validRecordsToIngest.length})
          </button>
        </div>
      </div>

      {/* Confirmation Banner */}
      {lastIngestedCount !== null && (
        <div className="bg-[#10B981]/15 border border-[#10B981]/40 rounded p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-[#10B981] font-mono">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>
              Successfully ingested {lastIngestedCount} record(s) with preserved IDs and
              ISO-8601 timestamps into {incident.id}. Evidence Graph and Hypotheses
              recomputed.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onNavigate('evidence-graph')}
              className="h-[28px] px-2.5 font-mono bg-[#0D1117] text-[#38BDF8] border border-[#30363D] rounded hover:bg-[#21262D] cursor-pointer"
            >
              View Updated Graph →
            </button>
            <button
              onClick={() => onNavigate('hypothesis-lab')}
              className="h-[28px] px-2.5 font-mono bg-[#0D1117] text-[#A78BFA] border border-[#30363D] rounded hover:bg-[#21262D] cursor-pointer"
            >
              Inspect Hypothesis Shifts →
            </button>
          </div>
        </div>
      )}

      {/* Curated Sample Telemetry Batches */}
      <div className="bg-[#161B22] border border-[#30363D] rounded p-4">
        <div className="text-xs font-mono text-[#8B949E] uppercase mb-3">
          Load Curated Sample Telemetry Batches (Test JSON, CSV, and Untrusted Payload Validation)
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {Object.entries(SAMPLE_INGESTION_BATCHES).map(([key, batch]) => (
            <button
              key={key}
              onClick={() =>
                handleLoadSample(key as keyof typeof SAMPLE_INGESTION_BATCHES)
              }
              className="text-left p-3 bg-[#0D1117] border border-[#30363D] rounded hover:border-[#8B5CF6] transition-colors cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between text-xs font-mono mb-1">
                  <span className="text-[#F0F6FC] font-semibold">{batch.name}</span>
                  <span className="text-[#38BDF8] uppercase">{batch.format}</span>
                </div>
                <p className="text-[11px] text-[#8B949E] leading-relaxed">
                  {batch.description}
                </p>
              </div>
              <div className="mt-2 text-[11px] font-mono text-[#A78BFA]">
                Load into Inspector →
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main Split: Raw Payload Editor (Left 5 cols) + Validation & Provenance Preview Table (Right 7 cols) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Raw Payload Editor */}
        <div className="xl:col-span-5 bg-[#161B22] border border-[#30363D] rounded flex flex-col">
          <div className="p-3.5 border-b border-[#30363D] flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#F0F6FC]">
              {format === 'json' ? (
                <FileCode2 className="w-4 h-4 text-[#38BDF8]" />
              ) : (
                <FileSpreadsheet className="w-4 h-4 text-[#10B981]" />
              )}
              <span>
                Raw Payload Buffer {uploadedFileName ? `(${uploadedFileName})` : ''}
              </span>
            </div>

            <div className="flex items-center gap-1 bg-[#0D1117] p-0.5 rounded border border-[#30363D]">
              <button
                onClick={() => setFormat('json')}
                className={`h-[24px] px-2.5 text-xs font-mono rounded cursor-pointer ${
                  format === 'json'
                    ? 'bg-[#8B5CF6] text-white'
                    : 'text-[#8B949E] hover:text-[#F0F6FC]'
                }`}
              >
                JSON
              </button>
              <button
                onClick={() => setFormat('csv')}
                className={`h-[24px] px-2.5 text-xs font-mono rounded cursor-pointer ${
                  format === 'csv'
                    ? 'bg-[#8B5CF6] text-white'
                    : 'text-[#8B949E] hover:text-[#F0F6FC]'
                }`}
              >
                CSV
              </button>
            </div>
          </div>

          <div className="p-3 flex-1 flex flex-col">
            <textarea
              value={rawInput}
              onChange={(e) => {
                setRawInput(e.target.value);
                setLastIngestedCount(null);
              }}
              rows={18}
              spellCheck={false}
              placeholder={
                format === 'json'
                  ? 'Paste JSON array of records with id, timestamp, type, service, summary...'
                  : 'Paste CSV with header: id,timestamp,type,service,severity,summary,traceId...'
              }
              className="w-full flex-1 p-3 text-xs font-mono bg-[#0D1117] border border-[#21262D] rounded text-[#C9D1D9] focus:outline-none focus:border-[#8B5CF6] leading-relaxed"
            />
            <div className="mt-2 flex items-center justify-between text-[11px] font-mono text-[#8B949E]">
              <span>Untrusted content is parsed in sandbox; scripts stripped</span>
              <button
                onClick={() => setRawInput('')}
                className="text-[#F43F5E] hover:underline cursor-pointer"
              >
                Clear Buffer
              </button>
            </div>
          </div>
        </div>

        {/* Validation & Preview Table */}
        <div className="xl:col-span-7 bg-[#161B22] border border-[#30363D] rounded flex flex-col">
          <div className="p-3.5 border-b border-[#30363D] flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-[#F0F6FC]">
                Pre-Ingestion Validation & ID Preservation Preview
              </h2>
            </div>

            <div className="flex items-center gap-3 text-xs font-mono">
              <span className="text-[#10B981]">
                Valid: {validRecordsToIngest.length}
              </span>
              <span className="text-[#F59E0B]">Warnings: {warningCount}</span>
              <span className="text-[#F43F5E]">Rejected: {rejectedCount}</span>
            </div>
          </div>

          {validation.parseError ? (
            <div className="p-6">
              <div className="bg-[#F43F5E]/15 border border-[#F43F5E]/40 rounded p-4 text-xs font-mono text-[#F43F5E] flex items-start gap-2.5">
                <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold mb-1">
                    Schema / Syntax Parse Failure
                  </div>
                  <div>{validation.parseError}</div>
                </div>
              </div>
            </div>
          ) : validation.rows.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#8B949E]">
              Paste JSON/CSV telemetry or choose a sample batch above to preview validation.
            </div>
          ) : (
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#21262D] text-[11px] font-mono text-[#8B949E] uppercase bg-[#0D1117]/60">
                    <th className="py-2.5 px-3">Row</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Preserved ID</th>
                    <th className="py-2.5 px-3">ISO-8601 Timestamp</th>
                    <th className="py-2.5 px-3">Service & Type</th>
                    <th className="py-2.5 px-3">Validation / Sanitization Audit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#21262D] text-xs">
                  {validation.rows.map((row) => {
                    const rec = row.sanitizedRecord;
                    return (
                      <tr key={row.rowIndex} className="hover:bg-[#21262D]/40">
                        <td className="py-3 px-3 font-mono tabular-nums text-[#8B949E]">
                          #{row.rowIndex}
                        </td>
                        <td className="py-3 px-3 font-mono">
                          {row.status === 'valid' ? (
                            <span className="text-[#10B981] flex items-center gap-1 font-semibold">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              VALID
                            </span>
                          ) : row.status === 'warning' ? (
                            <span className="text-[#F59E0B] flex items-center gap-1 font-semibold">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              SANITIZED
                            </span>
                          ) : (
                            <span className="text-[#F43F5E] flex items-center gap-1 font-semibold">
                              <XCircle className="w-3.5 h-3.5" />
                              REJECTED
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 font-mono text-[#38BDF8] font-semibold">
                          {rec?.id || String(row.rawRecord.id || 'MISSING')}
                        </td>
                        <td className="py-3 px-3 font-mono tabular-nums text-[#C9D1D9]">
                          {rec?.timestamp || String(row.rawRecord.timestamp || 'INVALID')}
                        </td>
                        <td className="py-3 px-3 font-mono text-[#8B949E]">
                          {rec
                            ? `${rec.service} · ${rec.type}`
                            : `${String(row.rawRecord.service || '?')} · ${String(
                                row.rawRecord.type || '?'
                              )}`}
                        </td>
                        <td className="py-3 px-3">
                          {rec && (
                            <div className="text-[#F0F6FC] mb-1 line-clamp-2">
                              {rec.summary}
                            </div>
                          )}
                          <ul className="space-y-0.5 text-[11px] font-mono">
                            {row.messages.map((msg, i) => (
                              <li
                                key={i}
                                className={
                                  row.status === 'rejected'
                                    ? 'text-[#F43F5E]'
                                    : row.status === 'warning'
                                    ? 'text-[#F59E0B]'
                                    : 'text-[#8B949E]'
                                }
                              >
                                • {msg}
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
