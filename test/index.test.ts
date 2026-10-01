import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  computeStats,
  pairToolEvents,
  parseTrace,
  parseTraceLine,
  parseTraceStrict,
  renderStats,
  renderTimeline,
  TraceParseError,
} from '../src/index.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLE_PATH = path.join(here, '..', 'examples', 'session.jsonl');
const MIXED_PATH = path.join(here, 'fixtures', 'mixed-timestamps.jsonl');

// This is the exact table printed in the README's "CLI" section. If either
// drifts -- the fixture, the render format, or the doc -- this test breaks.
const EXPECTED_STATS = [
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

test('the public pipeline reproduces the README stats example from the bundled fixture', () => {
  const text = readFileSync(EXAMPLE_PATH, 'utf8');
  const { events, issues } = parseTrace(text);
  assert.equal(issues.length, 0);
  assert.equal(renderStats(computeStats(events)), EXPECTED_STATS);
});

test('parseTraceStrict returns the same events as parseTrace for a clean fixture', () => {
  const text = readFileSync(EXAMPLE_PATH, 'utf8');
  const { events } = parseTrace(text);
  assert.deepEqual(parseTraceStrict(text), events);
});

test('parseTraceStrict throws TraceParseError, exported from the package root, on bad input', () => {
  assert.throws(
    () => parseTraceStrict('not json'),
    (err: unknown) => err instanceof TraceParseError && err.issues.length === 1,
  );
});

test('parseTraceLine is usable standalone, without parseTrace, for streaming callers', () => {
  const result = parseTraceLine('{"role":"user","timestamp":5,"text":"hi"}');
  assert.deepEqual(result, { ok: true, event: { type: 'user', ts: 5, text: 'hi' } });
});

// Real logs often stamp only some events. Durations can only come from calls
// whose call and result both carry a timestamp; the rest must stay unmeasured
// instead of being counted as zero.
test('a trace where only some events carry timestamps is measured only where it can be', () => {
  const text = readFileSync(MIXED_PATH, 'utf8');
  const { events, issues } = parseTrace(text);
  assert.equal(issues.length, 0);
  assert.equal(events.length, 9);

  const { spans } = pairToolEvents(events);
  assert.deepEqual(
    spans.map((s) => s.durationMs),
    [500, undefined, undefined],
  );

  const stats = computeStats(events);
  assert.equal(stats.wallClockMs, 800);
  assert.equal(stats.toolTimeMs, 500);
  assert.equal(stats.toolTimeShare, 0.625);
  assert.equal(stats.completedCalls, 3);
  assert.equal(stats.failedCalls, 1);
  assert.equal(stats.inputTokens, 500);

  const runTests = stats.tools.find((t) => t.name === 'run_tests');
  assert.equal(runTests?.totalMs, 500);
  assert.equal(runTests?.avgMs, 500);
  const readFile = stats.tools.find((t) => t.name === 'read_file');
  assert.equal(readFile?.calls, 1);
  assert.equal(readFile?.avgMs, 0);
});

test('pairToolEvents and renderTimeline compose over parseTrace output', () => {
  const text = readFileSync(EXAMPLE_PATH, 'utf8');
  const { events } = parseTrace(text);
  const { spans, orphans } = pairToolEvents(events);
  assert.equal(spans.length, 6);
  assert.equal(orphans.length, 0);
  assert.match(renderTimeline(events, { tool: 'run_tests' }), /run_tests/);
});
