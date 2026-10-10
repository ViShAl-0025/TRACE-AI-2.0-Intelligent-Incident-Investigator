/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Beaker,
  BookmarkCheck,
  Check,
  Database,
  Download,
  FileText,
  FlaskConical,
  GitCompare,
  HardDrive,
  History,
  LayoutDashboard,
  Menu,
  Network,
  RotateCcw,
  Save,
  ShieldCheck,
  Terminal,
  X,
} from 'lucide-react';
import {
  ActiveScreen,
  FalsificationProtocol,
  GeminiForensicAnalysis,
  Hypothesis,
  IncidentInvestigation,
  IncidentStatus,
  SavedReportSnapshot,
  SourceRecord,
  WhatIfPreset,
  WhatIfSimulationEntry,
} from './types/trace';
import { INITIAL_INCIDENTS, WHAT_IF_PRESETS } from './data/sampleIncidents';
import {
  computeRelationships,
  recomputeHypotheses,
  runVerificationSuite,
} from './engine/forensicEngine';
import {
  CHECKPOINT_STORAGE_KEY,
  clearPersistedStorage,
  exportInvestigationBackupJson,
  exportWorkspaceBackupJson,
  hasManualCheckpoint,
  loadWorkspaceFromStorage,
  saveWorkspaceToStorage,
  validateAndParseBackupJson,
  WORKSPACE_STORAGE_KEY,
} from './engine/persistenceEngine';
import { CommandCenterView } from './components/CommandCenterView';
import { WorkspaceView } from './components/WorkspaceView';
import { EvidenceGraphView } from './components/EvidenceGraphView';
import { HypothesisLabView } from './components/HypothesisLabView';
import { DataIngestionView } from './components/DataIngestionView';
import { WhatIfLabView } from './components/WhatIfLabView';
import { ReportView } from './components/ReportView';
import { VerificationSuiteView } from './components/VerificationSuiteView';
import { IncidentMemoryView } from './components/IncidentMemoryView';

export default function App() {
  const [initialBoot] = useState(() =>
    loadWorkspaceFromStorage(INITIAL_INCIDENTS)
  );

  const [incidents, setIncidents] = useState<IncidentInvestigation[]>(
    () => initialBoot.envelope.incidents
  );
  const [selectedIncidentId, setSelectedIncidentId] = useState<string>(
    () => initialBoot.envelope.selectedIncidentId
  );
  const [activeScreen, setActiveScreen] =
    useState<ActiveScreen>('command-center');
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(
    () => initialBoot.envelope.selectedRecordId
  );
  const [activePresetIds, setActivePresetIds] = useState<string[]>(
    () => initialBoot.envelope.activePresetIds
  );
  const [whatIfHistory, setWhatIfHistory] = useState<WhatIfSimulationEntry[]>(
    () => initialBoot.envelope.whatIfHistory
  );
  const [savedReports, setSavedReports] = useState<SavedReportSnapshot[]>(
    () => initialBoot.envelope.savedReports
  );
  const [lastSavedAt, setLastSavedAt] = useState<string>(
    () => initialBoot.envelope.savedAt
  );
  const [storageWarning, setStorageWarning] = useState<string | null>(
    () => initialBoot.corruptedWarning
  );
  const [checkpointInfo, setCheckpointInfo] = useState<{
    exists: boolean;
    savedAt: string | null;
  }>(() => hasManualCheckpoint());
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [isResetModalOpen, setIsResetModalOpen] = useState<boolean>(false);

  const [hasActiveFaults, setHasActiveFaults] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [comparedMemoryIncidentId, setComparedMemoryIncidentId] = useState<
    string | null
  >(null);

  // Server & Gemini status
  const [geminiServerReady, setGeminiServerReady] = useState<boolean>(false);
  const [isAnalyzingGemini, setIsAnalyzingGemini] = useState<boolean>(false);
  const [geminiError, setGeminiError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => {
        if (data && typeof data.geminiConfigured === 'boolean') {
          setGeminiServerReady(data.geminiConfigured);
        }
      })
      .catch(() => {
        setGeminiServerReady(false);
      });
  }, []);

  // Automatically persist workspace state to localStorage on changes
  useEffect(() => {
    const res = saveWorkspaceToStorage({
      selectedIncidentId,
      selectedRecordId,
      activePresetIds,
      incidents,
      whatIfHistory,
      savedReports,
    });
    if (res.ok) {
      setLastSavedAt(res.savedAt);
    } else if (res.error) {
      setStorageWarning(res.error);
    }
  }, [
    incidents,
    selectedIncidentId,
    selectedRecordId,
    activePresetIds,
    whatIfHistory,
    savedReports,
  ]);

  const currentIncident =
    incidents.find((i) => i.id === selectedIncidentId) || incidents[0];

  const verificationChecks = runVerificationSuite(currentIncident);
  const failedChecksCount = verificationChecks.filter(
    (c) => c.status === 'FAIL'
  ).length;

  const triggerTransientFeedback = (msg: string) => {
    setSaveFeedback(msg);
    setTimeout(() => setSaveFeedback(null), 2600);
  };

  // Explicit Manual Save (saves both active workspace and a named restore checkpoint)
  const handleExplicitSaveCheckpoint = () => {
    const nowIso = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const wsRes = saveWorkspaceToStorage(
      {
        selectedIncidentId,
        selectedRecordId,
        activePresetIds,
        incidents,
        whatIfHistory,
        savedReports,
        savedAt: nowIso,
      },
      undefined,
      WORKSPACE_STORAGE_KEY
    );
    const cpRes = saveWorkspaceToStorage(
      {
        selectedIncidentId,
        selectedRecordId,
        activePresetIds,
        incidents,
        whatIfHistory,
        savedReports,
        savedAt: nowIso,
      },
      undefined,
      CHECKPOINT_STORAGE_KEY
    );

    if (wsRes.ok && cpRes.ok) {
      setLastSavedAt(nowIso);
      setCheckpointInfo({ exists: true, savedAt: nowIso });
      setStorageWarning(null);
      triggerTransientFeedback('Saved Checkpoint to Browser Storage');
    } else {
      setStorageWarning(
        wsRes.error || cpRes.error || 'Unable to write to localStorage.'
      );
    }
  };

  // Explicit Restore from Last Saved Checkpoint (or persisted storage)
  const handleRestoreSavedCheckpoint = () => {
    const cpCheck = hasManualCheckpoint();
    const targetKey = cpCheck.exists
      ? CHECKPOINT_STORAGE_KEY
      : WORKSPACE_STORAGE_KEY;
    const loaded = loadWorkspaceFromStorage(
      INITIAL_INCIDENTS,
      undefined,
      targetKey
    );

    if (loaded.corruptedWarning) {
      setStorageWarning(loaded.corruptedWarning);
      return;
    }

    setIncidents(loaded.envelope.incidents);
    setSelectedIncidentId(loaded.envelope.selectedIncidentId);
    setSelectedRecordId(loaded.envelope.selectedRecordId);
    setActivePresetIds(loaded.envelope.activePresetIds);
    setWhatIfHistory(loaded.envelope.whatIfHistory);
    setSavedReports(loaded.envelope.savedReports);
    setLastSavedAt(loaded.envelope.savedAt);
    setHasActiveFaults(false);
    triggerTransientFeedback('Restored Saved Investigation State');
  };

  // Helper to update the active incident in state
  const updateCurrentIncident = (
    updater: (inc: IncidentInvestigation) => IncidentInvestigation
  ) => {
    setIncidents((prev) =>
      prev.map((inc) => (inc.id === currentIncident.id ? updater(inc) : inc))
    );
  };

  // Navigate to an incident (and optionally a screen)
  const handleSelectIncident = (id: string, navigateTo?: ActiveScreen) => {
    setSelectedIncidentId(id);
    const target = incidents.find((i) => i.id === id);
    if (target && target.records.length > 0) {
      setSelectedRecordId(target.records[0].id);
    }
    if (navigateTo) {
      setActiveScreen(navigateTo);
    }
  };

  // Inspect a specific record across screens
  const handleInspectRecord = (
    incidentId: string,
    recordId: string,
    targetScreen: ActiveScreen = 'workspace'
  ) => {
    setSelectedIncidentId(incidentId);
    setSelectedRecordId(recordId);
    setActiveScreen(targetScreen);
  };

  // Create a new incident from Command Center
  const handleCreateIncident = (newInc: IncidentInvestigation) => {
    setIncidents((prev) => [newInc, ...prev]);
    setSelectedIncidentId(newInc.id);
    setSelectedRecordId(newInc.records[0]?.id || null);
    setActiveScreen('workspace');
    triggerTransientFeedback(`Created & Saved ${newInc.id}`);
  };

  // Delete a specific saved investigation (confirmed via modal in Command Center)
  const handleDeleteIncident = (incidentId: string) => {
    setIncidents((prev) => {
      const remaining = prev.filter((i) => i.id !== incidentId);
      if (remaining.length === 0) {
        return structuredClone(INITIAL_INCIDENTS);
      }
      if (selectedIncidentId === incidentId) {
        setSelectedIncidentId(remaining[0].id);
        setSelectedRecordId(remaining[0].records[0]?.id || null);
      }
      return remaining;
    });
    setWhatIfHistory((prev) => prev.filter((h) => h.incidentId !== incidentId));
    setSavedReports((prev) => prev.filter((r) => r.incidentId !== incidentId));
    triggerTransientFeedback(`Deleted Investigation ${incidentId}`);
  };

  // Export single investigation backup JSON
  const handleExportIncidentBackup = (incidentId: string) => {
    const target =
      incidents.find((i) => i.id === incidentId) || currentIncident;
    const jsonContent = exportInvestigationBackupJson(
      target,
      whatIfHistory,
      savedReports
    );
    const blob = new Blob([jsonContent], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${target.id}-investigation-backup-v2.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    triggerTransientFeedback(`Exported ${target.id} Backup JSON`);
  };

  // Export full workspace backup JSON
  const handleExportFullWorkspaceBackup = () => {
    const jsonContent = exportWorkspaceBackupJson({
      incidents,
      whatIfHistory,
      savedReports,
    });
    const blob = new Blob([jsonContent], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trace-ai-workspace-backup-v2.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    triggerTransientFeedback('Exported Full Workspace Backup');
  };

  // Import and restore an investigation or workspace backup JSON
  const handleImportBackupJson = (rawJsonText: string) => {
    const validation = validateAndParseBackupJson(rawJsonText);
    if (!validation.ok) {
      return {
        ok: false,
        message: 'Backup validation failed — file rejected to protect store integrity.',
        errors: validation.errors,
      };
    }

    setIncidents((prev) => {
      const incomingMap = new Map(
        validation.incidents.map((inc) => [inc.id, inc])
      );
      const updatedExisting = prev.map((existing) =>
        incomingMap.has(existing.id)
          ? (incomingMap.get(existing.id) as IncidentInvestigation)
          : existing
      );
      const brandNew = validation.incidents.filter(
        (inc) => !prev.some((p) => p.id === inc.id)
      );
      return [...brandNew, ...updatedExisting];
    });

    if (validation.whatIfHistory.length > 0) {
      setWhatIfHistory((prev) => {
        const existingIds = new Set(prev.map((h) => h.id));
        const newEntries = validation.whatIfHistory.filter(
          (h) => !existingIds.has(h.id)
        );
        return [...newEntries, ...prev];
      });
    }

    if (validation.savedReports.length > 0) {
      setSavedReports((prev) => {
        const existingIds = new Set(prev.map((r) => r.id));
        const newSnaps = validation.savedReports.filter(
          (r) => !existingIds.has(r.id)
        );
        return [...newSnaps, ...prev];
      });
    }

    const firstImported = validation.incidents[0];
    if (firstImported) {
      setSelectedIncidentId(firstImported.id);
      setSelectedRecordId(firstImported.records[0]?.id || null);
    }

    triggerTransientFeedback(
      `Restored ${validation.incidents.length} Investigation(s) from Backup`
    );

    return {
      ok: true,
      message: `Successfully validated and restored ${validation.incidents.length} investigation(s) (${validation.incidents
        .map((i) => i.id)
        .join(', ')}) with original record IDs, timestamps, and relationships intact.`,
    };
  };

  // Update status in Workspace
  const handleUpdateStatus = (status: IncidentStatus) => {
    updateCurrentIncident((inc) => ({
      ...inc,
      status,
      updatedAt: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    }));
  };

  // Append a single observation or batch of ingested records and recompute graph + hypotheses
  const handleIngestRecords = (newRecords: SourceRecord[]) => {
    updateCurrentIncident((inc) => {
      const baselineInitial = INITIAL_INCIDENTS.find((i) => i.id === inc.id);
      const baseHypotheses = baselineInitial
        ? baselineInitial.hypotheses
        : inc.hypotheses;
      const updatedRecords = [...inc.records, ...newRecords];
      const updatedRelationships = computeRelationships(
        updatedRecords,
        inc.relationships
      );
      const updatedHypotheses = recomputeHypotheses(
        baseHypotheses,
        updatedRecords,
        WHAT_IF_PRESETS.filter((p) => p.incidentId === inc.id)
      );

      return {
        ...inc,
        updatedAt: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
        records: updatedRecords,
        relationships: updatedRelationships,
        hypotheses: updatedHypotheses,
      };
    });
    if (newRecords[0]) {
      setSelectedRecordId(newRecords[0].id);
    }
    triggerTransientFeedback(
      `Ingested & Persisted ${newRecords.length} Record(s)`
    );
  };

  // Toggle a Preset What-If Scenario and log in persisted whatIfHistory
  const handleToggleWhatIfPreset = (preset: WhatIfPreset) => {
    const isPresent = currentIncident.records.some(
      (r) => r.id === preset.recordToInject.id
    );
    const beforeScores = new Map(
      currentIncident.hypotheses.map((h) => [h.id, h.plausibilityScore])
    );

    const baselineInitial = INITIAL_INCIDENTS.find(
      (i) => i.id === currentIncident.id
    );
    const baseHypotheses = baselineInitial
      ? structuredClone(baselineInitial.hypotheses)
      : structuredClone(currentIncident.hypotheses);
    const baseRelationships = baselineInitial
      ? structuredClone(baselineInitial.relationships)
      : structuredClone(currentIncident.relationships);

    const nextRecords = isPresent
      ? currentIncident.records.filter((r) => r.id !== preset.recordToInject.id)
      : [...currentIncident.records, preset.recordToInject];

    const nextRelationships = computeRelationships(
      nextRecords,
      baseRelationships
    );
    const nextHypotheses = recomputeHypotheses(
      baseHypotheses,
      nextRecords,
      WHAT_IF_PRESETS.filter((p) => p.incidentId === currentIncident.id)
    );

    const nowIso = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

    updateCurrentIncident((inc) => ({
      ...inc,
      updatedAt: nowIso,
      records: nextRecords,
      relationships: nextRelationships,
      hypotheses: nextHypotheses,
    }));

    setActivePresetIds((prev) =>
      isPresent ? prev.filter((id) => id !== preset.id) : [...prev, preset.id]
    );

    const historyEntry: WhatIfSimulationEntry = {
      id: `SIM-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      incidentId: currentIncident.id,
      timestamp: nowIso,
      actionType: isPresent ? 'preset_removed' : 'preset_injected',
      recordId: preset.recordToInject.id,
      title: preset.title,
      summary: isPresent
        ? `Removed preset counterfactual record ${preset.recordToInject.id} from active store.`
        : `Injected preset counterfactual record ${preset.recordToInject.id}: ${preset.recordToInject.summary}`,
      hypothesisDeltas: nextHypotheses.map((h) => ({
        hypothesisId: h.id,
        beforeScore: beforeScores.get(h.id) ?? h.baselineScore,
        afterScore: h.plausibilityScore,
      })),
    };
    setWhatIfHistory((prev) => [historyEntry, ...prev]);
  };

  // Inject Custom What-If Evidence and log in persisted whatIfHistory
  const handleInjectCustomWhatIf = (
    record: SourceRecord,
    targetHypothesisId: string,
    role: 'supporting' | 'contradictory',
    weight: number,
    reason: string
  ) => {
    const beforeScores = new Map(
      currentIncident.hypotheses.map((h) => [h.id, h.plausibilityScore])
    );
    const nowIso = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

    const nextRecords = [...currentIncident.records, record];
    const nextRelationships = computeRelationships(
      nextRecords,
      currentIncident.relationships
    );

    const nextHypotheses = currentIncident.hypotheses.map((hyp) => {
      if (hyp.id !== targetHypothesisId) return hyp;
      const supporting =
        role === 'supporting'
          ? [...hyp.supportingEvidence, { recordId: record.id, reason, weight }]
          : hyp.supportingEvidence;
      const contradictory =
        role === 'contradictory'
          ? [
              ...hyp.contradictoryEvidence,
              { recordId: record.id, reason, weight },
            ]
          : hyp.contradictoryEvidence;

      const nextScoreRaw = hyp.plausibilityScore + weight;
      const unresolvedCount = hyp.missingInformation.filter(
        (m) => !m.resolvedByRecordId
      ).length;
      const maxCap =
        unresolvedCount > 0 &&
        contradictory.length > 0 &&
        hyp.falsificationTest.status !== 'confirmed'
          ? 85
          : 96;
      const nextScore = Math.max(5, Math.min(maxCap, nextScoreRaw));
      const statusLabel: Hypothesis['statusLabel'] =
        nextScore >= 75
          ? 'Leading Hypothesis'
          : nextScore <= 25
          ? 'Disproved'
          : nextScore < 42
          ? 'Low Plausibility'
          : 'Competing Co-Factor';

      return {
        ...hyp,
        plausibilityScore: nextScore,
        statusLabel,
        supportingEvidence: supporting,
        contradictoryEvidence: contradictory,
      };
    });

    updateCurrentIncident((inc) => ({
      ...inc,
      updatedAt: nowIso,
      records: nextRecords,
      relationships: nextRelationships,
      hypotheses: nextHypotheses,
    }));

    const historyEntry: WhatIfSimulationEntry = {
      id: `SIM-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      incidentId: currentIncident.id,
      timestamp: nowIso,
      actionType: 'custom_injected',
      recordId: record.id,
      title: `Custom What-If (${role.toUpperCase()} ${targetHypothesisId})`,
      summary: record.summary,
      hypothesisDeltas: nextHypotheses.map((h) => ({
        hypothesisId: h.id,
        beforeScore: beforeScores.get(h.id) ?? h.baselineScore,
        afterScore: h.plausibilityScore,
      })),
    };
    setWhatIfHistory((prev) => [historyEntry, ...prev]);
  };

  // Reset What-If Scenario back to baseline
  const handleResetWhatIf = () => {
    const beforeScores = new Map(
      currentIncident.hypotheses.map((h) => [h.id, h.plausibilityScore])
    );
    const nowIso = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const baselineInitial = INITIAL_INCIDENTS.find(
      (i) => i.id === currentIncident.id
    );

    const nonWhatIfRecords = currentIncident.records.filter(
      (r) => r.sourceOrigin !== 'what_if' && r.type !== 'what_if'
    );
    const seedRelationships = baselineInitial
      ? structuredClone(baselineInitial.relationships)
      : currentIncident.relationships.filter(
          (rel) =>
            !rel.sourceId.startsWith('WIF-') &&
            !rel.targetId.startsWith('WIF-')
        );
    const seedHypotheses = baselineInitial
      ? structuredClone(baselineInitial.hypotheses)
      : currentIncident.hypotheses.map((h) => ({
          ...h,
          plausibilityScore: h.baselineScore,
          supportingEvidence: h.supportingEvidence.filter(
            (s) => !s.recordId.startsWith('WIF-')
          ),
          contradictoryEvidence: h.contradictoryEvidence.filter(
            (c) => !c.recordId.startsWith('WIF-')
          ),
        }));

    const nextRelationships = computeRelationships(
      nonWhatIfRecords,
      seedRelationships
    );
    const nextHypotheses = recomputeHypotheses(
      seedHypotheses,
      nonWhatIfRecords,
      []
    );

    updateCurrentIncident((inc) => ({
      ...inc,
      updatedAt: nowIso,
      records: nonWhatIfRecords,
      relationships: nextRelationships,
      hypotheses: nextHypotheses,
    }));
    setActivePresetIds([]);

    const historyEntry: WhatIfSimulationEntry = {
      id: `SIM-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      incidentId: currentIncident.id,
      timestamp: nowIso,
      actionType: 'scenario_reset',
      title: 'Reset What-If Counterfactuals to Baseline',
      summary: `Removed all What-If records for ${currentIncident.id} and restored baseline evidence weights.`,
      hypothesisDeltas: nextHypotheses.map((h) => ({
        hypothesisId: h.id,
        beforeScore: beforeScores.get(h.id) ?? h.baselineScore,
        afterScore: h.plausibilityScore,
      })),
    };
    setWhatIfHistory((prev) => [historyEntry, ...prev]);
  };

  // Update falsification status in Hypothesis Lab
  const handleUpdateFalsificationStatus = (
    hypothesisId: string,
    status: FalsificationProtocol['status']
  ) => {
    updateCurrentIncident((inc) => ({
      ...inc,
      hypotheses: inc.hypotheses.map((h) =>
        h.id === hypothesisId
          ? {
              ...h,
              falsificationTest: {
                ...h.falsificationTest,
                status,
              },
            }
          : h
      ),
    }));
  };

  // Add a custom competing hypothesis
  const handleAddHypothesis = (newHyp: Hypothesis) => {
    updateCurrentIncident((inc) => ({
      ...inc,
      hypotheses: [...inc.hypotheses, newHyp],
    }));
  };

  // Save a generated Report Snapshot
  const handleSaveReportSnapshot = (snapshot: SavedReportSnapshot) => {
    setSavedReports((prev) => [snapshot, ...prev]);
    triggerTransientFeedback(`Saved Report Snapshot ${snapshot.id}`);
  };

  // Delete a saved Report Snapshot
  const handleDeleteReportSnapshot = (reportId: string) => {
    setSavedReports((prev) => prev.filter((r) => r.id !== reportId));
    triggerTransientFeedback(`Deleted Report Snapshot ${reportId}`);
  };

  // Verification Suite Live Fault Injection & Repair
  const handleInjectFault = (
    faultType:
      | 'dangling_citation'
      | 'overconfident_hypothesis'
      | 'invalid_timestamp'
  ) => {
    setHasActiveFaults(true);
    updateCurrentIncident((inc) => {
      if (faultType === 'dangling_citation') {
        return {
          ...inc,
          hypotheses: inc.hypotheses.map((h, idx) =>
            idx === 0
              ? {
                  ...h,
                  supportingEvidence: [
                    ...h.supportingEvidence,
                    {
                      recordId: 'LOG-9999-FAKE',
                      reason:
                        'Fault injection test: citing non-existent record ID to test CHK-REF-01.',
                      weight: 10,
                    },
                  ],
                }
              : h
          ),
        };
      }
      if (faultType === 'overconfident_hypothesis') {
        return {
          ...inc,
          hypotheses: inc.hypotheses.map((h, idx) =>
            idx === 0
              ? {
                  ...h,
                  plausibilityScore: 96,
                  falsificationTest: {
                    ...h.falsificationTest,
                    status: 'untested',
                  },
                }
              : h
          ),
        };
      }
      // invalid_timestamp + broken edge
      return {
        ...inc,
        records: [
          ...inc.records,
          {
            id: 'LOG-BAD-TS-99',
            timestamp: '2026-99-99INVALID_TIME',
            type: 'log',
            service: 'checkout-service',
            summary: 'Injected fault record with malformed timestamp.',
            rawPayload: '{"fault": "invalid_timestamp"}',
            severity: 'warning',
            sourceOrigin: 'ingested',
            metadata: {},
          },
        ],
        relationships: [
          ...inc.relationships,
          {
            id: 'REL-BROKEN-99',
            sourceId: 'LOG-BAD-TS-99',
            targetId: 'NON-EXISTENT-NODE-404',
            type: 'direct',
            label: 'Dangling Edge Fault',
            ruleExplanation: 'Short',
            confidenceWeight: 50,
          },
        ],
      };
    });
  };

  const handleRepairFaults = () => {
    const baseline = INITIAL_INCIDENTS.find((i) => i.id === currentIncident.id);
    if (baseline) {
      updateCurrentIncident(() => structuredClone(baseline));
    }
    setHasActiveFaults(false);
    setActivePresetIds([]);
  };

  // Option A: Non-destructive reset of factory sample incidents only (preserves custom created investigations & reports)
  const handleResetSampleIncidentsOnly = () => {
    setIncidents((prev) => {
      const customIncidents = prev.filter(
        (inc) => !INITIAL_INCIDENTS.some((base) => base.id === inc.id)
      );
      return [...structuredClone(INITIAL_INCIDENTS), ...customIncidents];
    });
    setActivePresetIds([]);
    setHasActiveFaults(false);
    setGeminiError(null);
    setIsResetModalOpen(false);
    triggerTransientFeedback('Reset Factory Sample Incidents to Baseline');
  };

  // Option B: Confirmed Destructive Reset — Wipes localStorage and resets all state to factory defaults
  const handleConfirmedFullWipeAndReset = () => {
    clearPersistedStorage();
    const fresh = structuredClone(INITIAL_INCIDENTS);
    setIncidents(fresh);
    setSelectedIncidentId('INC-2026-0842');
    setSelectedRecordId('LOG-4401');
    setActivePresetIds([]);
    setWhatIfHistory([]);
    setSavedReports([]);
    setCheckpointInfo({ exists: false, savedAt: null });
    setHasActiveFaults(false);
    setGeminiError(null);
    setStorageWarning(null);
    setIsResetModalOpen(false);
    triggerTransientFeedback('Cleared Saved Storage & Reset Demo');
  };

  // Server-Side Grounded Gemini Analysis Handler
  const handleRunGeminiAnalysis = async () => {
    setIsAnalyzingGemini(true);
    setGeminiError(null);
    try {
      const response = await fetch('/api/analyze-incident', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          incident: currentIncident,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Server analysis failed.');
      }
      const analysis: GeminiForensicAnalysis = data.analysis;
      if (data.notice) {
        setGeminiError(data.notice);
      }
      updateCurrentIncident((inc) => ({
        ...inc,
        geminiAnalysis: analysis,
      }));
    } catch (err: unknown) {
      setGeminiError(
        err instanceof Error
          ? err.message
          : 'Failed to communicate with /api/analyze-incident'
      );
    } finally {
      setIsAnalyzingGemini(false);
    }
  };

  const navItems: Array<{
    id: ActiveScreen;
    label: string;
    shortLabel: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: string;
  }> = [
    {
      id: 'command-center',
      label: '1. Command Center',
      shortLabel: 'Command Center',
      icon: LayoutDashboard,
      badge: `${incidents.length}`,
    },
    {
      id: 'workspace',
      label: '2. Investigation Workspace',
      shortLabel: 'Workspace',
      icon: Terminal,
    },
    {
      id: 'evidence-graph',
      label: '3. Evidence Graph',
      shortLabel: 'Evidence Graph',
      icon: Network,
      badge: `${currentIncident.relationships.length}`,
    },
    {
      id: 'hypothesis-lab',
      label: '4. Hypothesis Lab',
      shortLabel: 'Hypothesis Lab',
      icon: Beaker,
      badge: `${currentIncident.hypotheses.length}`,
    },
    {
      id: 'data-ingestion',
      label: '5. Data Ingestion',
      shortLabel: 'Ingestion',
      icon: Database,
    },
    {
      id: 'what-if-lab',
      label: '6. What-If Evidence Lab',
      shortLabel: 'What-If Lab',
      icon: FlaskConical,
      badge:
        activePresetIds.length > 0
          ? `${activePresetIds.length} active`
          : undefined,
    },
    {
      id: 'report',
      label: '7. Investigation Report',
      shortLabel: 'Report',
      icon: FileText,
      badge: savedReports.length > 0 ? `${savedReports.length}` : undefined,
    },
    {
      id: 'verification-suite',
      label: '8. Verification Suite',
      shortLabel: 'Verification',
      icon: ShieldCheck,
      badge: failedChecksCount > 0 ? `${failedChecksCount} FAIL` : 'PASS',
    },
    {
      id: 'incident-memory',
      label: '9. Incident Memory & Detective',
      shortLabel: 'Incident Memory',
      icon: GitCompare,
      badge: `${incidents.length} Mem`,
    },
  ];

  return (
    <div className="min-h-screen bg-[#0D1117] text-[#C9D1D9] flex flex-col">
      {/* Strict 3-Zone Top Navigation Bar */}
      <header className="h-[52px] bg-[#161B22] border-b border-[#30363D] px-4 lg:px-6 flex items-center justify-between sticky top-0 z-40">
        {/* Zone 1: Single Text Element Wordmark */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
            className="lg:hidden text-[#C9D1D9] hover:text-[#F0F6FC] cursor-pointer"
            aria-label="Toggle Navigation"
          >
            {mobileSidebarOpen ? (
              <X className="w-5 h-5" />
            ) : (
              <Menu className="w-5 h-5" />
            )}
          </button>
          <a
            href="#command-center"
            onClick={(e) => {
              e.preventDefault();
              setActiveScreen('command-center');
            }}
            className="text-base font-bold tracking-tight text-[#F0F6FC] font-mono whitespace-nowrap"
          >
            TRACE AI 2.0
          </a>
        </div>

        {/* Zone 2: 5 Clean Single-Line Text Navigation Links */}
        <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-[#8B949E]">
          {navItems.slice(0, 5).map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveScreen(item.id)}
              className={`hover:text-[#F0F6FC] transition-colors whitespace-nowrap cursor-pointer py-1 ${
                activeScreen === item.id
                  ? 'text-[#F0F6FC] border-b-2 border-[#8B5CF6]'
                  : ''
              }`}
            >
              {item.shortLabel}
            </button>
          ))}
        </nav>

        {/* Zone 3: Primary Actions (Reset / Persistence Modal + Export Dossier) */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsResetModalOpen(true)}
            className="h-[28px] px-2.5 text-xs font-mono bg-[#21262D] text-[#C9D1D9] border border-[#30363D] rounded hover:bg-[#30363D] hover:text-[#F0F6FC] transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            title="Reset factory sample incidents or manage saved browser storage"
          >
            <RotateCcw className="w-3 h-3" />
            Reset Demo
          </button>
          <button
            onClick={() => setActiveScreen('report')}
            className="h-[28px] px-3 text-xs font-medium bg-[#8B5CF6] text-white border border-[#A78BFA] rounded hover:bg-[#7C3AED] transition-colors whitespace-nowrap cursor-pointer"
          >
            Export Dossier
          </button>
        </div>
      </header>

      {/* Main Workspace Container: Persistent Left Sidebar (250px) + Fluid Content Viewport */}
      <div className="flex-1 flex relative">
        {/* Persistent Forensic Sidebar */}
        <aside
          className={`${
            mobileSidebarOpen
              ? 'fixed inset-y-[52px] left-0 z-30 w-64 bg-[#161B22] border-r border-[#30363D]'
              : 'hidden lg:flex lg:w-64 lg:shrink-0 bg-[#161B22] border-r border-[#30363D]'
          } flex-col justify-between p-3`}
        >
          <div className="space-y-4">
            {/* Active Incident Context Switcher in Sidebar */}
            <div className="p-2.5 bg-[#0D1117] border border-[#21262D] rounded">
              <div className="text-[10px] font-mono text-[#8B949E] uppercase mb-1">
                Active Incident Context
              </div>
              <select
                value={currentIncident.id}
                onChange={(e) => handleSelectIncident(e.target.value)}
                className="w-full h-[28px] px-2 text-xs font-mono bg-[#161B22] border border-[#30363D] rounded text-[#F0F6FC] focus:outline-none focus:border-[#8B5CF6]"
              >
                {incidents.map((inc) => (
                  <option key={inc.id} value={inc.id}>
                    {inc.id} ({inc.severity})
                  </option>
                ))}
              </select>
              <div className="mt-1.5 text-[11px] text-[#C9D1D9] line-clamp-1">
                {currentIncident.title}
              </div>
            </div>

            {/* 9 Forensic Screen Modules */}
            <div>
              <div className="px-2 text-[10px] font-mono text-[#8B949E] uppercase mb-1.5">
                Forensic Modules (9 Screens)
              </div>
              <div className="space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeScreen === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveScreen(item.id);
                        setMobileSidebarOpen(false);
                      }}
                      className={`w-full h-[34px] px-2.5 rounded text-xs font-medium flex items-center justify-between transition-colors cursor-pointer whitespace-nowrap ${
                        isActive
                          ? 'bg-[#8B5CF6]/20 text-[#F0F6FC] border border-[#8B5CF6]'
                          : 'text-[#C9D1D9] hover:bg-[#21262D] hover:text-[#F0F6FC] border border-transparent'
                      }`}
                    >
                      <span className="flex items-center gap-2 truncate">
                        <Icon
                          className={`w-3.5 h-3.5 shrink-0 ${
                            isActive ? 'text-[#A78BFA]' : 'text-[#8B949E]'
                          }`}
                        />
                        <span className="truncate">{item.label}</span>
                      </span>
                      {item.badge && (
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.2 rounded tabular-nums ${
                            item.id === 'verification-suite' &&
                            failedChecksCount > 0
                              ? 'bg-[#F43F5E]/20 text-[#F43F5E]'
                              : item.id === 'verification-suite'
                              ? 'bg-[#10B981]/20 text-[#10B981]'
                              : 'bg-[#0D1117] text-[#8B949E]'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Local Browser Persistence & Checkpoint Controls */}
            <div className="p-2.5 bg-[#0D1117] border border-[#21262D] rounded space-y-2 text-[11px] font-mono">
              <div className="flex items-center justify-between">
                <span className="text-[#8B949E] flex items-center gap-1">
                  <HardDrive className="w-3 h-3 text-[#38BDF8]" />
                  STORAGE:
                </span>
                <span
                  className="text-[#38BDF8] font-semibold"
                  title="Single-browser localStorage persistence (Not a multi-user cloud database)"
                >
                  LOCAL BROWSER
                </span>
              </div>
              <div className="text-[10px] text-[#8B949E] flex items-center justify-between">
                <span>LAST SAVED:</span>
                <span className="text-[#10B981] tabular-nums">
                  {lastSavedAt.slice(11, 19)} UTC
                </span>
              </div>
              {checkpointInfo.exists && checkpointInfo.savedAt && (
                <div className="text-[10px] text-[#8B949E] flex items-center justify-between">
                  <span>CHECKPOINT:</span>
                  <span className="text-[#A78BFA] tabular-nums">
                    {checkpointInfo.savedAt.slice(11, 19)} UTC
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-1.5 pt-1">
                <button
                  onClick={handleExplicitSaveCheckpoint}
                  className="h-[26px] px-2 text-[10px] bg-[#21262D] text-[#10B981] border border-[#10B981]/30 rounded hover:bg-[#30363D] flex items-center justify-center gap-1 cursor-pointer"
                  title="Save explicit restore checkpoint to browser localStorage"
                >
                  <Save className="w-3 h-3" />
                  Save State
                </button>
                <button
                  onClick={handleRestoreSavedCheckpoint}
                  className="h-[26px] px-2 text-[10px] bg-[#21262D] text-[#38BDF8] border border-[#38BDF8]/30 rounded hover:bg-[#30363D] flex items-center justify-center gap-1 cursor-pointer"
                  title="Restore from last saved manual checkpoint or browser storage"
                >
                  <History className="w-3 h-3" />
                  Restore
                </button>
              </div>

              <button
                onClick={handleExportFullWorkspaceBackup}
                className="w-full h-[26px] px-2 text-[10px] bg-[#161B22] text-[#C9D1D9] border border-[#30363D] rounded hover:bg-[#21262D] flex items-center justify-center gap-1 cursor-pointer"
                title="Export all investigations, What-If history, and saved reports as a JSON backup file"
              >
                <Download className="w-3 h-3 text-[#A78BFA]" />
                Export Workspace .JSON
              </button>

              {saveFeedback && (
                <div className="text-[10px] text-[#10B981] bg-[#10B981]/10 border border-[#10B981]/30 rounded px-2 py-1 flex items-center gap-1">
                  <Check className="w-3 h-3 shrink-0" />
                  <span className="truncate">{saveFeedback}</span>
                </div>
              )}
            </div>
          </div>

          {/* Transparent Demo & Engine Provenance Notice */}
          <div className="p-3 bg-[#0D1117] border border-[#21262D] rounded space-y-2 text-[11px] font-mono">
            <div className="flex items-center justify-between">
              <span className="text-[#8B949E]">ENVIRONMENT:</span>
              <span className="text-[#38BDF8] font-semibold">DEMO MODE</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#8B949E]">DETERMINISTIC ENGINE:</span>
              <span className="text-[#10B981]">ACTIVE</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#8B949E]">SERVER GEMINI API:</span>
              <span
                className={
                  geminiServerReady ? 'text-[#10B981]' : 'text-[#F59E0B]'
                }
              >
                {geminiServerReady ? 'CONFIGURED' : 'FALLBACK READY'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#8B949E]">LAST SYNTHESIS:</span>
              <span
                className={
                  !currentIncident.geminiAnalysis
                    ? 'text-[#8B949E]'
                    : currentIncident.geminiAnalysis.mode === 'gemini-live'
                    ? 'text-[#10B981] font-semibold'
                    : 'text-[#F59E0B] font-semibold'
                }
              >
                {!currentIncident.geminiAnalysis
                  ? 'NOT RUN'
                  : currentIncident.geminiAnalysis.mode === 'gemini-live'
                  ? 'LIVE GEMINI'
                  : 'DETERMINISTIC FALLBACK'}
              </span>
            </div>
            <p className="text-[10px] text-[#8B949E] leading-relaxed pt-1 border-t border-[#21262D]">
              Single-browser localStorage persistence active. No external multi-user
              database or API credentials stored in browser.
            </p>
          </div>
        </aside>

        {/* Main Screen Viewport */}
        <main className="flex-1 p-4 lg:p-6 max-w-[1440px] w-full mx-auto overflow-x-hidden space-y-4">
          {/* Storage Recovery / Quota Warning Banner */}
          {storageWarning && (
            <div className="bg-[#161B22] border border-[#F59E0B]/50 rounded p-3 flex items-center justify-between gap-3 text-xs font-mono text-[#F59E0B]">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{storageWarning}</span>
              </div>
              <button
                onClick={() => setStorageWarning(null)}
                className="px-2 py-0.5 bg-[#21262D] text-[#C9D1D9] rounded hover:text-[#F0F6FC] cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {activeScreen === 'command-center' && (
            <CommandCenterView
              incidents={incidents}
              selectedIncidentId={selectedIncidentId}
              onSelectIncident={handleSelectIncident}
              onCreateIncident={handleCreateIncident}
              onInspectRecord={(incId, recId) =>
                handleInspectRecord(incId, recId, 'workspace')
              }
              onDeleteIncident={handleDeleteIncident}
              onExportIncidentBackup={handleExportIncidentBackup}
              onImportBackupJson={handleImportBackupJson}
            />
          )}

          {activeScreen === 'workspace' && (
            <WorkspaceView
              incidents={incidents}
              incident={currentIncident}
              selectedRecordId={selectedRecordId}
              onSelectIncident={(id) => handleSelectIncident(id)}
              onUpdateStatus={handleUpdateStatus}
              onSelectRecord={(recId) => setSelectedRecordId(recId)}
              onNavigate={(scr) => setActiveScreen(scr)}
              onOpenMemoryComparison={(histId) => {
                setComparedMemoryIncidentId(histId);
                setActiveScreen('incident-memory');
              }}
              onAddObservation={(rec) => handleIngestRecords([rec])}
              onRunGeminiAnalysis={handleRunGeminiAnalysis}
              isAnalyzingGemini={isAnalyzingGemini}
              geminiError={geminiError}
            />
          )}

          {activeScreen === 'evidence-graph' && (
            <EvidenceGraphView
              incident={currentIncident}
              selectedRecordId={selectedRecordId}
              onSelectRecord={(recId) => setSelectedRecordId(recId)}
            />
          )}

          {activeScreen === 'hypothesis-lab' && (
            <HypothesisLabView
              incident={currentIncident}
              onSelectRecord={(recId, nav) => {
                setSelectedRecordId(recId);
                if (nav) setActiveScreen(nav);
              }}
              onNavigateToWhatIf={(presetId) => {
                if (presetId) {
                  const preset = WHAT_IF_PRESETS.find((p) => p.id === presetId);
                  if (
                    preset &&
                    !currentIncident.records.some(
                      (r) => r.id === preset.recordToInject.id
                    )
                  ) {
                    handleToggleWhatIfPreset(preset);
                  }
                }
                setActiveScreen('what-if-lab');
              }}
              onUpdateFalsificationStatus={handleUpdateFalsificationStatus}
              onAddHypothesis={handleAddHypothesis}
              onRunGeminiAnalysis={handleRunGeminiAnalysis}
              isAnalyzingGemini={isAnalyzingGemini}
            />
          )}

          {activeScreen === 'data-ingestion' && (
            <DataIngestionView
              incident={currentIncident}
              onIngestRecords={handleIngestRecords}
              onNavigate={(scr) => setActiveScreen(scr)}
            />
          )}

          {activeScreen === 'what-if-lab' && (
            <WhatIfLabView
              incident={currentIncident}
              activePresetIds={activePresetIds}
              whatIfHistory={whatIfHistory}
              onTogglePreset={handleToggleWhatIfPreset}
              onInjectCustomWhatIf={handleInjectCustomWhatIf}
              onResetWhatIf={handleResetWhatIf}
              onNavigate={(scr) => setActiveScreen(scr)}
            />
          )}

          {activeScreen === 'report' && (
            <ReportView
              incident={currentIncident}
              savedReports={savedReports}
              onSaveReportSnapshot={handleSaveReportSnapshot}
              onDeleteReportSnapshot={handleDeleteReportSnapshot}
              onSelectRecord={(recId) => {
                setSelectedRecordId(recId);
                setActiveScreen('workspace');
              }}
            />
          )}

          {activeScreen === 'verification-suite' && (
            <VerificationSuiteView
              incident={currentIncident}
              onInjectFault={handleInjectFault}
              onRepairFaults={handleRepairFaults}
              hasActiveFaults={hasActiveFaults}
            />
          )}

          {activeScreen === 'incident-memory' && (
            <IncidentMemoryView
              incidents={incidents}
              currentIncident={currentIncident}
              initialComparedIncidentId={comparedMemoryIncidentId}
              onSelectIncident={handleSelectIncident}
              onInspectRecordInWorkspace={(incId, recId) =>
                handleInspectRecord(incId, recId, 'workspace')
              }
            />
          )}
        </main>
      </div>

      {/* Confirmation Modal Distinguishing Non-Destructive Demo Reset vs Destructive Storage Wipe */}
      {isResetModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-[#161B22] border border-[#484F58] rounded-lg max-w-lg w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#30363D]">
              <h3 className="text-base font-semibold text-[#F0F6FC] flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-[#38BDF8]" />
                Reset Demo vs. Delete Saved Browser Storage
              </h3>
              <button
                onClick={() => setIsResetModalOpen(false)}
                className="text-xs font-mono text-[#8B949E] hover:text-[#F0F6FC] cursor-pointer"
              >
                [ESC]
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-[#0D1117] border border-[#38BDF8]/40 rounded space-y-2">
                <div className="font-mono font-semibold text-[#38BDF8]">
                  OPTION 1: Reset Factory Sample Incidents Only (Safe)
                </div>
                <p className="text-[#C9D1D9] leading-relaxed">
                  Restores sample incidents (<code className="text-[#F0F6FC]">INC-2026-0842</code>{' '}
                  and <code className="text-[#F0F6FC]">INC-2026-0839</code>) to their clean baseline
                  telemetry while <strong>preserving</strong> any custom investigations you created
                  and any saved report snapshots.
                </p>
                <button
                  type="button"
                  onClick={handleResetSampleIncidentsOnly}
                  className="h-[32px] px-3 text-xs font-medium bg-[#21262D] text-[#38BDF8] border border-[#38BDF8]/40 rounded hover:bg-[#30363D] cursor-pointer"
                >
                  Reset Factory Sample Incidents Only
                </button>
              </div>

              <div className="p-3 bg-[#0D1117] border border-[#F43F5E]/40 rounded space-y-2">
                <div className="font-mono font-semibold text-[#F43F5E] flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  OPTION 2: Delete All Saved Investigations & Wipe Browser Storage (Destructive)
                </div>
                <p className="text-[#C9D1D9] leading-relaxed">
                  Permanently deletes all custom investigations, ingested records, What-If
                  simulation history ({whatIfHistory.length} entries), saved report snapshots (
                  {savedReports.length} snapshots), and manual checkpoints from{' '}
                  <code className="text-[#F0F6FC]">localStorage</code>.
                </p>
                <button
                  type="button"
                  onClick={handleConfirmedFullWipeAndReset}
                  className="h-[32px] px-3 text-xs font-medium bg-[#F43F5E] text-white rounded hover:bg-[#E11D48] cursor-pointer"
                >
                  Confirm Delete All Saved Data & Reset
                </button>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-[#30363D]">
              <button
                type="button"
                onClick={() => setIsResetModalOpen(false)}
                className="h-[32px] px-3.5 text-xs bg-[#21262D] text-[#C9D1D9] border border-[#30363D] rounded cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
