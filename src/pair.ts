import type { PairResult, ToolCallEvent, ToolResultEvent, ToolSpan, TraceEvent } from './types.ts';

type OpenCall = { event: ToolCallEvent; result?: ToolResultEvent };

function durationOf(call: ToolCallEvent, result: ToolResultEvent | undefined): number | undefined {
  if (result === undefined) return undefined;
  if (result.durationMs !== undefined) return result.durationMs;
  if (call.ts !== undefined && result.ts !== undefined && result.ts >= call.ts) {
    return result.ts - call.ts;
  }
  return undefined;
}

function toSpan(entry: OpenCall): ToolSpan {
  const { event: call, result } = entry;
  return {
    id: call.id,
    name: call.name,
    args: call.args,
    callTs: call.ts,
    ok: result?.ok,
    output: result?.output,
    durationMs: durationOf(call, result),
    pending: result === undefined,
  };
}

/**
 * Matches tool_call events to their tool_result by id. A result with no id is
 * matched to the oldest still-open call, which is what sequential agents (call,
 * wait, call, wait...) produce. A result whose id matches nothing -- because no
 * such call exists, or that call was already matched -- is reported as an
 * orphan rather than attached to an unrelated call.
 */
export function pairToolEvents(events: TraceEvent[]): PairResult {
  const open: OpenCall[] = [];
  const byId = new Map<string, OpenCall>();
  const orphans: ToolResultEvent[] = [];

  for (const event of events) {
    if (event.type === 'tool_call') {
      const entry: OpenCall = { event };
      open.push(entry);
      if (event.id !== undefined) byId.set(event.id, entry);
      continue;
    }

    if (event.type !== 'tool_result') continue;

    const entry = event.id !== undefined ? byId.get(event.id) : open.find((o) => o.result === undefined);

    if (entry === undefined) {
      orphans.push(event);
      continue;
    }

    entry.result = event;
    if (entry.event.id !== undefined) byId.delete(entry.event.id);
  }

  return { spans: open.map(toSpan), orphans };
}
