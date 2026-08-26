import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStats } from '../src/stats.ts';
import type { TraceEvent } from '../src/types.ts';

test('counts events by type', () => {
  const events: TraceEvent[] = [
    { type: 'user', text: 'hi' },
    { type: 'assistant', text: 'a' },
    { type: 'assistant', text: 'b' },
    { type: 'tool_call', id: 'c1', name: 'read_file' },
    { type: 'tool_result', id: 'c1', ok: true },
  ];
  const stats = computeStats(events);
  assert.deepEqual(stats.eventCounts, { user: 1, assistant: 2, tool_call: 1, tool_result: 1 });
  assert.equal(stats.totalEvents, 5);
});

test('wall clock is the span between the earliest and latest timestamp', () => {
  const events: TraceEvent[] = [
    { type: 'user', ts: 1000, text: 'hi' },
    { type: 'assistant', ts: 1900, text: 'ok' },
    { type: 'tool_call', ts: 1950, id: 'c1' },
    { type: 'tool_result', ts: 2400, id: 'c1', ok: true },
  ];
  const stats = computeStats(events);
  assert.equal(stats.wallClockMs, 1400);
});

test('wall clock is undefined when no event has a timestamp', () => {
  const events: TraceEvent[] = [{ type: 'user', text: 'hi' }];
  const stats = computeStats(events);
  assert.equal(stats.wallClockMs, undefined);
  assert.equal(stats.toolTimeShare, undefined);
});

test('sums input and output tokens across assistant events', () => {
  const events: TraceEvent[] = [
    { type: 'assistant', text: 'a', usage: { inputTokens: 100, outputTokens: 20 } },
    { type: 'assistant', text: 'b', usage: { inputTokens: 50 } },
    { type: 'assistant', text: 'c' },
  ];
  const stats = computeStats(events);
  assert.equal(stats.inputTokens, 150);
  assert.equal(stats.outputTokens, 20);
  assert.equal(stats.totalTokens, 170);
});

test('classifies calls as completed, pending or failed, and computes the failure rate', () => {
  const events: TraceEvent[] = [
    { type: 'tool_call', id: 'c1', name: 'run_tests' },
    { type: 'tool_result', id: 'c1', ok: true, durationMs: 10 },
    { type: 'tool_call', id: 'c2', name: 'run_tests' },
    { type: 'tool_result', id: 'c2', ok: false, durationMs: 20 },
    { type: 'tool_call', id: 'c3', name: 'run_tests' },
  ];
  const stats = computeStats(events);
  assert.equal(stats.calls, 3);
  assert.equal(stats.completedCalls, 2);
  assert.equal(stats.pendingCalls, 1);
  assert.equal(stats.failedCalls, 1);
  assert.equal(stats.failureRate, 0.5);
});

test('failure rate is undefined when no call has completed', () => {
  const events: TraceEvent[] = [{ type: 'tool_call', id: 'c1', name: 'run_tests' }];
  const stats = computeStats(events);
  assert.equal(stats.completedCalls, 0);
  assert.equal(stats.failureRate, undefined);
});

test('passes orphan results through from pairToolEvents', () => {
  const events: TraceEvent[] = [{ type: 'tool_result', id: 'does-not-exist', ok: true }];
  const stats = computeStats(events);
  assert.equal(stats.orphanResults, 1);
});

test('aggregates per-tool totals, averages and time share, sorted by total time', () => {
  const events: TraceEvent[] = [
    { type: 'tool_call', id: 'c1', name: 'run_tests' },
    { type: 'tool_result', id: 'c1', ok: true, durationMs: 300 },
    { type: 'tool_call', id: 'c2', name: 'run_tests' },
    { type: 'tool_result', id: 'c2', ok: false, durationMs: 100 },
    { type: 'tool_call', id: 'c3', name: 'read_file' },
    { type: 'tool_result', id: 'c3', ok: true, durationMs: 50 },
  ];
  const stats = computeStats(events);
  assert.equal(stats.toolTimeMs, 450);

  assert.deepEqual(stats.tools, [
    { name: 'run_tests', calls: 2, failures: 1, totalMs: 400, avgMs: 200, maxMs: 300, timeShare: 400 / 450 },
    { name: 'read_file', calls: 1, failures: 0, totalMs: 50, avgMs: 50, maxMs: 50, timeShare: 50 / 450 },
  ]);
});

test('a pending call for a tool does not drag down that tool average', () => {
  const events: TraceEvent[] = [
    { type: 'tool_call', id: 'c1', name: 'run_tests' },
    { type: 'tool_result', id: 'c1', ok: true, durationMs: 100 },
    { type: 'tool_call', id: 'c2', name: 'run_tests' },
  ];
  const stats = computeStats(events);
  const runTests = stats.tools.find((t) => t.name === 'run_tests');
  assert.equal(runTests?.calls, 2);
  assert.equal(runTests?.totalMs, 100);
  assert.equal(runTests?.avgMs, 100);
});

test('a call with no name is grouped under (unknown)', () => {
  const events: TraceEvent[] = [
    { type: 'tool_call', id: 'c1' },
    { type: 'tool_result', id: 'c1', ok: true, durationMs: 10 },
  ];
  const stats = computeStats(events);
  assert.equal(stats.tools.length, 1);
  assert.equal(stats.tools[0].name, '(unknown)');
});
