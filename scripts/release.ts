// Prepares a release in one command: `npm run release -- <x.y.z>`. From an up-to-date, clean
// `main`, it creates `release/<x.y.z>`, bumps the version with `npm version`, points the action
// examples in the README and docs at the new tag, commits "Release <x.y.z>" and pushes the branch.
// The pull request, the GitHub release and the npm approval stay with the maintainer (README,
// "Releasing").
// Node.js runs this file directly (type stripping), so it uses only erasable TypeScript and no
// dependencies. Commands run with argument arrays, never through a shell.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPOSITORY = 'OOlashyn/pageslens';
// The files with action examples (`OOlashyn/pageslens@v<x.y.z>`) that follow the release
const ACTION_EXAMPLES = ['README.md', 'docs/ci.md', 'docs/alm.md'];
const VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

export class ReleaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReleaseError';
  }
}

export interface Options {
  version: string;
  dryRun: boolean;
  pr: boolean;
}

const USAGE = 'usage: npm run release -- <x.y.z> [--dry-run] [--pr]';

export function parseArgs(args: readonly string[]): Options {
  const flags = args.filter((a) => a.startsWith('--'));
  const versions = args.filter((a) => !a.startsWith('--'));
  const unknown = flags.filter((f) => f !== '--dry-run' && f !== '--pr');
  if (unknown.length > 0) throw new ReleaseError(`unknown option ${unknown[0]!}\n${USAGE}`);
  if (versions.length !== 1) throw new ReleaseError(USAGE);
  const version = versions[0]!.replace(/^v/, '');
  if (!VERSION.test(version)) {
    throw new ReleaseError(`"${versions[0]!}" isn't a version like 0.11.0 or 0.11.0-beta.1`);
  }
  return { version, dryRun: flags.includes('--dry-run'), pr: flags.includes('--pr') };
}

export function isPrerelease(version: string): boolean {
  return VERSION.exec(version)?.[4] !== undefined;
}

/**
 * Whether `next` comes after `current`: a higher x.y.z, or the same x.y.z as a pre-release of it
 * (0.11.0-beta.1 → 0.11.0). Pre-release labels are compared as text.
 */
export function isNewer(next: string, current: string): boolean {
  const a = VERSION.exec(next);
  const b = VERSION.exec(current);
  if (!a || !b) return false;
  for (let i = 1; i <= 3; i++) {
    const diff = Number(a[i]) - Number(b[i]);
    if (diff !== 0) return diff > 0;
  }
  const [pa, pb] = [a[4], b[4]];
  if (pb === undefined) return false;
  if (pa === undefined) return true;
  return pa > pb;
}

/**
 * A file with its action examples and version note on `next`: `OOlashyn/pageslens@v<old>`
 * and "`v<old>` runs exactly pageslens <old>".
 */
export function bumpActionExamples(text: string, current: string, next: string): string {
  return text
    .replaceAll(`${REPOSITORY}@v${current}`, `${REPOSITORY}@v${next}`)
    .replaceAll(
      `\`v${current}\` runs exactly pageslens ${current}`,
      `\`v${next}\` runs exactly pageslens ${next}`,
    );
}

function run(command: string, args: string[], options: { capture?: boolean } = {}): string {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.error) throw new ReleaseError(`${command} couldn't run: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = options.capture ? `: ${result.stderr.trim()}` : '';
    throw new ReleaseError(`${command} ${args.join(' ')} failed${detail}`);
  }
  return options.capture ? result.stdout.trim() : '';
}

const git = (...args: string[]) => run('git', args, { capture: true });

/** Runs a step that changes something, or only prints it with --dry-run. */
function step(dryRun: boolean, label: string, action: () => void): void {
  console.log(`${dryRun ? '[dry run] ' : ''}${label}`);
  if (!dryRun) action();
}

function release(options: Options): void {
  const { version, dryRun } = options;
  const branch = `release/${version}`;
  const notes = `specs/releases/${version}.md`;
  const current = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version;

  // Everything is checked before anything changes
  if (!isNewer(version, current)) {
    throw new ReleaseError(`${version} doesn't come after the current version, ${current}`);
  }
  if (git('status', '--porcelain') !== '') {
    throw new ReleaseError('the working tree has changes: commit or stash them first');
  }
  const head = git('branch', '--show-current');
  if (head !== 'main') throw new ReleaseError(`on ${head || 'a detached HEAD'}: switch to main`);
  git('fetch', '--quiet', 'origin', 'main');
  if (git('rev-parse', 'HEAD') !== git('rev-parse', 'origin/main')) {
    throw new ReleaseError("main isn't the same as origin/main: pull (or push) first");
  }
  if (git('branch', '--list', branch) !== '') throw new ReleaseError(`${branch} already exists`);
  if (git('ls-remote', '--heads', 'origin', `refs/heads/${branch}`) !== '') {
    throw new ReleaseError(`${branch} already exists on origin`);
  }
  if (!existsSync(notes)) {
    throw new ReleaseError(`there are no release notes at ${notes}: merge them into main first`);
  }
  // `npm run` gives the npm it runs as; run it with this Node, so Windows needs no shell
  const npm = process.env.npm_execpath;
  if (!npm) throw new ReleaseError(`run it through npm: ${USAGE}`);

  console.log(`Releasing ${version} (now ${current})`);
  step(dryRun, `git switch -c ${branch}`, () => git('switch', '--quiet', '-c', branch));
  try {
    step(dryRun, `npm version ${version} --no-git-tag-version`, () =>
      run(process.execPath, [npm, 'version', version, '--no-git-tag-version']),
    );
    const files = ['package.json', 'package-lock.json'];
    // A pre-release doesn't become the version in the examples
    if (!isPrerelease(version)) {
      for (const file of ACTION_EXAMPLES) {
        step(dryRun, `${file}: action examples to v${version}`, () => {
          writeFileSync(file, bumpActionExamples(readFileSync(file, 'utf8'), current, version));
        });
      }
      files.push(...ACTION_EXAMPLES);
    }
    step(dryRun, `git commit -m "Release ${version}"`, () => {
      git('add', '--', ...files);
      git('commit', '--quiet', '-m', `Release ${version}`);
    });
    step(dryRun, `git push -u origin ${branch}`, () =>
      run('git', ['push', '--quiet', '-u', 'origin', branch]),
    );
    if (options.pr) {
      step(dryRun, `gh pr create --base main --head ${branch}`, () =>
        run('gh', [
          'pr',
          'create',
          '--base',
          'main',
          '--head',
          branch,
          '--title',
          `Release ${version}`,
          '--body-file',
          notes,
        ]),
      );
    }
  } catch (error) {
    console.error(
      `\nStopped on ${branch}. To start again: git switch main && git branch -D ${branch} (and git checkout -- . if files changed)`,
    );
    throw error;
  }

  const prerelease = isPrerelease(version) ? ' --prerelease' : '';
  console.log(`
Next:
1. ${options.pr ? 'Merge the pull request' : `Open the pull request and merge it: https://github.com/${REPOSITORY}/compare/main...${branch}?expand=1`}
2. Create the GitHub release on main:
   gh release create v${version} --target main --title "pageslens ${version}" --notes-file ${notes}${prerelease}
3. Approve the staged version with 2FA: npm stage list pageslens, then npm stage approve <stage-id>`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    release(parseArgs(process.argv.slice(2)));
  } catch (error) {
    if (!(error instanceof ReleaseError)) throw error;
    console.error(`error: ${error.message}`);
    process.exitCode = 1;
  }
}
