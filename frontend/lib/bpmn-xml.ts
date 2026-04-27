import type { Node, Edge } from "@xyflow/react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface BpmnGraph {
  nodes: Node[];
  edges: Edge[];
}

// ── Export ────────────────────────────────────────────────────────────────────

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function nodeToElement(node: Node): string {
  const id = node.id;
  const data = (node.data ?? {}) as Record<string, unknown>;
  const label = escapeXml(String(data.label ?? data.text ?? ""));

  switch (node.type) {
    case "triggerNode":
      return `    <bpmn:startEvent id="${id}" name="${label}" />`;

    case "endEvent": {
      const sub = String(data.subtype ?? "none");
      if (sub === "terminate")
        return `    <bpmn:endEvent id="${id}" name="${label}"><bpmn:terminateEventDefinition /></bpmn:endEvent>`;
      if (sub === "error")
        return `    <bpmn:endEvent id="${id}" name="${label}"><bpmn:errorEventDefinition /></bpmn:endEvent>`;
      if (sub === "message")
        return `    <bpmn:endEvent id="${id}" name="${label}"><bpmn:messageEventDefinition /></bpmn:endEvent>`;
      return `    <bpmn:endEvent id="${id}" name="${label}" />`;
    }

    case "intermediateEvent": {
      const evType = String(data.eventType ?? "timer");
      const mode = String(data.mode ?? "catching");
      const defTag =
        evType === "timer" ? "bpmn:timerEventDefinition" :
        evType === "message" ? "bpmn:messageEventDefinition" :
        evType === "signal" ? "bpmn:signalEventDefinition" :
        "bpmn:errorEventDefinition";
      if (mode === "throwing")
        return `    <bpmn:intermediateThrowEvent id="${id}" name="${label}"><${defTag} /></bpmn:intermediateThrowEvent>`;
      return `    <bpmn:intermediateCatchEvent id="${id}" name="${label}"><${defTag} /></bpmn:intermediateCatchEvent>`;
    }

    case "gateway": {
      const gt = String(data.gatewayType ?? "exclusive");
      if (gt === "parallel")
        return `    <bpmn:parallelGateway id="${id}" name="${label}" />`;
      if (gt === "inclusive")
        return `    <bpmn:inclusiveGateway id="${id}" name="${label}" />`;
      return `    <bpmn:exclusiveGateway id="${id}" name="${label}" />`;
    }

    case "taskNode":
    case "workflowStep": {
      const sub = String(data.subtype ?? "task");
      if (sub === "userTask")
        return `    <bpmn:userTask id="${id}" name="${label}" />`;
      if (sub === "serviceTask")
        return `    <bpmn:serviceTask id="${id}" name="${label}" />`;
      if (sub === "scriptTask")
        return `    <bpmn:scriptTask id="${id}" name="${label}" />`;
      if (sub === "sendTask")
        return `    <bpmn:sendTask id="${id}" name="${label}" />`;
      if (sub === "receiveTask")
        return `    <bpmn:receiveTask id="${id}" name="${label}" />`;
      return `    <bpmn:task id="${id}" name="${label}" />`;
    }

    case "annotation":
      return `    <bpmn:textAnnotation id="${id}"><bpmn:text>${label}</bpmn:text></bpmn:textAnnotation>`;

    default:
      return `    <bpmn:task id="${id}" name="${label}" />`;
  }
}

function edgeToSequenceFlow(edge: Edge): string {
  const data = (edge.data ?? {}) as Record<string, unknown>;
  const label = data.label ? ` name="${escapeXml(String(data.label))}"` : "";
  return `    <bpmn:sequenceFlow id="${edge.id}"${label} sourceRef="${edge.source}" targetRef="${edge.target}" />`;
}

function nodeToDiShape(node: Node): string {
  const x = node.position.x;
  const y = node.position.y;
  const w = (node.style?.width as number | undefined) ?? (node.measured?.width as number | undefined) ?? 160;
  const h = (node.style?.height as number | undefined) ?? (node.measured?.height as number | undefined) ?? 60;
  return `      <bpmndi:BPMNShape id="${node.id}_di" bpmnElement="${node.id}">
        <dc:Bounds x="${Math.round(x)}" y="${Math.round(y)}" width="${Math.round(Number(w))}" height="${Math.round(Number(h))}" />
      </bpmndi:BPMNShape>`;
}

function edgeToDiEdge(edge: Edge): string {
  return `      <bpmndi:BPMNEdge id="${edge.id}_di" bpmnElement="${edge.id}" />`;
}

export function exportToBpmnXml(name: string, nodes: Node[], edges: Edge[]): string {
  const processId = "Process_1";
  const elements = nodes.map(nodeToElement).join("\n");
  const flows = edges.map(edgeToSequenceFlow).join("\n");
  const shapes = nodes.map(nodeToDiShape).join("\n");
  const diEdges = edges.map(edgeToDiEdge).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  targetNamespace="http://lanara.ai/bpmn"
  id="Definitions_1">
  <bpmn:process id="${processId}" name="${escapeXml(name)}" isExecutable="false">
${elements}
${flows}
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="${processId}">
${shapes}
${diEdges}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}

// ── Import ────────────────────────────────────────────────────────────────────

function attr(el: Element, name: string): string {
  return el.getAttribute(name) ?? "";
}

function parseBounds(shape: Element): { x: number; y: number; width: number; height: number } | null {
  const bounds = shape.querySelector("Bounds") ?? shape.getElementsByTagNameNS("*", "Bounds")[0];
  if (!bounds) return null;
  return {
    x: parseFloat(bounds.getAttribute("x") ?? "0"),
    y: parseFloat(bounds.getAttribute("y") ?? "0"),
    width: parseFloat(bounds.getAttribute("width") ?? "160"),
    height: parseFloat(bounds.getAttribute("height") ?? "60"),
  };
}

function localName(el: Element): string {
  return el.localName ?? el.tagName.replace(/^.*:/, "");
}

export function importFromBpmnXml(xml: string): BpmnGraph {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "application/xml");

  const parseError = doc.querySelector("parseerror");
  if (parseError) throw new Error("Invalid BPMN XML");

  // Build a map of element id → bounds from BPMNDiagram section
  const boundsMap = new Map<string, { x: number; y: number; w: number; h: number }>();
  const shapes = Array.from(doc.getElementsByTagNameNS("*", "BPMNShape"));
  for (const shape of shapes) {
    const elemId = attr(shape, "bpmnElement");
    const b = parseBounds(shape);
    if (elemId && b) boundsMap.set(elemId, { x: b.x, y: b.y, w: b.width, h: b.height });
  }

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Parse process children
  const processes = Array.from(doc.getElementsByTagNameNS("*", "process"));
  for (const process of processes) {
    for (const child of Array.from(process.children)) {
      const tag = localName(child);
      const id = attr(child, "id") || crypto.randomUUID();
      const name = attr(child, "name");
      const b = boundsMap.get(id) ?? { x: Math.random() * 400, y: Math.random() * 300, w: 160, h: 60 };

      // Sequence flows become edges
      if (tag === "sequenceFlow") {
        const edgeData = name ? { label: name } : {};
        edges.push({
          id,
          source: attr(child, "sourceRef"),
          target: attr(child, "targetRef"),
          type: "floating",
          data: edgeData,
        });
        continue;
      }

      // Map BPMN element to node type
      let nodeType = "taskNode";
      let data: Record<string, unknown> = { label: name };

      if (tag === "startEvent") {
        nodeType = "triggerNode";
        data = { label: name || "Start" };
      } else if (tag === "endEvent") {
        nodeType = "endEvent";
        const defs = Array.from(child.children).map((c) => localName(c));
        const subtype =
          defs.includes("terminateEventDefinition") ? "terminate" :
          defs.includes("errorEventDefinition") ? "error" :
          defs.includes("messageEventDefinition") ? "message" : "none";
        data = { label: name, subtype };
      } else if (tag === "intermediateCatchEvent" || tag === "intermediateThrowEvent") {
        nodeType = "intermediateEvent";
        const defs = Array.from(child.children).map((c) => localName(c));
        const eventType =
          defs.includes("timerEventDefinition") ? "timer" :
          defs.includes("messageEventDefinition") ? "message" :
          defs.includes("signalEventDefinition") ? "signal" :
          defs.includes("errorEventDefinition") ? "error" : "timer";
        const mode = tag === "intermediateThrowEvent" ? "throwing" : "catching";
        data = { label: name, eventType, mode };
      } else if (tag === "exclusiveGateway" || tag === "parallelGateway" || tag === "inclusiveGateway") {
        nodeType = "gateway";
        const gatewayType =
          tag === "parallelGateway" ? "parallel" :
          tag === "inclusiveGateway" ? "inclusive" : "exclusive";
        data = { label: name, gatewayType };
      } else if (tag === "userTask") {
        data = { label: name, subtype: "userTask" };
      } else if (tag === "serviceTask") {
        data = { label: name, subtype: "serviceTask" };
      } else if (tag === "scriptTask") {
        data = { label: name, subtype: "scriptTask" };
      } else if (tag === "sendTask") {
        data = { label: name, subtype: "sendTask" };
      } else if (tag === "receiveTask") {
        data = { label: name, subtype: "receiveTask" };
      } else if (tag === "textAnnotation") {
        nodeType = "annotation";
        const textEl = child.querySelector("text") ?? child.getElementsByTagNameNS("*", "text")[0];
        data = { text: textEl?.textContent ?? name };
      } else if (tag === "task") {
        data = { label: name, subtype: "task" };
      } else {
        // Skip unknown elements (dataObject, association, etc.)
        continue;
      }

      nodes.push({
        id,
        type: nodeType,
        position: { x: b.x, y: b.y },
        style: { width: b.w, height: b.h },
        data,
      });
    }
  }

  return { nodes, edges };
}
