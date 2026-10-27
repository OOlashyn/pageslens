// The steps of the pageslens GitHub Action (action.yml): `run`, `comment` and `finish`.
// Node.js runs this file directly (type stripping), so it uses only erasable TypeScript and no
// dependencies. Inputs arrive as INPUT_* variables set by action.yml; nothing is run in a shell.

import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ACTION_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const POLICY_FILE = 'pageslens.policy.yaml';

export interface PullRequest {
  number: number;
  base: { ref: string };
  head: { sha?: string; repo?: { full_name: string } | null };
}

export interface IssueComment {
  id: number;
  body?: string;
  html_url: string;
  user?: { type: string } | null;
}

interface Sarif {
  runs: { results?: { ruleId?: string; level?: string }[] }[];
}

/** The pull request in the event, or undefined on a push. */
export function pullRequest(event: { pull_request?: PullRequest }): PullRequest | undefined {
  return event.pull_request;
}

/** A pull request from another repository gets a read-only token whatever the workflow asks for. */
export function isFork(pr: PullRequest, repository: string | undefined): boolean {
  return pr.head.repo?.full_name !== repository;
}

/** The ref to compare with: the `base` input or the pull request's base, `origin/` added to a branch. */
export function baseRef(
  input: string,
  pr: PullRequest,
  hasRemoteBranch: (branch: string) => boolean,
): string {
  const base = input || pr.base.ref;
  return !base.startsWith('origin/') && hasRemoteBranch(base) ? `origin/${base}` : base;
}

/**
 * The pull request's head commit. On `pull_request`, `actions/checkout` checks out a merge commit
 * GitHub makes, which isn't in the pull request; its head commit is, and is what GitHub's own diff
 * shows. `HEAD` when the event has no head commit or it isn't in the checkout.
 */
export function headRef(pr: PullRequest, hasCommit: (sha: string) => boolean): string {
  const sha = pr.head.sha;
  return sha && /^[0-9a-f]{40}$/.test(sha) && hasCommit(sha) ? sha : 'HEAD';
}

/** The nearest policy file in `start` or a folder above it, as `pageslens test` finds it. */
export function findPolicy(start: string): string | undefined {
  let dir = resolve(start);
  for (;;) {
    const candidate = join(dir, POLICY_FILE);
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/** Results by level (lint findings), and rules with results (failed policy statements). */
export function sarifCounts(sarif: Sarif): { errors: number; warnings: number; rules: number } {
  const results = sarif.runs.flatMap((run) => run.results ?? []);
  return {
    errors: results.filter((result) => result.level === 'error').length,
    warnings: results.filter((result) => result.level === 'warning').length,
    rules: new Set(results.map((result) => result.ruleId)).size,
  };
}

/** Our comment: a bot's comment whose first line is the diff's marker for this site. */
export function findComment(comments: IssueComment[], marker: string): IssueComment | undefined {
  return comments.find(
    (comment) => comment.user?.type === 'Bot' && comment.body?.split('\n', 1)[0] === marker,
  );
}

/** With nothing to report, an earlier comment is updated to say so, but none is created. */
export function commentAction(
  existing: IssueComment | undefined,
  hasChanges: boolean,
): 'create' | 'update' | 'none' {
  if (existing) return 'update';
  return hasChanges ? 'create' : 'none';
}

/** GitHub rejects comments over 65,536 characters; this leaves room for its own text. */
export const COMMENT_MAX_LENGTH = 65_000;

/**
 * The pull request comment: `align`'s Markdown above the access changes, under the diff's marker
 * so the comment found and edited is the same with `solution` set or not. Undefined when neither
 * ran. Access changes that don't fit next to the alignment are left to the job summary.
 */
export function commentBody(
  diff: string | undefined,
  align: string | undefined,
): string | undefined {
  if (!diff || !align) return diff ?? align;
  const [marker, ...access] = diff.split('\n');
  const alignment = align.split('\n').slice(1).join('\n');
  const body = `${marker}\n${alignment}\n${access.join('\n')}`;
  if (body.length <= COMMENT_MAX_LENGTH) return body;
  return `${marker}\n${alignment}\n### Access changes\n\n_Too long to add to this comment: see the job summary._\n`;
}

function count(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

function env(name: string): string {
  return process.env[name] ?? '';
}

function input(name: string): string {
  return env(`INPUT_${name.toUpperCase().replaceAll('-', '_')}`).trim();
}

function flag(name: string): boolean {
  return input(name) !== 'false';
}

function setOutput(name: string, value: string | number | boolean): void {
  appendFileSync(env('GITHUB_OUTPUT'), `${name}=${value}\n`);
}

function summary(text: string): void {
  appendFileSync(env('GITHUB_STEP_SUMMARY'), text);
}

function notice(message: string): void {
  console.log(`::notice title=pageslens::${message}`);
}

function error(message: string): void {
  console.log(`::error title=pageslens::${message}`);
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function readEvent(): { pull_request?: PullRequest } {
  return env('GITHUB_EVENT_PATH') ? readJson(env('GITHUB_EVENT_PATH')) : {};
}

function git(...args: string[]) {
  return spawnSync('git', args, { encoding: 'utf8' });
}

/**
 * The CLI: exactly the action's own version, from npm. `PAGESLENS_ACTION_CLI` points at a local
 * build instead; it's for this repository's CI, which tests the action against the code it's in.
 */
function installCli(dir: string): string {
  if (env('PAGESLENS_ACTION_CLI')) return resolve(env('PAGESLENS_ACTION_CLI'));
  const { version } = readJson<{ version: string }>(join(ACTION_DIR, 'package.json'));
  const prefix = join(dir, 'cli');
  console.log(`Installing pageslens ${version}`);
  const npm = spawnSync(
    'npm',
    [
      'install',
      '--no-save',
      '--no-audit',
      '--no-fund',
      '--ignore-scripts',
      '--prefix',
      prefix,
      `pageslens@${version}`,
    ],
    { stdio: 'inherit', shell: process.platform === 'win32' },
  );
  if (npm.status !== 0) throw new Error(`Couldn't install pageslens ${version} from npm`);
  return join(prefix, 'node_modules', 'pageslens', 'dist', 'bin.mjs');
}

/** Runs the CLI and returns its exit code; stdout goes to `outFile`, or to the log. */
function pageslens(cli: string, args: string[], outFile?: string): number {
  console.log(`::group::pageslens ${args.join(' ')}`);
  const result = spawnSync(process.execPath, [cli, ...args], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  if (outFile) writeFileSync(outFile, result.stdout);
  else process.stdout.write(result.stdout);
  console.log('::endgroup::');
  return result.status ?? 2;
}

/**
 * Runs lint, test, align and diff, and never fails: each command's outcome goes to `failures.txt` for
 * `finish`, so a failing lint doesn't stop the SARIF upload or the comment.
 */
function run(): void {
  const pr = pullRequest(readEvent());
  const fork = pr ? isFork(pr, env('GITHUB_REPOSITORY')) : false;
  const path = input('path') || '.';
  const dir = join(env('RUNNER_TEMP'), 'pageslens');
  const sarifDir = join(dir, 'sarif');
  mkdirSync(sarifDir, { recursive: true });
  const cli = installCli(dir);
  const failures: string[] = [];
  const lines: string[] = [];

  // The text run shows in the log and gives the exit code; the SARIF run gives the counts.
  const check = (args: string[], file: string) => {
    const code = pageslens(cli, args);
    const sarif = join(sarifDir, file);
    pageslens(cli, [...args, '--format', 'sarif'], sarif);
    if (code > 1) rmSync(sarif, { force: true });
    return { code, counts: code > 1 ? undefined : sarifCounts(readJson<Sarif>(sarif)) };
  };

  if (flag('lint')) {
    const { code, counts } = check(['lint', path], 'lint.sarif');
    if (counts) {
      const errors = count(counts.errors, 'error');
      setOutput('lint-errors', counts.errors);
      lines.push(`- Lint: ${errors}, ${count(counts.warnings, 'warning')}`);
      if (code === 1) failures.push(`lint found ${errors}`);
    } else {
      lines.push(`- Lint: couldn't run`);
      failures.push(`lint couldn't run (exit code ${code})`);
    }
  }

  if (flag('test')) {
    const policy = input('policy') || findPolicy(path);
    if (!policy) {
      notice(`No ${POLICY_FILE} found for ${path}, so policy tests were skipped.`);
      lines.push('- Policy: no policy file, skipped');
    } else {
      const { code, counts } = check(['test', path, '--policy', policy], 'test.sarif');
      if (counts) {
        const failed = `${count(counts.rules, 'statement')} failed`;
        setOutput('policy-failures', counts.rules);
        lines.push(`- Policy: ${failed}`);
        if (code === 1) failures.push(`policy: ${failed}`);
      } else {
        lines.push(`- Policy: couldn't run`);
        failures.push(`test couldn't run (exit code ${code})`);
      }
    }
  }

  // align compares the download at `path` with the solution, when one is given
  const solution = input('solution');
  let alignMarkdown: string | undefined;
  let alignFindings = 0;
  if (solution) {
    const { code, counts } = check(['align', path, solution], 'align.sarif');
    if (counts) {
      const errors = count(counts.errors, 'error');
      setOutput('align-errors', counts.errors);
      lines.push(`- Align: ${errors}, ${count(counts.warnings, 'warning')}`);
      if (code === 1) failures.push(`align found ${errors}`);
      alignFindings = counts.errors + counts.warnings;
      const markdown = join(dir, 'align.md');
      pageslens(cli, ['align', path, solution, '--format', 'markdown'], markdown);
      alignMarkdown = readFileSync(markdown, 'utf8');
    } else {
      lines.push(`- Align: couldn't run`);
      failures.push(`align couldn't run (exit code ${code})`);
    }
  }

  const sarifWanted = flag('sarif') && (flag('lint') || flag('test') || solution !== '');
  const sarifFiles = ['lint.sarif', 'test.sarif', 'align.sarif'].some((file) =>
    existsSync(join(sarifDir, file)),
  );
  if (sarifWanted && fork) {
    notice('Pull requests from forks get a read-only token, so SARIF was not uploaded.');
  }
  setOutput('sarif-dir', sarifWanted && sarifFiles && !fork ? sarifDir : '');

  if (lines.length > 0) summary(`### pageslens checks\n\n${lines.join('\n')}\n\n`);
  if (alignMarkdown) summary(`${alignMarkdown}\n`);

  let diffMarkdown: string | undefined;
  let accessChanges = 0;

  if (pr && flag('diff')) {
    const base = baseRef(
      input('base'),
      pr,
      (branch) =>
        git('rev-parse', '--verify', '--quiet', '--end-of-options', `refs/remotes/origin/${branch}`)
          .status === 0,
    );
    const head = headRef(pr, (sha) => git('cat-file', '-e', `${sha}^{commit}`).status === 0);
    const args = ['diff', '--merge-base', base, head, path];
    const failOn = input('fail-on');
    const markdown = join(dir, 'diff.md');
    const failArgs = failOn ? ['--fail-on', failOn] : [];
    const code = pageslens(cli, [...args, '--format', 'markdown', ...failArgs], markdown);
    if (code > 1) {
      failures.push(`diff couldn't run (exit code ${code})`);
      if (git('rev-parse', '--is-shallow-repository').stdout.trim() === 'true') {
        error(
          'The checkout is shallow, so the merge base may be missing. Check out with `fetch-depth: 0`.',
        );
      }
    } else {
      const json = join(dir, 'diff.json');
      pageslens(cli, [...args, '--format', 'json'], json);
      const { wider, narrower, neutral } = readJson<{
        summary: { wider: number; narrower: number; neutral: number };
      }>(json).summary;
      setOutput('wider', wider);
      setOutput('narrower', narrower);
      setOutput('neutral', neutral);
      accessChanges = wider + narrower + neutral;
      diffMarkdown = readFileSync(markdown, 'utf8');
      summary(`${diffMarkdown}\n`);
      if (code === 1)
        failures.push(`diff --fail-on ${failOn}: ${wider} wider, ${narrower} narrower`);
    }
    if (fork && flag('comment')) {
      notice(
        'Pull requests from forks get a read-only token, so the access changes are in the job summary, not a comment.',
      );
    }
  }

  const body = pr ? commentBody(diffMarkdown, alignMarkdown) : undefined;
  if (body) {
    const file = join(dir, 'comment.md');
    writeFileSync(file, body);
    setOutput('comment-file', file);
    setOutput('has-changes', accessChanges + alignFindings > 0);
  }

  setOutput('fork', fork);
  writeFileSync(join(dir, 'failures.txt'), failures.join('\n'));
}

class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function api<T>(method: string, path: string, body?: object): Promise<T> {
  const response = await fetch(`${env('GITHUB_API_URL')}${path}`, {
    method,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${env('INPUT_TOKEN')}`,
      'x-github-api-version': '2022-11-28',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    throw new ApiError(
      `${method} ${path}: ${response.status} ${await response.text()}`,
      response.status,
    );
  }
  return (await response.json()) as T;
}

/** Creates or updates the comment (access changes, and the alignment with `solution`); a token that can't comment is a notice, not a failure. */
async function comment(): Promise<void> {
  const pr = pullRequest(readEvent());
  if (!pr) return;
  const body = readFileSync(env('COMMENT_FILE'), 'utf8');
  const marker = body.split('\n', 1)[0] ?? '';
  const repo = `/repos/${env('GITHUB_REPOSITORY')}`;
  try {
    const comments: IssueComment[] = [];
    for (let page = 1; ; page++) {
      const batch = await api<IssueComment[]>(
        'GET',
        `${repo}/issues/${pr.number}/comments?per_page=100&page=${page}`,
      );
      comments.push(...batch);
      if (batch.length < 100) break;
    }
    const existing = findComment(comments, marker);
    const action = commentAction(existing, env('HAS_CHANGES') === 'true');
    let posted: IssueComment | undefined;
    if (existing && action === 'update') {
      posted = await api('PATCH', `${repo}/issues/comments/${existing.id}`, { body });
    } else if (action === 'create') {
      posted = await api('POST', `${repo}/issues/${pr.number}/comments`, { body });
    }
    if (posted) {
      console.log(`${action === 'update' ? 'Updated' : 'Posted'} ${posted.html_url}`);
      setOutput('comment-url', posted.html_url);
    } else {
      console.log('Nothing to report and no earlier comment, so nothing was posted.');
    }
  } catch (cause) {
    if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) {
      notice(
        "The token can't comment on this pull request (it needs `pull-requests: write`), so the access changes are in the job summary only.",
      );
      console.log(cause.message);
      return;
    }
    throw cause;
  }
}

/** Fails the job if any command failed, after every other step has run. */
function finish(): void {
  const file = join(env('RUNNER_TEMP'), 'pageslens', 'failures.txt');
  const failures = existsSync(file)
    ? readFileSync(file, 'utf8').split('\n').filter(Boolean)
    : ["the run step didn't finish"];
  for (const failure of failures) error(failure);
  if (failures.length > 0) process.exitCode = 1;
}

const STEPS: Record<string, () => void | Promise<void>> = { run, comment, finish };

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const step = STEPS[process.argv[2] ?? ''];
  if (!step) throw new Error(`Unknown step: ${process.argv[2]}`);
  await step();
}
