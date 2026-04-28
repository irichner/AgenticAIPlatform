"use client";

import { useState, useCallback, useEffect, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import useSWR, { mutate as swrMutate } from "swr";
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
import {
  Undo2, Redo2, Trash2, LayoutDashboard, CheckCircle2,
  AlertTriangle, Download, Upload, FilePlus, Save, Play, X,
  GitBranch, Loader2, Zap,
} from "lucide-react";

import { Sidebar } from "@/components/layout/Sidebar";
import { AgentLibraryPanel } from "@/components/workflow/AgentLibraryPanel";
import { NodePropertiesPanel } from "@/components/workflow/NodePropertiesPanel";
import { TriggerNode, type TriggerNodeData, type TriggerType } from "@/components/workflow/TriggerNode";
import { WorkflowStepNode, type WorkflowStepData } from "@/components/workflow/WorkflowStepNode";
import { EndEventNode, type EndEventData } from "@/components/workflow/EndEventNode";
import { GatewayNode, type GatewayData } from "@/components/workflow/GatewayNode";
import { TaskNode, type TaskData } from "@/components/workflow/TaskNode";
import { IntermediateEventNode, type IntermediateEventData } from "@/components/workflow/IntermediateEventNode";
import { AnnotationNode, type AnnotationData } from "@/components/workflow/AnnotationNode";
import { SwimlaneNode, type SwimlaneData } from "@/components/workflow/SwimlaneNode";
import { FloatingEdge, type EdgeData } from "@/components/workflow/FloatingEdge";
import { FloatingConnectionLine } from "@/components/workflow/FloatingConnectionLine";
import { ExecutionPanel, RunInputDialog, type ExecEvent } from "@/components/workflow/ExecutionPanel";
import { api, type Agent, type BusinessUnit } from "@/lib/api";
import { useAuth } from "@/contexts/auth";
import { exportToBpmnXml, importFromBpmnXml } from "@/lib/bpmn-xml";
import { applyDagreLayout } from "@/lib/dagre-layout";
import { cn } from "@/lib/cn";

// ── Node / edge type registries ───────────────────────────────────────────────

const nodeTypes = {
  triggerNode:       TriggerNode,
  workflowStep:      WorkflowStepNode,
  endEvent:          EndEventNode,
  gateway:           GatewayNode,
  taskNode:          TaskNode,
  intermediateEvent: IntermediateEventNode,
  annotation:        AnnotationNode,
  swimlane:          SwimlaneNode,
};

const edgeTypes = { floating: FloatingEdge };

// ── Edge defaults ─────────────────────────────────────────────────────────────

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

// ── BPMN node factory ─────────────────────────────────────────────────────────

function createBpmnNode(
  id: string,
  info: Record<string, string>,
  position: { x: number; y: number },
): Node {
  switch (info.bpmnType) {
    case "endEvent":
      return { id, type: "endEvent", position, data: { subtype: info.subtype ?? "none", label: "" } as EndEventData };
    case "gateway":
      return { id, type: "gateway", position, data: { gatewayType: info.gatewayType ?? "exclusive", label: "" } as GatewayData };
    case "taskNode":
      return { id, type: "taskNode", position, data: { subtype: info.taskSubtype ?? "task", label: "New Task", description: "" } as TaskData };
    case "intermediateEvent":
      return { id, type: "intermediateEvent", position, data: { eventType: info.eventType ?? "timer", mode: "catching", label: "" } as IntermediateEventData };
    case "annotation":
      return { id, type: "annotation", position, style: { width: 180, height: 80 }, data: { text: "" } as AnnotationData };
    case "swimlane":
      return {
        id, type: "swimlane",
        position,
        style: { width: 600, height: 300 },
        data: { label: "Pool", color: info.color ?? "violet", orientation: info.orientation ?? "horizontal" } as SwimlaneData,
        zIndex: -1,
      };
    default:
      return { id, type: "taskNode", position, data: { subtype: "task", label: "New Task" } as TaskData };
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

type SelectionTarget = { id: string; kind: "node" | "edge" } | null;
type ValidationError = { level: "error" | "warning"; message: string; nodeId?: string };
type HistoryState = { nodes: Node[]; edges: Edge[] };

// ── Toolbar primitives ────────────────────────────────────────────────────────

function TBtn({
  onClick, disabled, title, className, children,
}: {
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs transition-colors",
        disabled
          ? "text-text-3/50 cursor-not-allowed"
          : "text-text-2 hover:text-text-1 hover:bg-surface-2",
        className,
      )}
    >
      {children}
    </button>
  );
}

function TSep() {
  return <span className="w-px h-5 bg-border shrink-0" />;
}

// ── Validation popup ──────────────────────────────────────────────────────────

function ValidationPopup({
  errors,
  onClose,
}: {
  errors: ValidationError[];
  onClose: () => void;
}) {
  return (
    <div className="absolute top-full right-0 mt-1.5 w-72 z-50 glass border border-border rounded-2xl shadow-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-semibold text-text-1">
          {errors.length === 0 ? "No issues" : `${errors.length} issue${errors.length > 1 ? "s" : ""}`}
        </span>
        <button onClick={onClose} className="text-text-3 hover:text-text-2 transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {errors.length === 0 ? (
        <div className="px-3 py-3 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald shrink-0" />
          <p className="text-xs text-text-2">Process is valid and ready to run.</p>
        </div>
      ) : (
        <div className="max-h-56 overflow-y-auto divide-y divide-border">
          {errors.map((err, i) => (
            <div key={i} className="flex items-start gap-2 px-3 py-2.5">
              {err.level === "error" ? (
                <X className="w-3.5 h-3.5 text-rose shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5 text-amber shrink-0 mt-0.5" />
              )}
              <p className="text-xs text-text-2 leading-relaxed">{err.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Save Version dialog ───────────────────────────────────────────────────────

function SaveVersionDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: (note: string) => void;
  onCancel: () => void;
}) {
  const [note, setNote] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="glass border border-border rounded-2xl shadow-2xl w-80 p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-1 flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-violet" />
            Save Version
          </h3>
          <button onClick={onCancel} className="text-text-3 hover:text-text-2">
            <X className="w-4 h-4" />
          </button>
        </div>
        <input
          autoFocus
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onConfirm(note); if (e.key === "Escape") onCancel(); }}
          placeholder="Optional note (e.g. 'Added approval gate')"
          className="w-full bg-surface-2 border border-border rounded-xl px-3 py-2 text-xs text-text-1 placeholder:text-text-3 outline-none focus:border-violet transition-colors"
        />
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-3 py-1.5 text-xs text-text-2 hover:text-text-1 hover:bg-surface-2 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            onClick={() => onConfirm(note)}
            className="px-3 py-1.5 text-xs font-medium bg-violet/20 text-violet hover:bg-violet/30 rounded-lg transition-colors"
          >
            Save Version
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page inner ────────────────────────────────────────────────────────────────

interface PageInnerProps {
  agents: Agent[];
  businessUnits: BusinessUnit[];
}

function WorkflowPageInner({ agents, businessUnits }: PageInnerProps) {
  const { screenToFlowPosition } = useReactFlow();
  const searchParams = useSearchParams();
  const router = useRouter();

  // ReactFlow state
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([INITIAL_TRIGGER]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Selection
  const [selection, setSelection] = useState<SelectionTarget>(null);

  // Workflow metadata
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [workflowName, setWorkflowName] = useState("Untitled Workflow");
  const [editingName, setEditingName] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // Validation
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [showValidation, setShowValidation] = useState(false);

  // Version dialog
  const [showVersionDialog, setShowVersionDialog] = useState(false);

  // Copy-paste clipboard
  const clipboardRef = useRef<{ nodes: Node[]; edges: Edge[] } | null>(null);

  // Execution state
  const [showRunDialog, setShowRunDialog] = useState(false);
  const [execEvents, setExecEvents] = useState<ExecEvent[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isSimulation, setIsSimulation] = useState(false);
  const [showExecPanel, setShowExecPanel] = useState(false);
  const [execNodeStates, setExecNodeStates] = useState<Map<string, "active" | "done" | "error">>(new Map());

  // History
  const historyRef = useRef<HistoryState[]>([{ nodes: [INITIAL_TRIGGER], edges: [] }]);
  const [historyIdx, setHistoryIdx] = useState(0);
  const isRestoringRef = useRef(false);

  const canUndo = historyIdx > 0;
  const canRedo = historyIdx < historyRef.current.length - 1;

  const pushHistory = useCallback((n: Node[], e: Edge[]) => {
    if (isRestoringRef.current) return;
    const trimmed = historyRef.current.slice(0, historyIdx + 1);
    trimmed.push({ nodes: n, edges: e });
    historyRef.current = trimmed.length > 60 ? trimmed.slice(-60) : trimmed;
    setHistoryIdx(historyRef.current.length - 1);
    setIsDirty(true);
  }, [historyIdx]);

  const undo = useCallback(() => {
    const newIdx = historyIdx - 1;
    if (newIdx < 0) return;
    isRestoringRef.current = true;
    const state = historyRef.current[newIdx];
    setNodes(state.nodes);
    setEdges(state.edges);
    setHistoryIdx(newIdx);
    setSelection(null);
    requestAnimationFrame(() => { isRestoringRef.current = false; });
  }, [historyIdx, setNodes, setEdges]);

  const redo = useCallback(() => {
    const newIdx = historyIdx + 1;
    if (newIdx >= historyRef.current.length) return;
    isRestoringRef.current = true;
    const state = historyRef.current[newIdx];
    setNodes(state.nodes);
    setEdges(state.edges);
    setHistoryIdx(newIdx);
    setSelection(null);
    requestAnimationFrame(() => { isRestoringRef.current = false; });
  }, [historyIdx, setNodes, setEdges]);

  // ── Load workflow from API ────────────────────────────────────────────────

  const loadWorkflow = useCallback(async (id: string) => {
    try {
      const wf = await api.workflows.get(id);
      const rawNodes = (wf.graph.nodes as Node[]).map((n) => ({
        ...n,
        deletable: n.id === "trigger-1" ? false : n.deletable,
      }));
      const rawEdges = (wf.graph.edges as Edge[]).map((e) => ({ ...e, type: "floating" }));

      isRestoringRef.current = true;
      setWorkflowId(wf.id);
      setWorkflowName(wf.name);
      setNodes(rawNodes);
      setEdges(rawEdges);
      setSelection(null);
      setIsDirty(false);
      setLastSaved(new Date(wf.updated_at));
      historyRef.current = [{ nodes: rawNodes, edges: rawEdges }];
      setHistoryIdx(0);
      requestAnimationFrame(() => { isRestoringRef.current = false; });
    } catch (err) {
      console.error("Failed to load workflow", err);
    }
  }, [setNodes, setEdges]);

  // ── ?id= param on mount ───────────────────────────────────────────────────
  const initDone = useRef(false);
  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;
    const id = searchParams.get("id");
    if (id) loadWorkflow(id);
  }, [searchParams, loadWorkflow]);

  // ── Auto-save (debounced 5s when workflowId exists and dirty) ─────────────
  const workflowIdRef = useRef(workflowId);
  const workflowNameRef = useRef(workflowName);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  workflowIdRef.current  = workflowId;
  workflowNameRef.current = workflowName;
  nodesRef.current  = nodes;
  edgesRef.current  = edges;

  useEffect(() => {
    if (!isDirty || !workflowId) return;
    const timer = setTimeout(async () => {
      if (!workflowIdRef.current) return;
      try {
        setIsSaving(true);
        await api.workflows.update(workflowIdRef.current, {
          name: workflowNameRef.current,
          graph: { nodes: nodesRef.current, edges: edgesRef.current },
        });
        setIsDirty(false);
        setLastSaved(new Date());
        swrMutate("workflow-list");
      } catch { /* silent auto-save fail */ } finally {
        setIsSaving(false);
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, [isDirty, workflowId]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  const undoRef   = useRef(undo);
  const redoRef   = useRef(redo);
  undoRef.current = undo;
  redoRef.current = redo;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement;
      if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLSelectElement ||
        (active as HTMLElement)?.isContentEditable
      ) return;

      const meta = e.ctrlKey || e.metaKey;

      if (meta && !e.shiftKey && e.key.toLowerCase() === "z") { e.preventDefault(); undoRef.current(); return; }
      if (meta && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) { e.preventDefault(); redoRef.current(); return; }
      if (meta && e.key.toLowerCase() === "s") { e.preventDefault(); document.dispatchEvent(new CustomEvent("bpmn:save")); return; }
      if (meta && e.key.toLowerCase() === "e") { e.preventDefault(); document.dispatchEvent(new CustomEvent("bpmn:export")); return; }
      if (meta && e.key.toLowerCase() === "c") { document.dispatchEvent(new CustomEvent("bpmn:copy")); return; }
      if (meta && e.key.toLowerCase() === "v") { document.dispatchEvent(new CustomEvent("bpmn:paste")); return; }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      const graph = { nodes: nodesRef.current, edges: edgesRef.current };
      let id = workflowIdRef.current;
      if (!id) {
        const created = await api.workflows.create({ name: workflowNameRef.current, graph });
        id = created.id;
        setWorkflowId(id);
        router.replace(`/workflow?id=${id}`);
      } else {
        await api.workflows.update(id, { name: workflowNameRef.current, graph });
      }
      setIsDirty(false);
      setLastSaved(new Date());
      swrMutate("workflow-list");
    } catch (err) {
      console.error("Save failed", err);
    } finally {
      setIsSaving(false);
    }
  }, [router]);

  // ── Save version ──────────────────────────────────────────────────────────

  const handleSaveVersion = useCallback(async (note: string) => {
    setShowVersionDialog(false);
    const id = workflowIdRef.current;
    if (!id) { await handleSave(); return; }
    try {
      await api.workflows.saveVersion(id, note || undefined);
      swrMutate("workflow-list");
    } catch (err) {
      console.error("Save version failed", err);
    }
  }, [handleSave]);

  // ── Export BPMN XML ───────────────────────────────────────────────────────

  const handleExport = useCallback(() => {
    const xml = exportToBpmnXml(workflowNameRef.current, nodesRef.current, edgesRef.current);
    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${workflowNameRef.current.replace(/\s+/g, "-").toLowerCase()}.bpmn`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // ── Import BPMN XML ───────────────────────────────────────────────────────

  const importInputRef = useRef<HTMLInputElement>(null);

  const handleImportFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const xml = ev.target?.result as string;
        const { nodes: importedNodes, edges: importedEdges } = importFromBpmnXml(xml);
        const safeName = file.name.replace(/\.bpmn$/, "").replace(/-/g, " ");
        isRestoringRef.current = true;
        setWorkflowId(null);
        setWorkflowName(safeName || "Imported Workflow");
        setNodes(importedNodes);
        setEdges(importedEdges.map((e) => ({ ...e, type: "floating", ...EDGE_DEFAULTS })));
        setSelection(null);
        setIsDirty(true);
        historyRef.current = [{ nodes: importedNodes, edges: importedEdges }];
        setHistoryIdx(0);
        requestAnimationFrame(() => { isRestoringRef.current = false; });
      } catch (err) {
        console.error("BPMN import failed", err);
        alert("Could not parse BPMN file. Make sure it is a valid BPMN 2.0 XML.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }, [setNodes, setEdges]);

  // ── Wire keyboard events ──────────────────────────────────────────────────

  useEffect(() => {
    const onSave   = () => handleSave();
    const onExport = () => handleExport();
    const onCopy = () => {
      const selected = nodesRef.current.filter((n) => n.selected);
      const selectedIds = new Set(selected.map((n) => n.id));
      const selectedEdges = edgesRef.current.filter(
        (e) => selectedIds.has(e.source) && selectedIds.has(e.target),
      );
      clipboardRef.current = { nodes: selected, edges: selectedEdges };
    };
    const onPaste = () => {
      const cb = clipboardRef.current;
      if (!cb || cb.nodes.length === 0) return;
      const idMap = new Map<string, string>();
      const pasted: Node[] = cb.nodes.map((n) => {
        const newId = `paste-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        idMap.set(n.id, newId);
        return { ...n, id: newId, position: { x: n.position.x + 40, y: n.position.y + 40 }, selected: true, deletable: true };
      });
      const pastedEdges: Edge[] = cb.edges.map((e) => ({
        ...e,
        id: `paste-edge-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        source: idMap.get(e.source) ?? e.source,
        target: idMap.get(e.target) ?? e.target,
      }));
      setNodes((nds) => {
        const next = [...nds.map((n) => ({ ...n, selected: false })), ...pasted];
        setTimeout(() => pushHistory(next, [...edgesRef.current, ...pastedEdges]), 0);
        return next;
      });
      setEdges((eds) => [...eds, ...pastedEdges]);
    };
    document.addEventListener("bpmn:save",   onSave);
    document.addEventListener("bpmn:export", onExport);
    document.addEventListener("bpmn:copy",   onCopy);
    document.addEventListener("bpmn:paste",  onPaste);
    return () => {
      document.removeEventListener("bpmn:save",   onSave);
      document.removeEventListener("bpmn:export", onExport);
      document.removeEventListener("bpmn:copy",   onCopy);
      document.removeEventListener("bpmn:paste",  onPaste);
    };
  }, [handleSave, handleExport, pushHistory, setNodes, setEdges]);

  // ── New workflow ──────────────────────────────────────────────────────────

  const handleNewWorkflow = useCallback(() => {
    isRestoringRef.current = true;
    setWorkflowId(null);
    setWorkflowName("Untitled Workflow");
    setNodes([INITIAL_TRIGGER]);
    setEdges([]);
    setSelection(null);
    setIsDirty(false);
    setLastSaved(null);
    historyRef.current = [{ nodes: [INITIAL_TRIGGER], edges: [] }];
    setHistoryIdx(0);
    router.replace("/workflow");
    requestAnimationFrame(() => { isRestoringRef.current = false; });
  }, [setNodes, setEdges, router]);

  const handleLoadWorkflow = useCallback((id: string) => {
    loadWorkflow(id);
    router.replace(`/workflow?id=${id}`);
  }, [loadWorkflow, router]);

  const handleDeleteWorkflow = useCallback(async (id: string) => {
    try {
      await api.workflows.delete(id);
      if (workflowIdRef.current === id) handleNewWorkflow();
      swrMutate("workflow-list");
    } catch (err) {
      console.error("Delete failed", err);
    }
  }, [handleNewWorkflow]);

  // ── Execution ─────────────────────────────────────────────────────────────

  const handleRun = useCallback(async (inputMessage: string, simulate: boolean) => {
    setShowRunDialog(false);
    setExecEvents([]);
    setExecNodeStates(new Map());
    setIsRunning(true);
    setIsSimulation(simulate);
    setShowExecPanel(true);

    const graph = { nodes: nodesRef.current, edges: edgesRef.current };

    await api.workflowRuns.stream(
      {
        ...(workflowIdRef.current ? { workflow_id: workflowIdRef.current } : { graph }),
        input_message: inputMessage,
        simulate,
      },
      (ev) => {
        const execEv = ev as ExecEvent;
        setExecEvents((prev) => [...prev, execEv]);

        if (execEv.type === "node_enter" && execEv.node_id) {
          setExecNodeStates((prev) => {
            const next = new Map(prev);
            next.set(execEv.node_id!, "active");
            return next;
          });
        }
        if (execEv.type === "node_exit" && execEv.node_id) {
          setExecNodeStates((prev) => {
            const next = new Map(prev);
            next.set(execEv.node_id!, "done");
            return next;
          });
        }
        if (execEv.type === "run_error") {
          setIsRunning(false);
        }
        if (execEv.type === "run_done") {
          setIsRunning(false);
        }
      },
      () => setIsRunning(false),
      (err) => {
        setExecEvents((prev) => [...prev, { type: "run_error", error: err }]);
        setIsRunning(false);
      },
    );
  }, []);

  // ── ?new=true param ───────────────────────────────────────────────────────
  const newParamHandled = useRef(false);
  useEffect(() => {
    if (newParamHandled.current || searchParams.get("new") !== "true") return;
    newParamHandled.current = true;
    handleNewWorkflow();
  }, [searchParams, handleNewWorkflow]);

  // ── Validation ────────────────────────────────────────────────────────────

  const validate = useCallback((): ValidationError[] => {
    const errs: ValidationError[] = [];

    const endNodes = nodes.filter((n) => n.type === "endEvent");
    if (endNodes.length === 0) {
      errs.push({ level: "warning", message: "Process has no End Event — add one to mark completion." });
    }

    const gateways = nodes.filter((n) => n.type === "gateway");
    gateways.forEach((gw) => {
      const out = edges.filter((e) => e.source === gw.id).length;
      const inn = edges.filter((e) => e.target === gw.id).length;
      const label = (gw.data as GatewayData).label || "Gateway";
      if (out < 2 && (gw.data as GatewayData).gatewayType !== "inclusive") {
        errs.push({ level: "error", message: `"${label}" needs at least 2 outgoing flows.`, nodeId: gw.id });
      }
      if (inn === 0) {
        errs.push({ level: "warning", message: `"${label}" has no incoming flow.`, nodeId: gw.id });
      }
    });

    nodes.forEach((n) => {
      if (n.id === "trigger-1" || n.type === "annotation") return;
      const connected = edges.some((e) => e.source === n.id || e.target === n.id);
      if (!connected) {
        const lbl = (n.data as Record<string, string>).label || (n.data as Record<string, string>).agentName || n.type || "Node";
        errs.push({ level: "warning", message: `"${lbl}" is not connected to anything.`, nodeId: n.id });
      }
    });

    setValidationErrors(errs);
    return errs;
  }, [nodes, edges]);

  // ── Auto-layout (dagre) ───────────────────────────────────────────────────

  const autoLayout = useCallback(() => {
    setNodes((nds) => applyDagreLayout(nds, edges, "LR"));
  }, [edges, setNodes]);

  // ── Drag-and-drop ─────────────────────────────────────────────────────────

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
        const info = JSON.parse(raw) as Record<string, string>;
        const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
        const id = `bpmn-${Date.now()}`;

        let newNode: Node;
        if (info.kind === "agent") {
          newNode = {
            id: `step-${Date.now()}`,
            type: "workflowStep",
            position,
            data: {
              agentId:          info.agentId,
              agentName:        info.agentName,
              agentDescription: info.agentDescription ?? null,
              swarmName:        info.swarmName,
              swarmId:          info.swarmId,
              colorIndex:       Number(info.colorIndex ?? 0),
              inputType:        "any",
            } as WorkflowStepData,
          };
        } else {
          newNode = createBpmnNode(id, info, position);
        }

        setNodes((nds) => {
          const next = [...nds, newNode];
          setTimeout(() => pushHistory(next, edges), 0);
          return next;
        });
      } catch { /* ignore malformed payload */ }
    },
    [screenToFlowPosition, setNodes, edges, pushHistory],
  );

  // ── Edge creation ─────────────────────────────────────────────────────────

  const onConnect = useCallback(
    (params: Connection) => {
      const newEdge = { ...params, ...EDGE_DEFAULTS };
      setEdges((eds) => {
        const next = addEdge(newEdge, eds);
        setTimeout(() => pushHistory(nodes, next), 0);
        return next;
      });
    },
    [setEdges, nodes, pushHistory],
  );

  // ── Selection ─────────────────────────────────────────────────────────────

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelection({ id: node.id, kind: "node" });
  }, []);

  const handleEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    setSelection({ id: edge.id, kind: "edge" });
  }, []);

  const handlePaneClick = useCallback(() => {
    setSelection(null);
    setShowValidation(false);
  }, []);

  // ── Node / edge updates ───────────────────────────────────────────────────

  const handleUpdateNode = useCallback(
    (data: Partial<Record<string, unknown>>) => {
      if (!selection || selection.kind !== "node") return;
      setNodes((nds) => {
        const next = nds.map((n) =>
          n.id === selection.id ? { ...n, data: { ...n.data, ...data } } : n,
        );
        setTimeout(() => pushHistory(next, edges), 0);
        return next;
      });
    },
    [selection, setNodes, edges, pushHistory],
  );

  const handleUpdateEdge = useCallback(
    (data: Partial<EdgeData>) => {
      if (!selection || selection.kind !== "edge") return;
      setEdges((eds) => {
        const next = eds.map((e) =>
          e.id === selection.id
            ? { ...e, data: { ...(e.data ?? {}), ...data } as EdgeData, label: data.label !== undefined ? data.label : e.label }
            : e,
        );
        setTimeout(() => pushHistory(nodes, next), 0);
        return next;
      });
    },
    [selection, setEdges, nodes, pushHistory],
  );

  // ── Deletion ──────────────────────────────────────────────────────────────

  const handleDeleteSelected = useCallback(() => {
    if (!selection) return;

    if (selection.kind === "node") {
      if (selection.id === "trigger-1") return;
      setNodes((nds) => {
        const next = nds.filter((n) => n.id !== selection.id);
        setEdges((eds) => {
          const nextEdges = eds.filter((e) => e.source !== selection.id && e.target !== selection.id);
          setTimeout(() => pushHistory(next, nextEdges), 0);
          return nextEdges;
        });
        return next;
      });
    } else {
      setEdges((eds) => {
        const next = eds.filter((e) => e.id !== selection.id);
        setTimeout(() => pushHistory(nodes, next), 0);
        return next;
      });
    }
    setSelection(null);
  }, [selection, setNodes, setEdges, nodes, pushHistory]);

  const onNodesDelete = useCallback((deleted: Node[]) => {
    if (isRestoringRef.current) return;
    const deletedIds = new Set(deleted.map((n) => n.id));
    setNodes((nds) => {
      const next = nds.filter((n) => !deletedIds.has(n.id));
      setEdges((eds) => {
        const nextEdges = eds.filter((e) => !deletedIds.has(e.source) && !deletedIds.has(e.target));
        setTimeout(() => pushHistory(next, nextEdges), 0);
        return nextEdges;
      });
      return next;
    });
    setSelection((s) => s && deletedIds.has(s.id) ? null : s);
  }, [setNodes, setEdges, pushHistory]);

  const onEdgesDelete = useCallback((deleted: Edge[]) => {
    if (isRestoringRef.current) return;
    const deletedIds = new Set(deleted.map((e) => e.id));
    setEdges((eds) => {
      const next = eds.filter((e) => !deletedIds.has(e.id));
      setTimeout(() => pushHistory(nodes, next), 0);
      return next;
    });
    setSelection((s) => s && deletedIds.has(s.id) ? null : s);
  }, [setEdges, nodes, pushHistory]);

  const onNodeDragStop = useCallback(
    (_: React.MouseEvent, _node: Node, allNodes: Node[]) => {
      if (!isRestoringRef.current) pushHistory(allNodes, edges);
    },
    [edges, pushHistory],
  );

  // ── Derived ───────────────────────────────────────────────────────────────

  const selectedNode = selection?.kind === "node" ? nodes.find((n) => n.id === selection.id) ?? null : null;
  const selectedEdge = selection?.kind === "edge" ? edges.find((e) => e.id === selection.id) ?? null : null;

  // Nodes with execution highlight overlaid (not pushed to history)
  const displayNodes = execNodeStates.size > 0
    ? nodes.map((n) => {
        const execState = execNodeStates.get(n.id);
        if (!execState) return n;
        return {
          ...n,
          className: cn(
            n.className,
            execState === "active" && "node-exec-active",
            execState === "done"   && "node-exec-done",
            execState === "error"  && "node-exec-error",
          ),
        };
      })
    : nodes;

  // Label map for execution panel
  const nodeLabelMap = new Map(
    nodes.map((n) => [
      n.id,
      (n.data as Record<string, unknown>).label as string
        || (n.data as Record<string, unknown>).agentName as string
        || (n.data as Record<string, unknown>).text as string
        || n.type || n.id,
    ]),
  );

  const errorCount   = validationErrors.filter((e) => e.level === "error").length;
  const warningCount = validationErrors.filter((e) => e.level === "warning").length;

  const lastSavedLabel = (() => {
    if (isSaving) return null;
    if (!lastSaved) return isDirty ? "Unsaved changes" : null;
    const diff = Math.round((Date.now() - lastSaved.getTime()) / 1000);
    if (diff < 60) return "Saved just now";
    if (diff < 3600) return `Saved ${Math.round(diff / 60)}m ago`;
    return `Saved ${Math.round(diff / 3600)}h ago`;
  })();

  // ── SWR for workflow list ─────────────────────────────────────────────────
  const { currentOrg: wfOrg } = useAuth();
  const { data: workflowList = [] } = useSWR(wfOrg ? "workflow-list" : null, () => api.workflows.list());

  return (
    <div className="flex flex-1 min-w-0 overflow-hidden">
      {/* Hidden file input for BPMN import */}
      <input
        ref={importInputRef}
        type="file"
        accept=".bpmn,.xml"
        className="hidden"
        onChange={handleImportFile}
      />

      {/* Save Version dialog */}
      {showVersionDialog && (
        <SaveVersionDialog
          onConfirm={handleSaveVersion}
          onCancel={() => setShowVersionDialog(false)}
        />
      )}

      {/* Run input dialog */}
      {showRunDialog && (
        <RunInputDialog
          onRun={handleRun}
          onClose={() => setShowRunDialog(false)}
        />
      )}

      {/* ── Left panel ─────────────────────────────────────────────────────── */}
      <AgentLibraryPanel
        agents={agents}
        businessUnits={businessUnits}
        workflows={workflowList}
        currentWorkflowId={workflowId}
        onLoadWorkflow={handleLoadWorkflow}
        onDeleteWorkflow={handleDeleteWorkflow}
      />

      {/* ── Canvas + toolbar ───────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0">

        {/* Toolbar */}
        <div className="flex items-center gap-1 px-3 py-2 border-b border-border bg-surface-0/80 backdrop-blur-sm shrink-0">

          {/* History */}
          <TBtn onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
            <Undo2 className="w-4 h-4" />
          </TBtn>
          <TBtn onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)">
            <Redo2 className="w-4 h-4" />
          </TBtn>

          <TSep />

          {/* Delete selected */}
          <TBtn
            onClick={handleDeleteSelected}
            disabled={!selection || (selection.kind === "node" && selection.id === "trigger-1")}
            title="Delete selected (Delete)"
            className="hover:text-rose disabled:hover:text-text-3/50"
          >
            <Trash2 className="w-4 h-4" />
          </TBtn>

          <TSep />

          {/* Workflow name */}
          <div className="flex-1 min-w-0 mx-1">
            {editingName ? (
              <input
                autoFocus
                value={workflowName}
                onChange={(e) => setWorkflowName(e.target.value)}
                onBlur={() => setEditingName(false)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === "Escape") setEditingName(false);
                }}
                className="w-full bg-transparent text-sm font-semibold text-text-1 outline-none border-b border-violet min-w-0"
              />
            ) : (
              <div className="flex items-center gap-2 min-w-0">
                <button
                  onClick={() => setEditingName(true)}
                  title="Click to rename"
                  className="text-sm font-semibold text-text-1 hover:text-violet transition-colors truncate"
                >
                  {workflowName}
                </button>
                {isSaving ? (
                  <Loader2 className="w-3 h-3 text-text-3 animate-spin shrink-0" />
                ) : isDirty ? (
                  <span className="text-[10px] text-amber/70 shrink-0">Unsaved</span>
                ) : lastSavedLabel ? (
                  <span className="text-[10px] text-text-3 shrink-0">{lastSavedLabel}</span>
                ) : null}
              </div>
            )}
          </div>

          <TSep />

          {/* Layout */}
          <TBtn onClick={autoLayout} title="Auto Layout (arrange nodes)">
            <LayoutDashboard className="w-4 h-4" />
            <span>Layout</span>
          </TBtn>

          {/* Validate */}
          <div className="relative">
            <TBtn
              onClick={() => { validate(); setShowValidation((v) => !v); }}
              title="Validate process"
              className={cn(
                errorCount > 0   ? "text-rose"  :
                warningCount > 0 ? "text-amber" : "",
              )}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Validate</span>
              {(errorCount > 0 || warningCount > 0) && (
                <span
                  className={cn(
                    "text-[10px] px-1 rounded-full font-bold",
                    errorCount > 0 ? "bg-rose/20 text-rose" : "bg-amber/20 text-amber",
                  )}
                >
                  {errorCount > 0 ? errorCount : warningCount}
                </span>
              )}
            </TBtn>
            {showValidation && (
              <ValidationPopup errors={validationErrors} onClose={() => setShowValidation(false)} />
            )}
          </div>

          {/* Export BPMN XML */}
          <TBtn onClick={handleExport} title="Export BPMN 2.0 XML (Ctrl+E)">
            <Download className="w-4 h-4" />
          </TBtn>

          {/* Import BPMN XML */}
          <TBtn onClick={() => importInputRef.current?.click()} title="Import BPMN 2.0 XML">
            <Upload className="w-4 h-4" />
          </TBtn>

          <TSep />

          {/* New */}
          <TBtn onClick={handleNewWorkflow} title="New workflow">
            <FilePlus className="w-4 h-4" />
          </TBtn>

          {/* Save Version */}
          {workflowId && (
            <TBtn
              onClick={() => setShowVersionDialog(true)}
              title="Save a named version snapshot"
            >
              <GitBranch className="w-4 h-4" />
            </TBtn>
          )}

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={isSaving}
            title="Save workflow (Ctrl+S)"
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors",
              isDirty
                ? "text-violet border border-violet/50 hover:bg-violet/10"
                : "text-violet/60 border border-violet/20 hover:bg-violet/5",
              isSaving && "cursor-not-allowed opacity-60",
            )}
          >
            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save
          </button>

          <button
            onClick={() => setShowRunDialog(true)}
            disabled={isRunning}
            title="Run or simulate this workflow"
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors",
              isRunning
                ? "bg-violet/20 text-violet/50 cursor-not-allowed"
                : "bg-violet text-white hover:bg-violet/90",
            )}
          >
            {isRunning
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Zap className="w-3.5 h-3.5" />
            }
            {isRunning ? "Running…" : "Run"}
          </button>
        </div>

        {/* Canvas */}
        <div className="workflow-canvas flex-1 h-full relative">
          <ReactFlow
            nodes={displayNodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onNodeClick={handleNodeClick}
            onEdgeClick={handleEdgeClick}
            onPaneClick={handlePaneClick}
            onNodeDragStop={onNodeDragStop}
            onNodesDelete={onNodesDelete}
            onEdgesDelete={onEdgesDelete}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            connectionMode={ConnectionMode.Loose}
            connectionLineComponent={FloatingConnectionLine}
            deleteKeyCode={["Backspace", "Delete"]}
            fitView
            fitViewOptions={{ padding: 0.35 }}
            minZoom={0.1}
            maxZoom={3}
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
              nodeColor={(n) => {
                if (n.type === "triggerNode")       return "rgba(52,211,153,0.45)";
                if (n.type === "endEvent")          return "rgba(244,63,94,0.45)";
                if (n.type === "gateway")           return "rgba(245,158,11,0.45)";
                if (n.type === "taskNode")          return "rgba(14,165,233,0.45)";
                if (n.type === "intermediateEvent") return "rgba(245,158,11,0.35)";
                if (n.type === "annotation")        return "rgba(255,255,255,0.10)";
                return "rgba(139,92,246,0.40)";
              }}
              maskColor="rgba(6,6,11,0.88)"
            />
          </ReactFlow>
        </div>
      </div>

      {/* ── Properties panel ───────────────────────────────────────────────── */}
      {(selectedNode || selectedEdge) && !showExecPanel && (
        <NodePropertiesPanel
          node={selectedNode}
          edge={selectedEdge}
          edges={edges}
          onUpdateNode={handleUpdateNode}
          onUpdateEdge={handleUpdateEdge}
          onRemoveNode={handleDeleteSelected}
          onRemoveEdge={handleDeleteSelected}
          onClose={() => setSelection(null)}
        />
      )}

      {/* ── Execution trace panel ──────────────────────────────────────────── */}
      {showExecPanel && (
        <ExecutionPanel
          events={execEvents}
          isRunning={isRunning}
          isSimulation={isSimulation}
          nodeLabels={nodeLabelMap}
          onClose={() => {
            setShowExecPanel(false);
            setExecNodeStates(new Map());
          }}
        />
      )}
    </div>
  );
}

// ── Page wrapper ──────────────────────────────────────────────────────────────

export default function WorkflowPage() {
  const { currentOrg } = useAuth();
  const orgKey = currentOrg?.id ?? null;
  const { data: agentsRaw = [] } = useSWR(orgKey ? ["workflow-agents", orgKey] : null, () => api.agents.list());
  const { data: busRaw = [] }    = useSWR(orgKey ? ["workflow-bus", orgKey]    : null, () => api.businessUnits.list());

  return (
    <div className="flex h-screen bg-surface-0 overflow-hidden">
      <Sidebar />
      <ReactFlowProvider>
        <Suspense fallback={null}>
          <WorkflowPageInner agents={agentsRaw as Agent[]} businessUnits={busRaw as BusinessUnit[]} />
        </Suspense>
      </ReactFlowProvider>
    </div>
  );
}
