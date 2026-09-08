import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../src/cli.ts';
import type { CliIO } from '../src/cli.ts';

const GOOD_TRACE = [
  '{"type":"user","ts":1000,"text":"hi"}',
  '{"type":"tool_call","ts":1010,"id":"c1","name":"run_tests"}',
  '{"type":"tool_result","ts":1050,"id":"c1","ok":true,"durationMs":40}',
].join('\n');

const MIXED_TRACE = ['{"type":"user","ts":1000,"text":"hi"}', 'not json', '{}'].join('\n');

function fakeIO(files: Record<string, string>) {
  const out: string[] = [];
  const err: string[] = [];
  const io: CliIO = {
    readFile: (file) => {
      const contents = files[file];
      if (contents === undefined) throw new Error(`no such file: ${file}`);
      return contents;
    },
    stdout: (text) => out.push(text),
    stderr: (text) => err.push(text),
  };
  return { io, out, err };
}

test('stats prints the summary table and returns 0', () => {
  const { io, out, err } = fakeIO({ 'session.jsonl': GOOD_TRACE });
  const code = run(['stats', 'session.jsonl'], io);
  assert.equal(code, 0);
  assert.equal(err.length, 0);
  assert.match(out.join(''), /wall clock/);
});

test('stats --json prints parsed JSON stats', () => {
  const { io, out } = fakeIO({ 'session.jsonl': GOOD_TRACE });
  const code = run(['stats', 'session.jsonl', '--json'], io);
  assert.equal(code, 0);
  const stats = JSON.parse(out.join(''));
  assert.equal(stats.calls, 1);
});

test('show prints the timeline', () => {
  const { io, out } = fakeIO({ 'session.jsonl': GOOD_TRACE });
  const code = run(['show', 'session.jsonl'], io);
  assert.equal(code, 0);
  assert.match(out.join(''), /run_tests/);
});

test('show --tool filters to one tool', () => {
  const trace = [
    '{"type":"tool_call","ts":1,"id":"c1","name":"run_tests"}',
    '{"type":"tool_result","ts":2,"id":"c1","ok":true}',
    '{"type":"tool_call","ts":3,"id":"c2","name":"read_file"}',
    '{"type":"tool_result","ts":4,"id":"c2","ok":true}',
  ].join('\n');
  const { io, out } = fakeIO({ 'session.jsonl': trace });
  const code = run(['show', 'session.jsonl', '--tool=run_tests'], io);
  assert.equal(code, 0);
  const text = out.join('');
  assert.match(text, /run_tests/);
  assert.doesNotMatch(text, /read_file/);
});

test('show --no-text hides user and assistant lines', () => {
  const { io, out } = fakeIO({ 'session.jsonl': GOOD_TRACE });
  const code = run(['show', 'session.jsonl', '--no-text'], io);
  assert.equal(code, 0);
  assert.doesNotMatch(out.join(''), /hi/);
});

test('bad lines are reported as warnings but do not fail the run', () => {
  const { io, out, err } = fakeIO({ 'session.jsonl': MIXED_TRACE });
  const code = run(['stats', 'session.jsonl'], io);
  assert.equal(code, 0);
  assert.equal(err.length, 2);
  assert.match(err.join(''), /line 2/);
  assert.match(out.join(''), /events/);
});

test('--strict exits 1 when any line failed to parse', () => {
  const { io, err } = fakeIO({ 'session.jsonl': MIXED_TRACE });
  const code = run(['stats', 'session.jsonl', '--strict'], io);
  assert.equal(code, 1);
  assert.equal(err.length, 2);
});

test('exits 1 when the trace has no usable events', () => {
  const { io, err } = fakeIO({ 'session.jsonl': 'not json' });
  const code = run(['stats', 'session.jsonl'], io);
  assert.equal(code, 1);
  assert.match(err.join(''), /no usable events/);
});

test('unknown command exits 2 with usage', () => {
  const { io, err } = fakeIO({});
  const code = run(['frobnicate', 'session.jsonl'], io);
  assert.equal(code, 2);
  assert.match(err.join(''), /unknown command/);
});

test('missing file argument exits 2', () => {
  const { io, err } = fakeIO({});
  const code = run(['stats'], io);
  assert.equal(code, 2);
  assert.match(err.join(''), /missing <file>/);
});

test('unknown option exits 2', () => {
  const { io, err } = fakeIO({ 'session.jsonl': GOOD_TRACE });
  const code = run(['stats', 'session.jsonl', '--nope'], io);
  assert.equal(code, 2);
  assert.match(err.join(''), /unknown option/);
});

test('invalid --max-arg value exits 2', () => {
  const { io, err } = fakeIO({ 'session.jsonl': GOOD_TRACE });
  const code = run(['show', 'session.jsonl', '--max-arg=nope'], io);
  assert.equal(code, 2);
  assert.match(err.join(''), /--max-arg/);
});

test('a read failure is reported and exits 2', () => {
  const { io, err } = fakeIO({});
  const code = run(['stats', 'missing.jsonl'], io);
  assert.equal(code, 2);
  assert.match(err.join(''), /could not read/);
});

test('--help prints usage and returns 0', () => {
  const { io, out } = fakeIO({});
  const code = run(['--help'], io);
  assert.equal(code, 0);
  assert.match(out.join(''), /Usage: agent-trace/);
});

test('--version prints the package version', () => {
  const { io, out } = fakeIO({});
  const code = run(['--version'], io);
  assert.equal(code, 0);
  assert.match(out.join('').trim(), /^\d+\.\d+\.\d+$/);
});
