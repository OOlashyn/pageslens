import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import { formatText } from '../../src/diff/format/text.js';
import type { DiffInputs } from '../../src/diff/inputs.js';
import { plain } from '../../src/graph/describe.js';
import { diffResult } from '../helpers.js';

// A throwaway repository with the grants pair committed under portal/, the classic pair under
// classic/, the solution pair under solution/src/ and the deployment settings pair under stage/
// (with stage/new.json in head only):
//   empty  (main)     README only
//   base   (main)     the base sites
//   main   (main)     + a permission only main has
//   feature (from base) the head sites
const FIXTURES = resolve('test/fixtures/diff');
let repo = '';
const commits: Record<string, string> = {};

function git(...args: string[]): string {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

async function placeSites(side: 'base' | 'head') {
  await rm(join(repo, 'portal'), { recursive: true, force: true });
  await rm(join(repo, 'classic'), { recursive: true, force: true });
  await cp(join(FIXTURES, 'grants', side), join(repo, 'portal'), { recursive: true });
  await cp(join(FIXTURES, 'classic', side), join(repo, 'classic'), { recursive: true });
  // A pac solution init project, as pac solution clone writes it: the solution is in src/
  await rm(join(repo, 'solution'), { recursive: true, force: true });
  await cp(join(FIXTURES, 'solution', side), join(repo, 'solution', 'src'), { recursive: true });
  await rm(join(repo, 'stage'), { recursive: true, force: true });
  await cp(join(FIXTURES, 'deployment-settings', side), join(repo, 'stage'), { recursive: true });
  if (side === 'head') await cp(join(repo, 'stage/prod.json'), join(repo, 'stage/new.json'));
}

function commit(name: string) {
  git('add', '-A');
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-q', '-m', name);
  commits[name] = git('rev-parse', 'HEAD');
}

beforeAll(async () => {
  repo = await mkdtemp(join(tmpdir(), 'pageslens-git-'));
  git('init', '-q', '-b', 'main');
  git('config', 'core.autocrlf', 'false');
  await writeFile(join(repo, 'README.md'), 'test\n');
  commit('empty');
  await placeSites('base');
  commit('base');
  git('switch', '-q', '-c', 'feature');
  await placeSites('head');
  commit('feature');
  git('switch', '-q', 'main');
  await writeFile(
    join(repo, 'portal/.powerpages-site/table-permissions/Main-Only.tablepermission.yml'),
    [
      'adx_entitypermission_webrole:',
      '- 00000000-0000-0000-0001-000000000002',
      'entitylogicalname: dwcrm_mainonly',
      'entityname: Main Only',
      'id: 00000000-0000-0000-0002-000000000099',
      'read: true',
      'scope: 756150000',
      '',
    ].join('\n'),
  );
  commit('main');
  git('switch', '-q', 'feature');
});

afterAll(async () => {
  if (repo) await rm(repo, { recursive: true, force: true });
});

const diff = (inputs: Omit<DiffInputs, 'cwd'> & { cwd?: string }) =>
  diffResult({ cwd: repo, ...inputs });

describe('diff at git refs', () => {
  it("finds a solution project's src/ at each ref", async () => {
    const result = await diff({ base: 'main', head: 'feature', path: 'solution', mergeBase: true });
    expect(result.changes.map((c) => c.kind)).toEqual(['setting-wider', 'webapi-disabled']);
    expect(result.head).toMatchObject({ path: 'solution/src', format: 'solution' });
  });

  it('reads the site folder at each ref, as committed', async () => {
    const result = await diff({ base: commits.base!, head: 'feature', path: 'portal' });
    expect(result.summary).toEqual({ wider: 8, narrower: 4, neutral: 7 });
    expect(result.base).toMatchObject({
      ref: commits.base,
      commit: commits.base,
      path: 'portal/.powerpages-site',
      layout: 'code',
    });
    expect(result.head).toMatchObject({ ref: 'feature', commit: commits.feature });
  });

  it('reads a classic site at a ref', async () => {
    const result = await diff({ base: commits.base!, head: 'feature', path: 'classic' });
    expect(result.summary).toEqual({ wider: 1, narrower: 1, neutral: 1 });
    expect(result.head).toMatchObject({ path: 'classic', layout: 'classic' });
  });

  it('takes the site folder relative to the current folder', async () => {
    const result = await diff({ base: commits.base!, head: 'feature', cwd: join(repo, 'portal') });
    expect(result.summary.wider).toBe(8);
    expect(result.head.path).toBe('.powerpages-site');
  });

  it('shows commits added to base since the branch, unless --merge-base is given', async () => {
    const exact = await diff({ base: 'main', head: 'feature', path: 'portal' });
    expect(exact.changes.map((c) => plain(c.message))).toContain(
      'Authenticated Users lost read on dwcrm_mainonly (global scope) from "Main Only" (removed)',
    );
    const merged = await diff({ base: 'main', head: 'feature', path: 'portal', mergeBase: true });
    expect(merged.summary).toEqual({ wider: 8, narrower: 4, neutral: 7 });
    expect(merged.base).toMatchObject({ ref: 'main', commit: commits.base, mergeBase: true });
    expect(formatText(merged)).toMatch(
      new RegExp(
        `^Access changes in portal/\\.powerpages-site, main \\(merge base ${commits.base!.slice(0, 7)}\\) → feature `,
      ),
    );
  });

  it('shows a commit id given as a ref once, short', async () => {
    const short = (name: string) => commits[name]!.slice(0, 7);
    const result = await diff({
      base: 'main',
      head: commits.feature!,
      path: 'portal',
      mergeBase: true,
    });
    expect(formatText(result)).toMatch(
      new RegExp(`, main \\(merge base ${short('base')}\\) → ${short('feature')}: `),
    );
    const abbreviated = await diff({ base: short('base'), head: 'feature', path: 'portal' });
    expect(formatText(abbreviated)).toMatch(new RegExp(`, ${short('base')} → feature \\(`));
  });

  it('reads a side with no site as an empty site, with a note', async () => {
    const result = await diff({ base: commits.empty!, head: 'feature', path: 'portal' });
    expect(result.base).toEqual({ ref: commits.empty, commit: commits.empty, path: 'portal' });
    expect(result.summary.narrower).toBe(0);
    expect(result.changes.filter((c) => c.kind === 'role-added')).toHaveLength(5);
    expect(formatText(result)).toContain('Note: base has no site at portal; everything is new.');
  });

  it('compares a ref with the working tree, so uncommitted edits show', async () => {
    const file = join(
      repo,
      'portal/.powerpages-site/table-permissions/Survey-New-Role.tablepermission.yml',
    );
    const committed = await readFile(file, 'utf8');
    try {
      await writeFile(file, committed.replace('write: false', 'write: true'));
      const result = await diff({ base: 'feature', head: 'portal' });
      expect(result.changes.map((c) => plain(c.message))).toEqual([
        'New Role gained write on dwcrm_survey (global scope) from "Survey - New Role" (the privilege was turned on)',
      ]);
      expect(formatText(result)).toMatch(
        /^Access changes in portal\/\.powerpages-site, feature \(\w{7}\) → the working tree: 1 wider/,
      );
    } finally {
      await writeFile(file, committed);
    }
  });

  it('reads the deployment settings file at each ref', async () => {
    const result = await diff({
      base: commits.base!,
      head: 'feature',
      path: 'stage',
      settings: 'stage/prod.json',
    });
    expect(result.changes.map((c) => `${c.class} ${c.kind}`)).toEqual([
      'wider webapi-enabled',
      'narrower setting-narrower',
    ]);
    expect(plain(result.changes[1]!.message)).toBe(
      'Authentication/Registration/Enabled turned off: was "true" from environment variable dwcrm_Registration in stage/prod.json at ' +
        commits.base +
        ', now "false" from environment variable dwcrm_Registration in stage/prod.json at feature',
    );
    // Without the file, both sides are unknown and the same variable: no change
    expect((await diff({ base: commits.base!, head: 'feature', path: 'stage' })).changes).toEqual(
      [],
    );
  });

  it('reads a settings file missing on one side as empty, and refuses one on neither', async () => {
    const result = await diff({
      base: commits.base!,
      head: 'feature',
      path: 'stage',
      settings: 'stage/new.json',
    });
    expect(result.changes.map((c) => `${c.class} ${c.kind}`)).toEqual([
      'wider webapi-enabled',
      'narrower setting-narrower',
    ]);
    expect(plain(result.changes[1]!.message)).toContain(
      "it came from environment variable dwcrm_Registration, which a download doesn't include, and stage/new.json gives it no value",
    );
    await expect(
      diff({ base: commits.base!, head: 'feature', path: 'stage', settings: 'stage/none.json' }),
    ).rejects.toThrow("the deployment settings file stage/none.json isn't on either side");
  });

  it('refuses an argument that is both a folder and a ref', async () => {
    await mkdir(join(repo, 'main'));
    try {
      await expect(diff({ base: 'main', head: 'feature' })).rejects.toThrow(
        '"main" is both a folder and a git ref: write ./main for the folder, or refs/heads/main for the ref',
      );
      // ./main is the folder, which has no site
      await expect(diff({ base: './main', head: 'portal' })).rejects.toThrow(
        /No \.powerpages-site folder, website\.yml or unpacked solution/,
      );
    } finally {
      await rm(join(repo, 'main'), { recursive: true });
    }
  });

  it('refuses a path outside the repository', async () => {
    await expect(diff({ base: 'main', head: 'feature', path: '..' })).rejects.toThrow(
      /isn't inside the repository/,
    );
  });

  it('never passes an argument that looks like an option to git', async () => {
    await expect(diff({ base: '--output=x', head: 'feature' })).rejects.toThrow(
      '"--output=x" is neither a folder nor a git commit',
    );
  });
});
