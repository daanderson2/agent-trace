export type Usage = {
  inputTokens?: number;
  outputTokens?: number;
};

export type UserEvent = {
  type: 'user';
  ts?: number;
  text?: string;
};

export type AssistantEvent = {
  type: 'assistant';
  ts?: number;
  text?: string;
  usage?: Usage;
};

export type ToolCallEvent = {
  type: 'tool_call';
  ts?: number;
  id?: string;
  name?: string;
  args?: unknown;
};

export type ToolResultEvent = {
  type: 'tool_result';
  ts?: number;
  id?: string;
  ok?: boolean;
  durationMs?: number;
  output?: unknown;
};

export type TraceEvent = UserEvent | AssistantEvent | ToolCallEvent | ToolResultEvent;

export type ParseIssue = {
  line: number;
  message: string;
  raw: string;
};

export type LineResult =
  | { ok: true; event: TraceEvent }
  | { ok: false; issue: ParseIssue };

export type ToolSpan = {
  id?: string;
  name?: string;
  args?: unknown;
  callTs?: number;
  ok?: boolean;
  output?: unknown;
  durationMs?: number;
  pending: boolean;
};

export type PairResult = {
  spans: ToolSpan[];
  orphans: ToolResultEvent[];
};

export type ToolStat = {
  name: string;
  calls: number;
  failures: number;
  totalMs: number;
  avgMs: number;
  maxMs: number;
  timeShare: number;
};

export type TraceStats = {
  eventCounts: Record<TraceEvent['type'], number>;
  totalEvents: number;
  wallClockMs: number | undefined;
  toolTimeMs: number;
  toolTimeShare: number | undefined;
  calls: number;
  completedCalls: number;
  pendingCalls: number;
  failedCalls: number;
  failureRate: number | undefined;
  orphanResults: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  tools: ToolStat[];
};
