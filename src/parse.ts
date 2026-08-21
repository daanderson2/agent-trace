import type {
  AssistantEvent,
  LineResult,
  ParseIssue,
  ToolCallEvent,
  ToolResultEvent,
  TraceEvent,
  UserEvent,
  Usage,
} from './types.ts';

const KNOWN_TYPES = new Set(['user', 'assistant', 'tool_call', 'tool_result']);

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asUsage(value: unknown): Usage | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const obj = value as Record<string, unknown>;
  const inputTokens = asFiniteNumber(obj.input_tokens ?? obj.inputTokens);
  const outputTokens = asFiniteNumber(obj.output_tokens ?? obj.outputTokens);
  if (inputTokens === undefined && outputTokens === undefined) return undefined;
  return { inputTokens, outputTokens };
}

/** Parses a single JSONL line into a normalized event. Never throws. */
export function parseTraceLine(raw: string, line = 0): LineResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      ok: false,
      issue: { line, message: `invalid JSON: ${(err as Error).message}`, raw },
    };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, issue: { line, message: 'line is not a JSON object', raw } };
  }

  const obj = parsed as Record<string, unknown>;
  // 'role' is an alias some runtimes use in place of 'type'.
  const type = asString(obj.type ?? obj.role);
  if (type === undefined || !KNOWN_TYPES.has(type)) {
    return {
      ok: false,
      issue: {
        line,
        message: `unknown or missing event type: ${JSON.stringify(obj.type ?? obj.role ?? null)}`,
        raw,
      },
    };
  }

  const ts = asFiniteNumber(obj.ts ?? obj.timestamp);
  let event: TraceEvent;

  switch (type) {
    case 'user': {
      const e: UserEvent = { type: 'user', ts, text: asString(obj.text) };
      event = e;
      break;
    }
    case 'assistant': {
      const e: AssistantEvent = {
        type: 'assistant',
        ts,
        text: asString(obj.text),
        usage: asUsage(obj.usage),
      };
      event = e;
      break;
    }
    case 'tool_call': {
      const e: ToolCallEvent = {
        type: 'tool_call',
        ts,
        id: asString(obj.id),
        name: asString(obj.name ?? obj.tool),
        args: obj.args ?? obj.arguments,
      };
      event = e;
      break;
    }
    default: {
      const e: ToolResultEvent = {
        type: 'tool_result',
        ts,
        id: asString(obj.id),
        ok: typeof obj.ok === 'boolean' ? obj.ok : undefined,
        durationMs: asFiniteNumber(obj.durationMs),
        output: obj.output,
      };
      event = e;
      break;
    }
  }

  return { ok: true, event };
}

/** Parses a full trace, skipping blank lines. Unusable lines are collected as issues, never thrown. */
export function parseTrace(text: string): { events: TraceEvent[]; issues: ParseIssue[] } {
  const events: TraceEvent[] = [];
  const issues: ParseIssue[] = [];
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '') continue;

    const result = parseTraceLine(trimmed, i + 1);
    if (result.ok) {
      events.push(result.event);
    } else {
      issues.push(result.issue);
    }
  }

  return { events, issues };
}

export class TraceParseError extends Error {
  issues: ParseIssue[];

  constructor(issues: ParseIssue[]) {
    super(`${issues.length} unusable line(s) in trace`);
    this.name = 'TraceParseError';
    this.issues = issues;
  }
}

/** Same as parseTrace, but throws TraceParseError if any line was unusable. */
export function parseTraceStrict(text: string): TraceEvent[] {
  const { events, issues } = parseTrace(text);
  if (issues.length > 0) {
    throw new TraceParseError(issues);
  }
  return events;
}
