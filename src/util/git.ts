import { spawn } from 'node:child_process';

// Refs come from pull requests, so git always gets an argument array (never a shell) and
// `--end-of-options` before anything a user typed. No ref starts with `-`, so an argument that
// does is never passed to git at all.

/** git failed to start, or exited with an error the caller didn't expect. */
export class GitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitError';
  }
}

interface GitResult {
  code: number;
  stdout: Buffer;
  stderr: string;
}

function runGit(cwd: string, args: string[]): Promise<GitResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.on('error', (error) => reject(new GitError(`can't run git: ${error.message}`)));
    child.on('close', (code) =>
      resolve({
        code: code ?? 1,
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr).toString('utf8').trim(),
      }),
    );
  });
}

/** The commit `ref` names, or undefined when it names none (or this isn't a repository). */
export async function resolveCommit(cwd: string, ref: string): Promise<string | undefined> {
  if (ref.startsWith('-')) return undefined;
  const result = await runGit(cwd, [
    'rev-parse',
    '--verify',
    '--quiet',
    '--end-of-options',
    `${ref}^{commit}`,
  ]).catch(() => undefined);
  return result?.code === 0 ? result.stdout.toString('utf8').trim() : undefined;
}

/** `main` → `refs/heads/main`, or undefined when `ref` isn't a branch or tag name. */
export async function fullRefName(cwd: string, ref: string): Promise<string | undefined> {
  if (ref.startsWith('-')) return undefined;
  // Without --verify, git before 2.43 prints --end-of-options back instead of honouring it
  const result = await runGit(cwd, [
    'rev-parse',
    '--verify',
    '--quiet',
    '--symbolic-full-name',
    '--end-of-options',
    ref,
  ]).catch(() => undefined);
  const name = result?.code === 0 ? result.stdout.toString('utf8').trim() : '';
  return name.startsWith('refs/') ? name : undefined;
}

/** The repository's top folder, as git prints it (forward slashes). */
export async function repositoryRoot(cwd: string): Promise<string | undefined> {
  const result = await runGit(cwd, ['rev-parse', '--show-toplevel']).catch(() => undefined);
  return result?.code === 0 ? result.stdout.toString('utf8').trim() : undefined;
}

export async function mergeBase(cwd: string, a: string, b: string): Promise<string> {
  const result = await runGit(cwd, ['merge-base', '--end-of-options', a, b]);
  if (result.code !== 0) {
    throw new GitError(`no merge base between ${a} and ${b}`);
  }
  return result.stdout.toString('utf8').trim();
}

export interface TreeFile {
  /** Path from the repository root, `/`-separated. */
  path: string;
  blob: string;
}

/** Every file (blob) under `path` at `commit`, path from the repository root. */
export async function listTree(cwd: string, commit: string, path: string): Promise<TreeFile[]> {
  // Literal pathspecs: a folder named `*` or `:(glob)x` is just a folder
  const args = ['--literal-pathspecs', 'ls-tree', '-r', '-z', '--full-tree', commit];
  if (path) args.push('--', path);
  const result = await runGit(cwd, args);
  if (result.code !== 0) throw new GitError(`git ls-tree failed: ${result.stderr}`);
  const files: TreeFile[] = [];
  for (const entry of result.stdout.toString('utf8').split('\0')) {
    // `<mode> SP <type> SP <object> TAB <path>`; symlinks (120000) and submodules aren't files
    const match = /^(?<mode>\d+) (?<type>\w+) (?<blob>[0-9a-f]+)\t(?<path>.*)$/s.exec(entry);
    if (match?.groups?.type !== 'blob' || match.groups.mode === '120000') continue;
    files.push({ path: match.groups.path!, blob: match.groups.blob! });
  }
  return files;
}

/**
 * Reads blobs through one `git cat-file --batch` process: write an object id, read back
 * `<id> <type> <size>\n<content>\n`. Requests are answered in order.
 */
export class BlobReader {
  private readonly child;
  private buffer = Buffer.alloc(0);
  private readonly pending: {
    resolve: (content: Buffer) => void;
    reject: (error: Error) => void;
  }[] = [];
  private failure: Error | undefined;

  constructor(cwd: string) {
    this.child = spawn('git', ['cat-file', '--batch'], {
      cwd,
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    this.child.stdout.on('data', (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.drain();
    });
    const fail = (error: Error) => {
      this.failure = error;
      for (const request of this.pending.splice(0)) request.reject(error);
    };
    this.child.on('error', (error) => fail(new GitError(`can't run git: ${error.message}`)));
    this.child.on('close', () => fail(new GitError('git cat-file stopped')));
  }

  read(blob: string): Promise<Buffer> {
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((resolve, reject) => {
      this.pending.push({ resolve, reject });
      this.child.stdin.write(`${blob}\n`);
    });
  }

  close(): void {
    this.child.stdin.end();
  }

  private drain(): void {
    for (;;) {
      const request = this.pending[0];
      const newline = this.buffer.indexOf(0x0a);
      if (!request || newline < 0) return;
      const header = this.buffer.subarray(0, newline).toString('utf8');
      const match = /^\S+ (?<type>\S+) (?<size>\d+)$/.exec(header);
      if (!match?.groups) {
        this.pending.shift();
        this.buffer = this.buffer.subarray(newline + 1);
        request.reject(new GitError(`git cat-file: ${header}`));
        continue;
      }
      const size = Number(match.groups.size);
      const end = newline + 1 + size;
      if (this.buffer.length < end + 1) return;
      const content = Buffer.from(this.buffer.subarray(newline + 1, end));
      this.buffer = this.buffer.subarray(end + 1);
      this.pending.shift();
      request.resolve(content);
    }
  }
}
