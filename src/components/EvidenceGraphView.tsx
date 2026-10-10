import React, { useMemo, useState } from 'react';
import {
  Code2,
  GitCommit,
  Info,
  Layers,
  Maximize2,
  Network,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  EvidenceRelationship,
  IncidentInvestigation,
  RecordType,
  RelationshipType,
  SourceRecord,
} from '../types/trace';

interface EvidenceGraphViewProps {
  incident: IncidentInvestigation;
  selectedRecordId: string | null;
  onSelectRecord: (recordId: string) => void;
}

interface GraphNode {
  id: string;
  label: string;
  sublabel: string;
  nodeKind: 'incident_root' | 'service' | 'record';
  recordType?: RecordType;
  record?: SourceRecord;
  x: number;
  y: number;
  color: string;
}

export const EvidenceGraphView: React.FC<EvidenceGraphViewProps> = ({
  incident,
  selectedRecordId,
  onSelectRecord,
}) => {
  const [linkFilter, setLinkFilter] = useState<'all' | RelationshipType>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | RecordType>('all');
  const [layoutMode, setLayoutMode] = useState<'causal' | 'service'>('causal');
  const [zoom, setZoom] = useState(1);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectedServiceNode, setSelectedServiceNode] = useState<string | null>(null);

  const visibleRecords = useMemo(() => {
    if (typeFilter === 'all') return incident.records;
    return incident.records.filter((r) => r.type === typeFilter);
  }, [incident.records, typeFilter]);

  const visibleRecordIds = useMemo(
    () => new Set(visibleRecords.map((r) => r.id)),
    [visibleRecords]
  );

  const visibleRelationships = useMemo(() => {
    return incident.relationships.filter((rel) => {
      if (linkFilter !== 'all' && rel.type !== linkFilter) return false;
      return visibleRecordIds.has(rel.sourceId) && visibleRecordIds.has(rel.targetId);
    });
  }, [incident.relationships, linkFilter, visibleRecordIds]);

  // Compute deterministic node coordinates for SVG canvas (width: 920, height: 560)
  const { nodes, serviceEdges } = useMemo(() => {
    const computedNodes: GraphNode[] = [];
    const computedServiceEdges: Array<{
      id: string;
      fromX: number;
      fromY: number;
      toX: number;
      toY: number;
      serviceName: string;
    }> = [];

    // Incident Root Node at top center or left
    const rootNode: GraphNode = {
      id: incident.id,
      label: incident.id,
      sublabel: incident.severity,
      nodeKind: 'incident_root',
      x: 460,
      y: 48,
      color: '#F43F5E',
    };
    computedNodes.push(rootNode);

    // Service Nodes row
    const services = incident.affectedServices;
    const servicePositions = new Map<string, { x: number; y: number }>();
    services.forEach((svc, idx) => {
      const x =
        services.length === 1
          ? 460
          : 140 + (idx * 640) / Math.max(1, services.length - 1);
      const y = 145;
      servicePositions.set(svc.name, { x, y });
      computedNodes.push({
        id: `SVC:${svc.name}`,
        label: svc.name,
        sublabel: `${svc.tier} · ${svc.status}`,
        nodeKind: 'service',
        x,
        y,
        color:
          svc.status === 'Critical'
            ? '#F43F5E'
            : svc.status === 'Degraded'
            ? '#F59E0B'
            : '#10B981',
      });
    });

    const sortedRecs = [...visibleRecords].sort((a, b) => {
      const ta = Date.parse(a.timestamp) || 0;
      const tb = Date.parse(b.timestamp) || 0;
      return ta - tb;
    });

    const getColorForType = (type: RecordType, origin: SourceRecord['sourceOrigin']) => {
      if (origin === 'what_if' || type === 'what_if') return '#A78BFA';
      switch (type) {
        case 'deployment':
          return '#8B5CF6';
        case 'log':
          return '#F43F5E';
        case 'metric':
          return '#38BDF8';
        case 'ticket':
          return '#F59E0B';
        case 'service_event':
          return '#10B981';
        default:
          return '#C9D1D9';
      }
    };

    if (layoutMode === 'causal') {
      // Group records into 3 chronological/causal tiers below services
      sortedRecs.forEach((rec, idx) => {
        const row = idx % 2 === 0 ? 0 : 1;
        const colCount = Math.max(1, sortedRecs.length);
        const x =
          colCount === 1
            ? 460
            : 95 + (idx * 730) / Math.max(1, colCount - 1);
        const y = row === 0 ? 310 : 445;

        computedNodes.push({
          id: rec.id,
          label: rec.id,
          sublabel: `${rec.type.toUpperCase()} · ${rec.timestamp.slice(11, 19)}Z`,
          nodeKind: 'record',
          recordType: rec.type,
          record: rec,
          x,
          y,
          color: getColorForType(rec.type, rec.sourceOrigin),
        });

        const svcPos = servicePositions.get(rec.service);
        if (svcPos) {
          computedServiceEdges.push({
            id: `SVCLINK-${rec.service}-${rec.id}`,
            fromX: svcPos.x,
            fromY: svcPos.y,
            toX: x,
            toY: y,
            serviceName: rec.service,
          });
        }
      });
    } else {
      // Group records directly underneath their respective service column
      const byService = new Map<string, SourceRecord[]>();
      sortedRecs.forEach((rec) => {
        const list = byService.get(rec.service) || [];
        list.push(rec);
        byService.set(rec.service, list);
      });

      Array.from(byService.entries()).forEach(([svcName, recs], sIdx) => {
        const svcPos = servicePositions.get(svcName) || {
          x: 150 + sIdx * 200,
          y: 145,
        };
        recs.forEach((rec, rIdx) => {
          const offset = (rIdx % 2 === 0 ? -1 : 1) * (rIdx > 0 ? 28 : 0);
          const x = Math.max(80, Math.min(840, svcPos.x + offset));
          const y = 265 + rIdx * 82;
          computedNodes.push({
            id: rec.id,
            label: rec.id,
            sublabel: `${rec.type.toUpperCase()} · ${rec.timestamp.slice(11, 19)}Z`,
            nodeKind: 'record',
            recordType: rec.type,
            record: rec,
            x,
            y,
            color: getColorForType(rec.type, rec.sourceOrigin),
          });
          computedServiceEdges.push({
            id: `SVCLINK-${svcName}-${rec.id}`,
            fromX: svcPos.x,
            fromY: svcPos.y,
            toX: x,
            toY: y,
            serviceName: svcName,
          });
        });
      });
    }

    return { nodes: computedNodes, serviceEdges: computedServiceEdges };
  }, [incident, visibleRecords, layoutMode]);

  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const inspectedRecord =
    incident.records.find((r) => r.id === selectedRecordId) ||
    incident.records[0] ||
    null;

  const inspectedEdge: EvidenceRelationship | undefined = incident.relationships.find(
    (e) => e.id === selectedEdgeId
  );

  // Connected relationships for the currently selected record
  const recordConnections = useMemo(() => {
    if (!inspectedRecord) return [];
    return incident.relationships.filter(
      (r) => r.sourceId === inspectedRecord.id || r.targetId === inspectedRecord.id
    );
  }, [incident.relationships, inspectedRecord]);

  return (
    <div className="space-y-5">
      {/* Header & Graph Controls */}
      <div className="bg-[#161B22] border border-[#30363D] rounded p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-[#8B949E] mb-1">
            <span>EVIDENCE TOPOLOGY</span>
            <span>·</span>
            <span className="text-[#38BDF8]">{incident.id}</span>
          </div>
          <h1 className="text-lg font-semibold text-[#F0F6FC]">
            Forensic Evidence & Causality Graph
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Link Type Filter */}
          <div className="flex items-center bg-[#0D1117] p-0.5 rounded border border-[#30363D]">
            {(
              [
                { id: 'all', label: `All Links (${incident.relationships.length})` },
                {
                  id: 'direct',
                  label: `Direct Only (${
                    incident.relationships.filter((r) => r.type === 'direct').length
                  })`,
                },
                {
                  id: 'inferred',
                  label: `Inferred Only (${
                    incident.relationships.filter((r) => r.type === 'inferred').length
                  })`,
                },
              ] as const
            ).map((btn) => (
              <button
                key={btn.id}
                onClick={() => setLinkFilter(btn.id)}
                className={`h-[28px] px-2.5 text-xs font-mono rounded transition-colors cursor-pointer whitespace-nowrap ${
                  linkFilter === btn.id
                    ? 'bg-[#8B5CF6] text-white'
                    : 'text-[#8B949E] hover:text-[#F0F6FC]'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>

          {/* Layout Mode Switcher */}
          <div className="flex items-center bg-[#0D1117] p-0.5 rounded border border-[#30363D]">
            <button
              onClick={() => setLayoutMode('causal')}
              className={`h-[28px] px-2.5 text-xs font-mono rounded transition-colors cursor-pointer whitespace-nowrap ${
                layoutMode === 'causal'
                  ? 'bg-[#30363D] text-[#F0F6FC]'
                  : 'text-[#8B949E] hover:text-[#F0F6FC]'
              }`}
            >
              Causal Timeline Layout
            </button>
            <button
              onClick={() => setLayoutMode('service')}
              className={`h-[28px] px-2.5 text-xs font-mono rounded transition-colors cursor-pointer whitespace-nowrap ${
                layoutMode === 'service'
                  ? 'bg-[#30363D] text-[#F0F6FC]'
                  : 'text-[#8B949E] hover:text-[#F0F6FC]'
              }`}
            >
              Service Clusters Layout
            </button>
          </div>

          {/* Zoom Controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setZoom((z) => Math.max(0.75, +(z - 0.1).toFixed(2)))}
              className="h-[28px] w-[28px] flex items-center justify-center bg-[#21262D] border border-[#30363D] rounded text-[#C9D1D9] hover:text-[#F0F6FC] cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setZoom(1)}
              className="h-[28px] px-2 text-xs font-mono bg-[#21262D] border border-[#30363D] rounded text-[#C9D1D9] hover:text-[#F0F6FC] cursor-pointer tabular-nums"
              title="Reset Zoom"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              onClick={() => setZoom((z) => Math.min(1.4, +(z + 0.1).toFixed(2)))}
              className="h-[28px] w-[28px] flex items-center justify-center bg-[#21262D] border border-[#30363D] rounded text-[#C9D1D9] hover:text-[#F0F6FC] cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Node Type Filter & Visual Legend Bar */}
      <div className="bg-[#161B22] border border-[#30363D] rounded px-4 py-2.5 flex flex-wrap items-center justify-between gap-4 text-xs font-mono">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="inline-block w-6 h-0.5 bg-[#38BDF8]" />
            <span className="text-[#F0F6FC]">Direct Link (Solid):</span>
            <span className="text-[#8B949E]">trace_id / commitSha / metric match</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block w-6 h-0.5 border-b-2 border-dashed border-[#A78BFA]" />
            <span className="text-[#F0F6FC]">Inferred Link (Dashed):</span>
            <span className="text-[#8B949E]">Temporal proximity + symptom domain</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[#8B949E] mr-1">Filter Nodes:</span>
          {(['all', 'deployment', 'log', 'metric', 'ticket', 'service_event', 'what_if'] as const).map(
            (nt) => (
              <button
                key={nt}
                onClick={() => setTypeFilter(nt)}
                className={`px-2 py-0.5 text-[11px] rounded cursor-pointer uppercase ${
                  typeFilter === nt
                    ? 'bg-[#38BDF8]/20 text-[#38BDF8] border border-[#38BDF8]/40'
                    : 'bg-[#0D1117] text-[#8B949E] border border-[#21262D] hover:text-[#C9D1D9]'
                }`}
              >
                {nt}
              </button>
            )
          )}
        </div>
      </div>

      {/* Main Split Canvas: Interactive Graph (Left 8 cols) + Node/Edge Provenance Inspector (Right 4 cols) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Interactive SVG Graph Canvas */}
        <div className="xl:col-span-8 bg-[#0D1117] border border-[#30363D] rounded overflow-hidden flex flex-col">
          <div className="px-4 py-2.5 bg-[#161B22] border-b border-[#30363D] flex items-center justify-between text-xs font-mono text-[#8B949E]">
            <span>
              Interactive Canvas — Click any Record Node or Relationship Edge to inspect provenance
            </span>
            <span>
              Nodes: {nodes.length} · Active Edges: {visibleRelationships.length}
            </span>
          </div>

          <div className="relative overflow-auto flex-1 min-h-[540px] flex items-center justify-center p-2">
            <svg
              viewBox="0 0 920 540"
              className="w-full h-[540px] select-none"
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: 'center center',
                transition: 'transform 150ms ease-out',
              }}
            >
              <defs>
                {/* Subtle Engineering Grid Pattern */}
                <pattern
                  id="forensic-grid"
                  width="24"
                  height="24"
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d="M 24 0 L 0 0 0 24"
                    fill="none"
                    stroke="#161B22"
                    strokeWidth="1"
                  />
                </pattern>
                <marker
                  id="arrow-direct"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#38BDF8" />
                </marker>
                <marker
                  id="arrow-inferred"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#A78BFA" />
                </marker>
              </defs>

              <rect width="920" height="540" fill="url(#forensic-grid)" />

              {/* Tier Reference Labels */}
              <text
                x="16"
                y="52"
                fill="#484F58"
                fontSize="10"
                fontFamily="JetBrains Mono"
              >
                TIER 0: INCIDENT ROOT
              </text>
              <text
                x="16"
                y="148"
                fill="#484F58"
                fontSize="10"
                fontFamily="JetBrains Mono"
              >
                TIER 1: AFFECTED SERVICES
              </text>
              <text
                x="16"
                y="265"
                fill="#484F58"
                fontSize="10"
                fontFamily="JetBrains Mono"
              >
                TIER 2: GROUNDED SOURCE RECORDS & TELEMETRY
              </text>

              {/* Edges from Incident Root to Services */}
              {nodes
                .filter((n) => n.nodeKind === 'service')
                .map((svcNode) => (
                  <line
                    key={`root-${svcNode.id}`}
                    x1={460}
                    y1={68}
                    x2={svcNode.x}
                    y2={svcNode.y - 22}
                    stroke="#30363D"
                    strokeWidth="1.2"
                  />
                ))}

              {/* Subtle Topology Links from Services to Emitted Records */}
              {serviceEdges.map((se) => (
                <line
                  key={se.id}
                  x1={se.fromX}
                  y1={se.fromY + 22}
                  x2={se.toX}
                  y2={se.toY - 24}
                  stroke="#21262D"
                  strokeWidth="1"
                  strokeDasharray="2 3"
                />
              ))}

              {/* Direct and Inferred Evidence Relationships */}
              {visibleRelationships.map((rel) => {
                const src = nodeMap.get(rel.sourceId);
                const tgt = nodeMap.get(rel.targetId);
                if (!src || !tgt) return null;

                const isDirect = rel.type === 'direct';
                const isSelectedEdge = selectedEdgeId === rel.id;
                const isConnectedToSelectedNode =
                  inspectedRecord &&
                  (rel.sourceId === inspectedRecord.id ||
                    rel.targetId === inspectedRecord.id);

                const midX = (src.x + tgt.x) / 2;
                const midY = (src.y + tgt.y) / 2 - 18;

                return (
                  <g
                    key={rel.id}
                    onClick={() => {
                      setSelectedEdgeId(rel.id);
                      setSelectedServiceNode(null);
                    }}
                    className="cursor-pointer"
                  >
                    <path
                      d={`M ${src.x} ${src.y} Q ${midX} ${midY} ${tgt.x} ${tgt.y}`}
                      fill="none"
                      stroke={
                        isSelectedEdge
                          ? '#F0F6FC'
                          : isDirect
                          ? '#38BDF8'
                          : '#A78BFA'
                      }
                      strokeWidth={
                        isSelectedEdge || isConnectedToSelectedNode ? '2.6' : '1.7'
                      }
                      strokeDasharray={isDirect ? undefined : '6 4'}
                      markerEnd={
                        isDirect ? 'url(#arrow-direct)' : 'url(#arrow-inferred)'
                      }
                      opacity={
                        isSelectedEdge || isConnectedToSelectedNode ? 1 : 0.78
                      }
                    />
                    {/* Clickable Edge Confidence Badge */}
                    <rect
                      x={midX - 30}
                      y={midY - 9}
                      width="60"
                      height="16"
                      rx="3"
                      fill="#0D1117"
                      stroke={isDirect ? '#38BDF8' : '#A78BFA'}
                      strokeWidth="1"
                    />
                    <text
                      x={midX}
                      y={midY + 2}
                      textAnchor="middle"
                      fill={isDirect ? '#38BDF8' : '#A78BFA'}
                      fontSize="9"
                      fontFamily="JetBrains Mono"
                    >
                      {isDirect ? 'DIRECT' : 'INFER'} {rel.confidenceWeight}%
                    </text>
                  </g>
                );
              })}

              {/* Render All Graph Nodes */}
              {nodes.map((node) => {
                const isSelectedRecord =
                  node.nodeKind === 'record' &&
                  inspectedRecord?.id === node.id &&
                  !selectedEdgeId &&
                  !selectedServiceNode;
                const isSelectedSvc = selectedServiceNode === node.id;

                const boxWidth = node.nodeKind === 'service' ? 156 : 132;
                const boxHeight = 42;

                return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x - boxWidth / 2}, ${
                      node.y - boxHeight / 2
                    })`}
                    onClick={() => {
                      if (node.nodeKind === 'record' && node.record) {
                        setSelectedEdgeId(null);
                        setSelectedServiceNode(null);
                        onSelectRecord(node.record.id);
                      } else if (node.nodeKind === 'service') {
                        setSelectedEdgeId(null);
                        setSelectedServiceNode(node.id);
                      }
                    }}
                    className="cursor-pointer"
                  >
                    <rect
                      width={boxWidth}
                      height={boxHeight}
                      rx="5"
                      fill={
                        isSelectedRecord || isSelectedSvc ? '#21262D' : '#161B22'
                      }
                      stroke={
                        isSelectedRecord || isSelectedSvc
                          ? '#F0F6FC'
                          : node.color
                      }
                      strokeWidth={isSelectedRecord || isSelectedSvc ? '2' : '1.3'}
                    />
                    {/* Left status accent bar */}
                    <rect
                      x="0"
                      y="0"
                      width="4"
                      height={boxHeight}
                      rx="2"
                      fill={node.color}
                    />
                    <text
                      x="12"
                      y="17"
                      fill="#F0F6FC"
                      fontSize="11"
                      fontWeight="600"
                      fontFamily="JetBrains Mono"
                    >
                      {node.label.length > 18
                        ? `${node.label.slice(0, 17)}…`
                        : node.label}
                    </text>
                    <text
                      x="12"
                      y="32"
                      fill="#8B949E"
                      fontSize="9.5"
                      fontFamily="JetBrains Mono"
                    >
                      {node.sublabel}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Right: Forensic Node & Edge Inspector */}
        <div className="xl:col-span-4 bg-[#161B22] border border-[#30363D] rounded flex flex-col">
          <div className="p-4 border-b border-[#30363D] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Code2 className="w-4 h-4 text-[#38BDF8]" />
              <h2 className="text-sm font-semibold text-[#F0F6FC]">
                {selectedEdgeId
                  ? 'Relationship Edge Inspector'
                  : selectedServiceNode
                  ? 'Service Node Inspector'
                  : 'Source Node Inspector'}
              </h2>
            </div>
            {(selectedEdgeId || selectedServiceNode) && (
              <button
                onClick={() => {
                  setSelectedEdgeId(null);
                  setSelectedServiceNode(null);
                }}
                className="text-xs font-mono text-[#38BDF8] hover:underline cursor-pointer"
              >
                Back to Record
              </button>
            )}
          </div>

          {/* Case 1: Inspecting a Clicked Edge */}
          {inspectedEdge ? (
            <div className="p-4 space-y-4">
              <div className="bg-[#0D1117] border border-[#21262D] rounded p-3 space-y-2 text-xs font-mono">
                <div className="flex items-center justify-between">
                  <span className="text-[#8B949E]">Relationship ID:</span>
                  <span className="text-[#F0F6FC] font-semibold">
                    {inspectedEdge.id}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#8B949E]">Classification:</span>
                  <span
                    className={`uppercase font-semibold ${
                      inspectedEdge.type === 'direct'
                        ? 'text-[#38BDF8]'
                        : 'text-[#A78BFA]'
                    }`}
                  >
                    {inspectedEdge.type} LINK
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#8B949E]">Endpoints:</span>
                  <span className="text-[#F0F6FC]">
                    {inspectedEdge.sourceId} → {inspectedEdge.targetId}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#8B949E]">Confidence Weight:</span>
                  <span className="text-[#10B981] tabular-nums">
                    {inspectedEdge.confidenceWeight}%
                  </span>
                </div>
                {inspectedEdge.temporalDeltaSeconds !== undefined && (
                  <div className="flex items-center justify-between">
                    <span className="text-[#8B949E]">Temporal Delta:</span>
                    <span className="text-[#C9D1D9] tabular-nums">
                      Δ{inspectedEdge.temporalDeltaSeconds}s
                    </span>
                  </div>
                )}
              </div>

              <div className="bg-[#0D1117] border border-[#21262D] rounded p-3">
                <div className="text-[11px] font-mono text-[#8B949E] uppercase mb-1">
                  Linkage Rule & Provenance Explanation
                </div>
                <p className="text-xs text-[#F0F6FC] leading-relaxed">
                  {inspectedEdge.ruleExplanation}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    setSelectedEdgeId(null);
                    onSelectRecord(inspectedEdge.sourceId);
                  }}
                  className="h-[32px] px-3 text-xs font-mono bg-[#21262D] text-[#38BDF8] border border-[#30363D] rounded hover:bg-[#30363D] cursor-pointer"
                >
                  Inspect {inspectedEdge.sourceId}
                </button>
                <button
                  onClick={() => {
                    setSelectedEdgeId(null);
                    onSelectRecord(inspectedEdge.targetId);
                  }}
                  className="h-[32px] px-3 text-xs font-mono bg-[#21262D] text-[#38BDF8] border border-[#30363D] rounded hover:bg-[#30363D] cursor-pointer"
                >
                  Inspect {inspectedEdge.targetId}
                </button>
              </div>
            </div>
          ) : selectedServiceNode ? (
            /* Case 2: Inspecting a Clicked Service Node */
            <div className="p-4 space-y-4">
              {(() => {
                const svcName = selectedServiceNode.replace('SVC:', '');
                const svc = incident.affectedServices.find((s) => s.name === svcName);
                const svcRecords = incident.records.filter(
                  (r) => r.service === svcName
                );
                if (!svc) return null;
                return (
                  <>
                    <div className="bg-[#0D1117] border border-[#21262D] rounded p-3 space-y-2 text-xs font-mono">
                      <div className="text-[#F0F6FC] font-semibold text-sm">
                        {svc.name}
                      </div>
                      <div className="text-[#8B949E]">
                        Tier: {svc.tier} · Status: {svc.status}
                      </div>
                      <div className="text-[#C9D1D9]">
                        Error Rate: {svc.errorRate} · p99: {svc.p99Latency}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-mono text-[#8B949E] uppercase mb-2">
                        Grounded Records for {svc.name} ({svcRecords.length})
                      </div>
                      <div className="space-y-2">
                        {svcRecords.map((r) => (
                          <div
                            key={r.id}
                            onClick={() => {
                              setSelectedServiceNode(null);
                              onSelectRecord(r.id);
                            }}
                            className="p-2.5 bg-[#0D1117] border border-[#21262D] rounded hover:border-[#38BDF8] cursor-pointer text-xs"
                          >
                            <div className="flex justify-between font-mono text-[11px] mb-1">
                              <span className="text-[#38BDF8] font-semibold">
                                {r.id}
                              </span>
                              <span className="text-[#8B949E]">
                                {r.timestamp.slice(11, 19)}Z
                              </span>
                            </div>
                            <p className="text-[#C9D1D9] line-clamp-2">{r.summary}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          ) : inspectedRecord ? (
            /* Case 3: Inspecting a Clicked Source Record Node */
            <div className="p-4 space-y-4 flex-1 overflow-y-auto">
              <div className="bg-[#0D1117] border border-[#21262D] rounded p-3 space-y-1.5 text-xs font-mono">
                <div className="flex items-center justify-between">
                  <span className="text-[#38BDF8] font-semibold text-sm">
                    {inspectedRecord.id}
                  </span>
                  <span className="uppercase text-[#8B949E]">
                    {inspectedRecord.type} · {inspectedRecord.sourceOrigin}
                  </span>
                </div>
                <div className="text-[#C9D1D9]">
                  Service: <span className="text-[#F0F6FC]">{inspectedRecord.service}</span>
                </div>
                <div className="text-[#8B949E] tabular-nums">
                  Timestamp: {inspectedRecord.timestamp}
                </div>
              </div>

              <div>
                <div className="text-[11px] font-mono text-[#8B949E] uppercase mb-1">
                  Record Summary
                </div>
                <p className="text-xs text-[#F0F6FC] bg-[#0D1117] border border-[#21262D] rounded p-2.5 leading-relaxed">
                  {inspectedRecord.summary}
                </p>
              </div>

              {/* Connected Direct vs Inferred Edges */}
              <div>
                <div className="text-[11px] font-mono text-[#8B949E] uppercase mb-1.5">
                  Connected Graph Relationships ({recordConnections.length})
                </div>
                {recordConnections.length === 0 ? (
                  <div className="text-xs text-[#8B949E] bg-[#0D1117] border border-[#21262D] rounded p-2.5">
                    No direct or inferred edges connected to this node.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {recordConnections.map((rel) => {
                      const peerId =
                        rel.sourceId === inspectedRecord.id
                          ? rel.targetId
                          : rel.sourceId;
                      return (
                        <div
                          key={rel.id}
                          onClick={() => setSelectedEdgeId(rel.id)}
                          className="p-2.5 bg-[#0D1117] border border-[#21262D] rounded hover:border-[#484F58] cursor-pointer text-xs"
                        >
                          <div className="flex items-center justify-between font-mono text-[11px] mb-1">
                            <span
                              className={
                                rel.type === 'direct'
                                  ? 'text-[#38BDF8] font-semibold'
                                  : 'text-[#A78BFA] font-semibold'
                              }
                            >
                              {rel.type.toUpperCase()} → {peerId}
                            </span>
                            <span className="text-[#8B949E] tabular-nums">
                              {rel.confidenceWeight}% conf
                            </span>
                          </div>
                          <div className="text-[#F0F6FC] font-medium mb-0.5">
                            {rel.label}
                          </div>
                          <p className="text-[11px] text-[#8B949E]">
                            {rel.ruleExplanation}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Raw Record Payload */}
              <div>
                <div className="text-[11px] font-mono text-[#8B949E] uppercase mb-1">
                  Immutable Source Record Payload
                </div>
                <pre className="p-2.5 bg-[#0D1117] border border-[#21262D] rounded text-[11px] font-mono text-[#C9D1D9] overflow-x-auto max-h-56">
                  {inspectedRecord.rawPayload}
                </pre>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
