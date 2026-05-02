export type AgentEventType =
  | "start"
  | "message"
  | "tool_call"
  | "tool_response"
  | "llm_chunk"
  | "node_enter"
  | "node_exit"
  | "approval_request"
  | "approval_decision"
  | "state_snapshot"
  | "complete"
  | "error";

export interface AgentEvent {
  event: AgentEventType;
  run_id: string;
  node?: string;
  /** HumanMessage / AIMessage / ToolMessage */
  type?: string;
  content?: string;
  tool_name?: string;
  tool_args?: Record<string, unknown>;
  tool_result?: string;
  latency_ms?: number;
  cost_usd?: number;
  tokens_used?: number;
  approval_id?: string;
  message?: string;
  output?: Record<string, unknown>;
  error?: string;
  state?: Record<string, unknown>;
}
