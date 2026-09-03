import type { ToolStat, TraceStats } from './types.ts';

const LABEL_WIDTH = 14;

function formatDuration(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(3)}s`;
  return `${Math.round(ms)}ms`;
}

function formatPercent(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

function renderToolTable(tools: ToolStat[]): string[] {
  const rows = tools.map((t) => ({
    name: t.name,
    calls: String(t.calls),
    fail: String(t.failures),
    total: formatDuration(t.totalMs),
    avg: formatDuration(t.avgMs),
    max: formatDuration(t.maxMs),
    share: formatPercent(t.timeShare),
  }));

  const widthOf = (header: string, values: string[]) =>
    Math.max(header.length, ...values.map((v) => v.length));

  const nameWidth = widthOf('tool', rows.map((r) => r.name));
  const callsWidth = widthOf('calls', rows.map((r) => r.calls));
  const failWidth = widthOf('fail', rows.map((r) => r.fail));
  const totalWidth = widthOf('total', rows.map((r) => r.total));
  const avgWidth = widthOf('avg', rows.map((r) => r.avg));
  const maxWidth = widthOf('max', rows.map((r) => r.max));
  const shareWidth = widthOf('share', rows.map((r) => r.share));

  const formatRow = (
    name: string,
    calls: string,
    fail: string,
    total: string,
    avg: string,
    max: string,
    share: string,
  ) =>
    [
      name.padEnd(nameWidth),
      calls.padStart(callsWidth),
      fail.padStart(failWidth),
      total.padStart(totalWidth),
      avg.padStart(avgWidth),
      max.padStart(maxWidth),
      share.padStart(shareWidth),
    ].join('  ');

  const header = formatRow('tool', 'calls', 'fail', 'total', 'avg', 'max', 'share');
  const body = rows.map((r) => formatRow(r.name, r.calls, r.fail, r.total, r.avg, r.max, r.share));
  return [header, ...body];
}

/** Renders the plain-text summary shown by `agent-trace stats`. */
export function renderStats(stats: TraceStats): string {
  const label = (s: string) => s.padEnd(LABEL_WIDTH);
  const lines: string[] = [];

  const { user, assistant, tool_call: toolCall, tool_result: toolResult } = stats.eventCounts;
  lines.push(
    `${label('events')}${stats.totalEvents}  (user ${user}, assistant ${assistant}, ` +
      `tool_call ${toolCall}, tool_result ${toolResult})`,
  );

  lines.push(`${label('wall clock')}${stats.wallClockMs !== undefined ? formatDuration(stats.wallClockMs) : 'n/a'}`);

  let toolTimeLine = `${label('tool time')}${formatDuration(stats.toolTimeMs)}`;
  if (stats.toolTimeShare !== undefined) {
    toolTimeLine += `  (${formatPercent(stats.toolTimeShare)} of wall clock)`;
  }
  lines.push(toolTimeLine);

  let callsLine =
    `${label('tool calls')}${stats.calls}  (${stats.completedCalls} completed, ` +
    `${stats.pendingCalls} pending, ${stats.failedCalls} failed`;
  if (stats.failureRate !== undefined) {
    callsLine += ` = ${formatPercent(stats.failureRate)} failure rate`;
  }
  callsLine += ')';
  lines.push(callsLine);

  lines.push(`${label('tokens')}${stats.inputTokens} in / ${stats.outputTokens} out = ${stats.totalTokens} total`);

  if (stats.tools.length > 0) {
    lines.push('');
    lines.push(...renderToolTable(stats.tools));
  }

  return lines.join('\n');
}
