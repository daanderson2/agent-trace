import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pairToolEvents } from '../src/pair.ts';
import type { TraceEvent } from '../src/types.ts';

test('pairs a call and result by id, preferring the result durationMs', () => {
  const events: TraceEvent[] = [
    { type: 'tool_call', ts: 100, id: 'c1', name: 'read_file', args: { path: 'a.ts' } },
    { type: 'tool_result', ts: 200, id: 'c1', ok: true, durationMs: 54, output: 'done' },
  ];
  const { spans, orphans } = pairToolEvents(events);
  assert.equal(orphans.length, 0);
  assert.deepEqual(spans, [
    {
      id: 'c1',
      name: 'read_file',
      args: { path: 'a.ts' },
      callTs: 100,
      ok: true,
      output: 'done',
      durationMs: 54,
      pending: false,
    },
  ]);
});

test('falls back to the timestamp delta when durationMs is absent', () => {
  const events: TraceEvent[] = [
    { type: 'tool_call', ts: 100, id: 'c1' },
    { type: 'tool_result', ts: 175, id: 'c1', ok: true },
  ];
  const { spans } = pairToolEvents(events);
  assert.equal(spans[0].durationMs, 75);
});

test('leaves durationMs undefined when neither durationMs nor both timestamps are available', () => {
  const events: TraceEvent[] = [
    { type: 'tool_call', id: 'c1' },
    { type: 'tool_result', ts: 175, id: 'c1', ok: true },
  ];
  const { spans } = pairToolEvents(events);
  assert.equal(spans[0].durationMs, undefined);
});

test('a result with no id matches the oldest still-open call, in order', () => {
  const events: TraceEvent[] = [
    { type: 'tool_call', id: 'c1', name: 'first' },
    { type: 'tool_call', id: 'c2', name: 'second' },
    { type: 'tool_result', ok: true, output: 'r1' },
    { type: 'tool_result', ok: true, output: 'r2' },
  ];
  const { spans, orphans } = pairToolEvents(events);
  assert.equal(orphans.length, 0);
  assert.equal(spans[0].name, 'first');
  assert.equal(spans[0].output, 'r1');
  assert.equal(spans[1].name, 'second');
  assert.equal(spans[1].output, 'r2');
});

test('a result whose id matches nothing is an orphan, not attached to an unrelated call', () => {
  const events: TraceEvent[] = [
    { type: 'tool_call', id: 'c1', name: 'read_file' },
    { type: 'tool_result', id: 'does-not-exist', ok: true },
  ];
  const { spans, orphans } = pairToolEvents(events);
  assert.equal(orphans.length, 1);
  assert.equal(orphans[0].id, 'does-not-exist');
  assert.equal(spans.length, 1);
  assert.equal(spans[0].pending, true);
});

test('a second result for an already-matched id is an orphan', () => {
  const events: TraceEvent[] = [
    { type: 'tool_call', id: 'c1' },
    { type: 'tool_result', id: 'c1', ok: true },
    { type: 'tool_result', id: 'c1', ok: false },
  ];
  const { spans, orphans } = pairToolEvents(events);
  assert.equal(spans.length, 1);
  assert.equal(spans[0].ok, true);
  assert.equal(orphans.length, 1);
  assert.equal(orphans[0].ok, false);
});

test('a call with no matching result is a pending span', () => {
  const events: TraceEvent[] = [{ type: 'tool_call', ts: 100, id: 'c1', name: 'run_tests' }];
  const { spans, orphans } = pairToolEvents(events);
  assert.equal(orphans.length, 0);
  assert.deepEqual(spans, [
    {
      id: 'c1',
      name: 'run_tests',
      args: undefined,
      callTs: 100,
      ok: undefined,
      output: undefined,
      durationMs: undefined,
      pending: true,
    },
  ]);
});

test('non-tool events are ignored', () => {
  const events: TraceEvent[] = [
    { type: 'user', text: 'hi' },
    { type: 'assistant', text: 'sure' },
  ];
  const { spans, orphans } = pairToolEvents(events);
  assert.equal(spans.length, 0);
  assert.equal(orphans.length, 0);
});
