import { pairToolEvents } from './pair.ts';
import type { ToolStat, TraceEvent, TraceStats } from './types.ts';

type ToolAccumulator = {
  calls: number;
  failures: number;
  totalMs: number;
  maxMs: number;
  measured: number;
};

/**
 * Wall clock time, tool time, per-tool timing, and token totals for a parsed
 * trace. Pure over the event list -- pairs calls to results itself, so callers
 * never need to run pairToolEvents first.
 */
export function computeStats(events: TraceEvent[]): TraceStats {
  const eventCounts: Record<TraceEvent['type'], number> = {
    user: 0,
    assistant: 0,
    tool_call: 0,
    tool_result: 0,
  };
  let minTs: number | undefined;
  let maxTs: number | undefined;
  let inputTokens = 0;
  let outputTokens = 0;

  for (const event of events) {
    eventCounts[event.type]++;
    if (event.ts !== undefined) {
      minTs = minTs === undefined ? event.ts : Math.min(minTs, event.ts);
      maxTs = maxTs === undefined ? event.ts : Math.max(maxTs, event.ts);
    }
    if (event.type === 'assistant' && event.usage !== undefined) {
      inputTokens += event.usage.inputTokens ?? 0;
      outputTokens += event.usage.outputTokens ?? 0;
    }
  }

  const wallClockMs = minTs !== undefined && maxTs !== undefined ? maxTs - minTs : undefined;

  const { spans, orphans } = pairToolEvents(events);
  const byName = new Map<string, ToolAccumulator>();
  let completedCalls = 0;
  let pendingCalls = 0;
  let failedCalls = 0;
  let toolTimeMs = 0;

  for (const span of spans) {
    const name = span.name ?? '(unknown)';
    let acc = byName.get(name);
    if (acc === undefined) {
      acc = { calls: 0, failures: 0, totalMs: 0, maxMs: 0, measured: 0 };
      byName.set(name, acc);
    }
    acc.calls++;

    if (span.pending) {
      pendingCalls++;
      continue;
    }
    completedCalls++;
    if (span.ok === false) {
      failedCalls++;
      acc.failures++;
    }
    if (span.durationMs !== undefined) {
      toolTimeMs += span.durationMs;
      acc.totalMs += span.durationMs;
      acc.maxMs = Math.max(acc.maxMs, span.durationMs);
      acc.measured++;
    }
  }

  const tools: ToolStat[] = [...byName.entries()]
    .map(([name, acc]) => ({
      name,
      calls: acc.calls,
      failures: acc.failures,
      totalMs: acc.totalMs,
      avgMs: acc.measured > 0 ? acc.totalMs / acc.measured : 0,
      maxMs: acc.maxMs,
      timeShare: toolTimeMs > 0 ? acc.totalMs / toolTimeMs : 0,
    }))
    .sort((a, b) => b.totalMs - a.totalMs);

  return {
    eventCounts,
    totalEvents: events.length,
    wallClockMs,
    toolTimeMs,
    toolTimeShare: wallClockMs !== undefined && wallClockMs > 0 ? toolTimeMs / wallClockMs : undefined,
    calls: spans.length,
    completedCalls,
    pendingCalls,
    failedCalls,
    failureRate: completedCalls > 0 ? failedCalls / completedCalls : undefined,
    orphanResults: orphans.length,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    tools,
  };
}
