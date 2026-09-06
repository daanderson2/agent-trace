import { pairToolEvents } from './pair.ts';
import type { RenderTimelineOptions, ToolSpan, ToolStat, TraceEvent, TraceStats } from './types.ts';

const LABEL_WIDTH = 14;
const KIND_WIDTH = 9;
const DEFAULT_MAX_ARG_LENGTH = 80;

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

function formatTime(ts: number | undefined): string {
  if (ts === undefined) return ' '.repeat(12);
  return new Date(ts).toISOString().slice(11, 23);
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  if (maxLength <= 1) return text.slice(0, maxLength);
  return `${text.slice(0, maxLength - 1)}…`;
}

function formatArgs(args: unknown, maxArgLength: number): string {
  if (args === undefined) return '';
  const text = typeof args === 'string' ? args : JSON.stringify(args);
  return truncate(text, maxArgLength);
}

function formatLine(ts: number | undefined, kind: string, detail: string): string {
  return `${formatTime(ts)}  ${kind.padEnd(KIND_WIDTH)}  ${detail}`.trimEnd();
}

function formatSpanDetail(span: ToolSpan, maxArgLength: number): string {
  const name = span.name ?? '(unknown)';
  const args = formatArgs(span.args, maxArgLength);
  const status = span.pending ? 'pending' : span.ok === false ? 'failed' : 'ok';
  let detail = args === '' ? name : `${name} ${args}`;
  detail += `  ${status}`;
  if (span.durationMs !== undefined) detail += ` ${formatDuration(span.durationMs)}`;
  return detail;
}

/**
 * Renders the indented timeline text shown by `agent-trace show`. Tool calls
 * are merged with their matched result into a single line; a result that
 * pairToolEvents could not match to any call is shown on its own as an
 * orphan, since it points at a call that never happened (or already got one).
 */
export function renderTimeline(events: TraceEvent[], options: RenderTimelineOptions = {}): string {
  const maxArgLength = options.maxArgLength ?? DEFAULT_MAX_ARG_LENGTH;
  const showText = options.showText ?? true;
  const { spans, orphans } = pairToolEvents(events);
  const orphanSet = new Set(orphans);
  const spanQueue = [...spans];
  const lines: string[] = [];

  for (const event of events) {
    switch (event.type) {
      case 'user':
        if (showText) lines.push(formatLine(event.ts, 'user', event.text ?? ''));
        break;

      case 'assistant': {
        if (!showText) break;
        let detail = event.text ?? '';
        if (event.usage !== undefined) {
          const { inputTokens = 0, outputTokens = 0 } = event.usage;
          detail += `${detail === '' ? '' : '  '}(${inputTokens} in / ${outputTokens} out)`;
        }
        lines.push(formatLine(event.ts, 'assistant', detail));
        break;
      }

      case 'tool_call': {
        // spans are in the same order tool_call events appear in, so this stays in sync.
        const span = spanQueue.shift();
        if (span === undefined || (options.tool !== undefined && span.name !== options.tool)) break;
        lines.push(formatLine(span.callTs, 'tool', formatSpanDetail(span, maxArgLength)));
        break;
      }

      case 'tool_result': {
        if (!orphanSet.has(event) || options.tool !== undefined) break;
        const id = event.id !== undefined ? ` ${event.id}` : '';
        const status = event.ok === false ? 'failed' : event.ok === true ? 'ok' : 'unknown';
        lines.push(formatLine(event.ts, 'orphan', `result${id}  ${status} (unmatched)`));
        break;
      }
    }
  }

  return lines.join('\n');
}
