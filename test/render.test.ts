import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderStats } from '../src/render.ts';
import type { TraceStats } from '../src/types.ts';

// Mirrors the "stats on the bundled example" block in the README, so the two
// stay honest with each other.
const README_STATS: TraceStats = {
  eventCounts: { user: 1, assistant: 4, tool_call: 6, tool_result: 6 },
  totalEvents: 17,
  wallClockMs: 7400,
  toolTimeMs: 3728,
  toolTimeShare: 3728 / 7400,
  calls: 6,
  completedCalls: 6,
  pendingCalls: 0,
  failedCalls: 1,
  failureRate: 1 / 6,
  orphanResults: 0,
  inputTokens: 10330,
  outputTokens: 536,
  totalTokens: 10866,
  tools: [
    { name: 'run_tests', calls: 2, failures: 1, totalMs: 3515, avgMs: 1758, maxMs: 1760, timeShare: 3515 / 3728 },
    { name: 'apply_patch', calls: 2, failures: 0, totalMs: 118, avgMs: 59, maxMs: 60, timeShare: 118 / 3728 },
    { name: 'read_file', calls: 2, failures: 0, totalMs: 95, avgMs: 48, maxMs: 54, timeShare: 95 / 3728 },
  ],
};

test('matches the worked example in the README', () => {
  const expected = [
    'events        17  (user 1, assistant 4, tool_call 6, tool_result 6)',
    'wall clock    7.400s',
    'tool time     3.728s  (50.4% of wall clock)',
    'tool calls    6  (6 completed, 0 pending, 1 failed = 16.7% failure rate)',
    'tokens        10330 in / 536 out = 10866 total',
    '',
    'tool         calls  fail   total     avg     max  share',
    'run_tests        2     1  3.515s  1.758s  1.760s  94.3%',
    'apply_patch      2     0   118ms    59ms    60ms   3.2%',
    'read_file        2     0    95ms    48ms    54ms   2.5%',
  ].join('\n');
  assert.equal(renderStats(README_STATS), expected);
});

test('omits the tool table when there are no tool calls', () => {
  const stats: TraceStats = {
    eventCounts: { user: 1, assistant: 1, tool_call: 0, tool_result: 0 },
    totalEvents: 2,
    wallClockMs: 500,
    toolTimeMs: 0,
    toolTimeShare: 0,
    calls: 0,
    completedCalls: 0,
    pendingCalls: 0,
    failedCalls: 0,
    failureRate: undefined,
    orphanResults: 0,
    inputTokens: 10,
    outputTokens: 5,
    totalTokens: 15,
    tools: [],
  };
  const rendered = renderStats(stats);
  assert.ok(!rendered.includes('\n\n'));
  assert.ok(!rendered.includes('tool  '));
});

test('prints n/a for wall clock and omits the tool-time share when no event has a timestamp', () => {
  const stats: TraceStats = {
    eventCounts: { user: 1, assistant: 0, tool_call: 0, tool_result: 0 },
    totalEvents: 1,
    wallClockMs: undefined,
    toolTimeMs: 0,
    toolTimeShare: undefined,
    calls: 0,
    completedCalls: 0,
    pendingCalls: 0,
    failedCalls: 0,
    failureRate: undefined,
    orphanResults: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    tools: [],
  };
  const rendered = renderStats(stats);
  assert.ok(rendered.includes('wall clock    n/a'));
  assert.ok(!rendered.includes('of wall clock'));
});

test('omits the failure rate when no call has completed', () => {
  const stats: TraceStats = {
    eventCounts: { user: 0, assistant: 0, tool_call: 1, tool_result: 0 },
    totalEvents: 1,
    wallClockMs: 100,
    toolTimeMs: 0,
    toolTimeShare: 0,
    calls: 1,
    completedCalls: 0,
    pendingCalls: 1,
    failedCalls: 0,
    failureRate: undefined,
    orphanResults: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    tools: [{ name: 'run_tests', calls: 1, failures: 0, totalMs: 0, avgMs: 0, maxMs: 0, timeShare: 0 }],
  };
  const rendered = renderStats(stats);
  assert.ok(rendered.includes('(0 completed, 1 pending, 0 failed)'));
  assert.ok(!rendered.includes('failure rate'));
});

test('widens table columns to fit a long tool name', () => {
  const stats: TraceStats = {
    eventCounts: { user: 0, assistant: 0, tool_call: 1, tool_result: 1 },
    totalEvents: 2,
    wallClockMs: 10,
    toolTimeMs: 10,
    toolTimeShare: 1,
    calls: 1,
    completedCalls: 1,
    pendingCalls: 0,
    failedCalls: 0,
    failureRate: 0,
    orphanResults: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    tools: [
      {
        name: 'a_very_long_tool_name',
        calls: 1,
        failures: 0,
        totalMs: 10,
        avgMs: 10,
        maxMs: 10,
        timeShare: 1,
      },
    ],
  };
  const lines = renderStats(stats).split('\n');
  const header = lines[lines.length - 2];
  const row = lines[lines.length - 1];
  assert.equal(header.length, row.length);
  assert.ok(row.startsWith('a_very_long_tool_name'));
  assert.equal(header.indexOf('calls'), 'a_very_long_tool_name'.length + 2);
});
