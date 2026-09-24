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

test('pairToolEvents and renderTimeline compose over parseTrace output', () => {
  const text = readFileSync(EXAMPLE_PATH, 'utf8');
  const { events } = parseTrace(text);
  const { spans, orphans } = pairToolEvents(events);
  assert.equal(spans.length, 6);
  assert.equal(orphans.length, 0);
  assert.match(renderTimeline(events, { tool: 'run_tests' }), /run_tests/);
});
