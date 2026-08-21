import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTrace, parseTraceLine, parseTraceStrict, TraceParseError } from '../src/parse.ts';

test('parses a user event', () => {
  const result = parseTraceLine('{"type":"user","ts":100,"text":"hi"}', 1);
  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.event, { type: 'user', ts: 100, text: 'hi' });
});

test('parses an assistant event with usage', () => {
  const result = parseTraceLine(
    '{"type":"assistant","ts":200,"text":"looking","usage":{"input_tokens":10,"output_tokens":5}}',
    2,
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.event, {
    type: 'assistant',
    ts: 200,
    text: 'looking',
    usage: { inputTokens: 10, outputTokens: 5 },
  });
});

test('accepts role/type, tool/name, arguments/args and timestamp/ts aliases', () => {
  const result = parseTraceLine(
    '{"role":"tool_call","timestamp":300,"id":"c1","tool":"read_file","arguments":{"path":"a.ts"}}',
    3,
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.event, {
    type: 'tool_call',
    ts: 300,
    id: 'c1',
    name: 'read_file',
    args: { path: 'a.ts' },
  });
});

test('parses a tool_result event', () => {
  const result = parseTraceLine('{"type":"tool_result","id":"c1","ok":true,"durationMs":54,"output":"done"}', 4);
  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.event, {
    type: 'tool_result',
    ts: undefined,
    id: 'c1',
    ok: true,
    durationMs: 54,
    output: 'done',
  });
});

test('reports invalid JSON with the line number', () => {
  const result = parseTraceLine('not json', 7);
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.issue.line, 7);
  assert.equal(!result.ok && result.issue.raw, 'not json');
  assert.match(!result.ok ? result.issue.message : '', /invalid JSON/);
});

test('rejects JSON that is not an object', () => {
  for (const raw of ['[1,2,3]', '"just a string"', '42', 'null']) {
    const result = parseTraceLine(raw, 1);
    assert.equal(result.ok, false, `expected ${raw} to fail`);
    assert.match(!result.ok ? result.issue.message : '', /not a JSON object/);
  }
});

test('rejects an unknown or missing event type', () => {
  const missing = parseTraceLine('{"text":"hi"}', 1);
  assert.equal(missing.ok, false);
  assert.match(!missing.ok ? missing.issue.message : '', /unknown or missing event type/);

  const unknown = parseTraceLine('{"type":"debug","text":"hi"}', 1);
  assert.equal(unknown.ok, false);
  assert.match(!unknown.ok ? unknown.issue.message : '', /unknown or missing event type/);
});

test('parseTrace skips blank lines but keeps line numbers accurate', () => {
  const text = ['{"type":"user","text":"a"}', '', '   ', 'not json', '{"type":"assistant","text":"b"}'].join('\n');
  const { events, issues } = parseTrace(text);

  assert.equal(events.length, 2);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].line, 4);
});

test('parseTraceStrict returns events when the trace is clean', () => {
  const text = '{"type":"user","text":"a"}\n{"type":"assistant","text":"b"}';
  const events = parseTraceStrict(text);
  assert.equal(events.length, 2);
});

test('parseTraceStrict throws TraceParseError carrying the issues', () => {
  const text = '{"type":"user","text":"a"}\nnot json';
  assert.throws(() => parseTraceStrict(text), (err: unknown) => {
    assert.ok(err instanceof TraceParseError);
    const parseErr = err as TraceParseError;
    assert.equal(parseErr.issues.length, 1);
    assert.equal(parseErr.issues[0].line, 2);
    return true;
  });
});
