"use client";

import { useState, useCallback, useEffect, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import useSWR from "swr";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  addEdge,
  MarkerType,
  ConnectionMode,
  type Node,
  type Edge,
  type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { Sidebar } from "@/components/layout/Sidebar";
import { AgentLibraryPanel, type SavedWorkflow } from "@/components/workflow/AgentLibraryPanel";
import { NodePropertiesPanel } from "@/components/workflow/NodePropertiesPanel";
import { TriggerNode, type TriggerNodeData, type TriggerType } from "@/components/workflow/TriggerNode";
import { WorkflowStepNode, type WorkflowStepData, type InputType } from "@/components/workflow/WorkflowStepNode";
import { api, type Agent, type BusinessUnit } from "@/lib/api";
import { FloatingEdge } from "@/components/workflow/FloatingEdge";
import { FloatingConnectionLine } from "@/components/workflow/FloatingConnectionLine";

// ── Node / edge types registries ─────────────────────────────────────────────

const nodeTypes = {
  triggerNode: TriggerNode,
  workflowStep: WorkflowStepNode,
};

const edgeTypes = {
  floating: FloatingEdge,
};

// ── Edge defaults (applied manually in onConnect) ────────────────────────────
// Intentionally no `style` here — stroke/width are controlled via .workflow-canvas CSS
// so they don't conflict with the !important overrides in globals.css.

const EDGE_DEFAULTS = {
  animated: true,
  type: "floating",
  markerEnd: { type: MarkerType.ArrowClosed, color: "rgba(139,92,246,0.8)" },
};

// ── Initial canvas state ──────────────────────────────────────────────────────

const INITIAL_TRIGGER: Node = {
  id: "trigger-1",
  type: "triggerNode",
  position: { x: 60, y: 180 },
  data: { triggerType: "manual" } as TriggerNodeData,
  deletable: false,
};

const STORAGE_KEY        = "lanara-workflow-v1";
const WORKFLOWS_LIST_KEY = "lanara-saved-workflows";

function loadWorkflowsList(): SavedWorkflow[] {
  try {
    const raw = localStorage.getItem(WORKFLOWS_LIST_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

// ── Inner page (needs ReactFlowProvider ancestor for useReactFlow) ────────────

interface PageInnerProps {
  agents: Agent[];
  businessUnits: BusinessUnit[];
}

function WorkflowPageInner({ agents, businessUnits }: PageInnerProps) {
  const { screenToFlowPosition } = useReactFlow();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([INITIAL_TRIGGER]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [workflowName, setWorkflowName] = useState("Untitled Workflow");
  const [editingName, setEditingName] = useState(false);
  const [savedWorkflows, setSavedWorkflows] = useState<SavedWorkflow[]>(() => loadWorkflowsList());

  // ── Persist / restore ────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.name) setWorkflowName(saved.name);
      if (saved.nodes?.length) {
        setNodes(
          (saved.nodes as Node[]).map((n) => ({
            ...n,
            deletable: n.id === "trigger-1" ? false : n.deletable,
          })),
        );
      }
      if (saved.edges) setEdges((saved.edges as Edge[]).map((e) => ({ ...e, type: "floating" })));
      if (saved.selectedId) setSelectedId(saved.selectedId);
    } catch { /* ignore corrupt storage */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save on every change (debounced 500 ms) so navigating away never loses work
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ name: workflowName, nodes, edges, selectedId }));
      } catch { /* ignore */ }
    }, 500);
    return () => clearTimeout(id);
  }, [workflowName, nodes, edges, selectedId]);

  const handleSave = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ name: workflowName, nodes, edges, selectedId }));
    } catch { /* ignore */ }
    // Save a named snapshot to the workflows list (upsert by name)
    const snapshot: SavedWorkflow = {
      id: Date.now().toString(),
      name: workflowName,
      nodes,
      edges,
      savedAt: new Date().toISOString(),
    };
    setSavedWorkflows((prev) => {
      const next = [snapshot, ...prev.filter((w) => w.name !== workflowName)];
      try { localStorage.setItem(WORKFLOWS_LIST_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [workflowName, nodes, edges, selectedId]);

  const handleLoadWorkflow = useCallback((wf: SavedWorkflow) => {
    setWorkflowName(wf.name);
    setNodes(
      (wf.nodes as Node[]).map((n) => ({
        ...n,
        deletable: n.id === "trigger-1" ? false : n.deletable,
      })),
    );
    setEdges((wf.edges as Edge[]).map((e) => ({ ...e, type: "floating" })));
    setSelectedId(null);
  }, [setNodes, setEdges]);

  const handleDeleteWorkflow = useCallback((id: string) => {
    setSavedWorkflows((prev) => {
      const next = prev.filter((w) => w.id !== id);
      try { localStorage.setItem(WORKFLOWS_LIST_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const handleNewWorkflow = useCallback(() => {
    setWorkflowName("Untitled Workflow");
    setNodes([INITIAL_TRIGGER]);
    setEdges([]);
    setSelectedId(null);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }, [setNodes, setEdges, setSelectedId]);

  // Clear canvas when navigated here with ?new=true (e.g. sidebar + button)
  const newParamHandled = useRef(false);
  useEffect(() => {
    if (newParamHandled.current || searchParams.get("new") !== "true") return;
    newParamHandled.current = true;
    handleNewWorkflow();
    router.replace("/workflow");
  }, [searchParams, handleNewWorkflow, router]);

  // ── Drag-and-drop from AgentLibraryPanel ─────────────────────────────────────
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const raw = event.dataTransfer.getData("application/reactflow");
      if (!raw) return;
      try {
        const info = JSON.parse(raw);
        const dropPos = screenToFlowPosition({ x: event.clientX, y: event.clientY });

        setNodes((nds) => {
          // Snap to grid-friendly position: honour drop point but keep y aligned
          // with neighbours if they're close, so horizontal chains stay tidy.
          const position = { x: dropPos.x, y: dropPos.y };

          return [
            ...nds,
            {
              id: `step-${Date.now()}`,
              type: "workflowStep",
              position,
              data: {
                agentId: info.agentId,
                agentName: info.agentName,
                agentDescription: info.agentDescription ?? null,
                swarmName: info.swarmName,
                swarmId: info.swarmId,
                colorIndex: info.colorIndex ?? 0,
                inputType: "any",
              } as WorkflowStepData,
            },
          ];
        });
      } catch { /* ignore malformed payload */ }
    },
    [screenToFlowPosition, setNodes],
  );

  // ── Edge creation ────────────────────────────────────────────────────────────
  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge({ ...params, ...EDGE_DEFAULTS }, eds));
    },
    [setEdges],
  );

  // ── Node selection ───────────────────────────────────────────────────────────
  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedId(node.id);
  }, []);

  const handlePaneClick = useCallback(() => {
    setSelectedId(null);
  }, []);

  // ── Node data update (from properties panel) ──────────────────────────────────
  const handleUpdateNode = useCallback(
    (data: Partial<TriggerNodeData | WorkflowStepData>) => {
      if (!selectedId) return;
      setNodes((nds) =>
        nds.map((n) =>
          n.id === selectedId ? { ...n, data: { ...n.data, ...data } } : n,
        ),
      );
    },
    [selectedId, setNodes],
  );

  const handleRemoveNode = useCallback(() => {
    if (!selectedId) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedId));
    setEdges((eds) => eds.filter((e) => e.source !== selectedId && e.target !== selectedId));
    setSelectedId(null);
  }, [selectedId, setNodes, setEdges]);

  // ── Auto-layout (horizontal BFS left → right) ────────────────────────────────
  const autoLayout = useCallback(() => {
    const H_GAP = 300; // horizontal distance between node left edges
    const CENTER_Y = 180;

    const outgoing = new Map<string, string[]>();
    nodes.forEach((n) => outgoing.set(n.id, []));
    edges.forEach((e) => outgoing.get(e.source)?.push(e.target));

    const visited = new Set<string>();
    const order: string[] = [];
    const queue = ["trigger-1"];

    while (queue.length > 0) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      order.push(id);
      (outgoing.get(id) ?? []).forEach((next) => queue.push(next));
    }

    // Append disconnected nodes in a second row
    nodes.forEach((n) => { if (!visited.has(n.id)) order.push(n.id); });

    setNodes((nds) =>
      nds.map((n) => {
        const i = order.indexOf(n.id);
        const row = i < visited.size ? 0 : 1;
        const col = row === 0 ? i : i - visited.size;
        return { ...n, position: { x: col * H_GAP + 60, y: CENTER_Y + row * 220 } };
      }),
    );
  }, [nodes, edges, setNodes]);

  const selectedNode = nodes.find((n) => n.id === selectedId) ?? null;

  return (
    <div className="flex flex-1 min-w-0 overflow-hidden">
      {/* Agent library */}
      <AgentLibraryPanel
        agents={agents}
        businessUnits={businessUnits}
        savedWorkflows={savedWorkflows}
        onLoadWorkflow={handleLoadWorkflow}
        onDeleteWorkflow={handleDeleteWorkflow}
      />

      {/* Canvas + toolbar */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-surface-0/80 backdrop-blur-sm shrink-0">
          {editingName ? (
            <input
              autoFocus
              value={workflowName}
              onChange={(e) => setWorkflowName(e.target.value)}
              onBlur={() => setEditingName(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "Escape") setEditingName(false);
              }}
              className="flex-1 bg-transparent text-sm font-semibold text-text-1 outline-none border-b border-violet min-w-0"
            />
          ) : (
            <button
              onClick={() => setEditingName(true)}
              title="Click to rename"
              className="flex-1 text-left text-sm font-semibold text-text-1 hover:text-text-2 transition-colors truncate"
            >
              {workflowName}
            </button>
          )}

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={autoLayout}
              title="Arrange nodes vertically"
              className="px-3 py-1.5 text-xs text-text-2 hover:text-text-1 border border-border hover:border-border-strong rounded-lg transition-colors"
            >
              Auto Layout
            </button>
            <button
              onClick={handleNewWorkflow}
              title="Clear canvas and start a new workflow"
              className="px-3 py-1.5 text-xs text-text-2 hover:text-text-1 border border-border hover:border-border-strong rounded-lg transition-colors"
            >
              New
            </button>
            <button
              onClick={handleSave}
              className="px-3 py-1.5 text-xs font-medium text-violet border border-violet/30 hover:bg-violet/10 rounded-lg transition-colors"
            >
              Save
            </button>
            <button
              disabled
              title="Workflow execution coming soon"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-violet/20 text-violet rounded-lg opacity-60 cursor-not-allowed"
            >
              <span className="text-[10px]">▶</span>
              Run
            </button>
          </div>
        </div>

        {/* React Flow canvas — h-full ensures ReactFlow's inner height:100% resolves correctly */}
        <div className="workflow-canvas flex-1 h-full relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onNodeClick={handleNodeClick}
            onPaneClick={handlePaneClick}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            connectionMode={ConnectionMode.Loose}
            connectionLineComponent={FloatingConnectionLine}
            fitView
            fitViewOptions={{ padding: 0.35 }}
            minZoom={0.15}
            maxZoom={2.5}
            deleteKeyCode={["Backspace", "Delete"]}
            proOptions={{ hideAttribution: true }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={24}
              size={1}
              color="rgba(255,255,255,0.05)"
            />
            <Controls position="bottom-left" />
            <MiniMap
              position="bottom-right"
              nodeColor={(node) =>
                node.type === "triggerNode"
                  ? "rgba(52,211,153,0.4)"
                  : "rgba(139,92,246,0.35)"
              }
              maskColor="rgba(6,6,11,0.88)"
            />
          </ReactFlow>
        </div>
      </div>

      {/* Properties panel */}
      {selectedNode && (
        <NodePropertiesPanel
          node={selectedNode}
          edges={edges}
          onUpdate={handleUpdateNode}
          onRemove={handleRemoveNode}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

// ── Page wrapper ──────────────────────────────────────────────────────────────

export default function WorkflowPage() {
  const { data: agentsRaw = [] } = useSWR("workflow-agents", () => api.agents.list());
  const { data: busRaw = [] } = useSWR("workflow-bus", () => api.businessUnits.list());

  const agents = agentsRaw as Agent[];
  const businessUnits = busRaw as BusinessUnit[];

  return (
    <div className="flex h-screen bg-surface-0 overflow-hidden">
      <Sidebar />
      <ReactFlowProvider>
        <Suspense fallback={null}>
          <WorkflowPageInner agents={agents} businessUnits={businessUnits} />
        </Suspense>
      </ReactFlowProvider>
    </div>
  );
}
