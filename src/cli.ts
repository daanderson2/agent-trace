#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseTrace } from './parse.ts';
import { computeStats } from './stats.ts';
import { renderStats, renderTimeline } from './render.ts';

const USAGE = `Usage: agent-trace <command> <file> [options]

Commands:
  stats <file>     totals, per-tool timing, token usage
  show <file>      indented timeline of the session

Options:
  --json           print stats as JSON instead of a table (stats only)
  --tool=<name>    restrict show to a single tool
  --max-arg=<n>    truncate tool arguments to n characters (default 80)
  --no-text        hide user and assistant messages
  --strict         exit 1 if any line failed to parse
  -h, --help       show this help
  --version        show version

Pass - as <file> to read the trace from stdin.`;

export type CliIO = {
  readFile: (file: string) => string;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
};

const defaultIO: CliIO = {
  readFile: (file) => readFileSync(file === '-' ? 0 : file, 'utf8'),
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
};

function readVersion(): string {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const pkgPath = path.join(dir, '..', 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string };
  return pkg.version;
}

/**
 * Runs the CLI for a given argv and returns the process exit code, rather
 * than calling process.exit itself, so callers (and tests) can drive it
 * without touching real stdio.
 */
export function run(argv: string[], io: CliIO = defaultIO): number {
  if (argv.includes('-h') || argv.includes('--help')) {
    io.stdout(`${USAGE}\n`);
    return 0;
  }
  if (argv.includes('--version')) {
    io.stdout(`${readVersion()}\n`);
    return 0;
  }

  const [command, file, ...rest] = argv;
  if (command !== 'stats' && command !== 'show') {
    io.stderr(`error: unknown command ${JSON.stringify(command ?? '')}\n\n${USAGE}\n`);
    return 2;
  }
  if (file === undefined) {
    io.stderr(`error: missing <file>\n\n${USAGE}\n`);
    return 2;
  }

  let json = false;
  let tool: string | undefined;
  let maxArgLength: number | undefined;
  let showText = true;
  let strict = false;

  for (const arg of rest) {
    if (arg === '--json') {
      json = true;
    } else if (arg === '--no-text') {
      showText = false;
    } else if (arg === '--strict') {
      strict = true;
    } else if (arg.startsWith('--tool=')) {
      tool = arg.slice('--tool='.length);
    } else if (arg.startsWith('--max-arg=')) {
      const n = Number(arg.slice('--max-arg='.length));
      if (!Number.isFinite(n) || n < 0) {
        io.stderr(`error: --max-arg must be a non-negative number\n`);
        return 2;
      }
      maxArgLength = n;
    } else {
      io.stderr(`error: unknown option ${arg}\n\n${USAGE}\n`);
      return 2;
    }
  }

  let text: string;
  try {
    text = io.readFile(file);
  } catch (err) {
    io.stderr(`error: could not read ${file}: ${(err as Error).message}\n`);
    return 2;
  }

  const { events, issues } = parseTrace(text);

  if (strict && issues.length > 0) {
    for (const issue of issues) io.stderr(`line ${issue.line}: ${issue.message}\n`);
    return 1;
  }
  if (events.length === 0) {
    io.stderr('error: no usable events in trace\n');
    return 1;
  }
  for (const issue of issues) io.stderr(`line ${issue.line}: ${issue.message}\n`);

  if (command === 'stats') {
    const stats = computeStats(events);
    io.stdout(json ? `${JSON.stringify(stats, null, 2)}\n` : `${renderStats(stats)}\n`);
  } else {
    io.stdout(`${renderTimeline(events, { tool, maxArgLength, showText })}\n`);
  }

  return 0;
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  process.exitCode = run(process.argv.slice(2));
}
