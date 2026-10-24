import { describe, expect, it } from 'vite-plus/test';
import { ExitCode, run } from '../../src/cli.js';
import { diffSites, summarize } from '../../src/diff/compare.js';
import { formatJson } from '../../src/diff/format/json.js';
import { formatMarkdown, MARKDOWN_MAX_LENGTH } from '../../src/diff/format/markdown.js';
import { formatText } from '../../src/diff/format/text.js';
import { loadSides } from '../../src/diff/inputs.js';
import type { Change, DiffResult } from '../../src/diff/types.js';
import { plain } from '../../src/graph/describe.js';

/** Compares `test/fixtures/diff/<name>/base` with `.../head` (or the other way round). */
async function diffCase(name: string, reverse = false): Promise<DiffResult> {
  const [from, to] = reverse ? ['head', 'base'] : ['base', 'head'];
  const sides = await loadSides({
    base: `test/fixtures/diff/${name}/${from}`,
    head: `test/fixtures/diff/${name}/${to}`,
    cwd: process.cwd(),
  });
  const changes = diffSites(sides.base.site, sides.head.site);
  return { base: sides.base.side, head: sides.head.side, changes, summary: summarize(changes) };
}

const kinds = (result: DiffResult) => result.changes.map((c) => `${c.class} ${c.kind}`);
const messages = (result: DiffResult) => result.changes.map((c) => plain(c.message));
const find = (result: DiffResult, text: string): Change =>
  result.changes.find((c) => plain(c.message).includes(text))!;

async function cli(...argv: string[]) {
  let out = '';
  let err = '';
  const code = await run(argv, { out: (text) => (out += text), err: (text) => (err += text) });
  return { code, out, err };
}

describe('diff: grants', async () => {
  const result = await diffCase('grants');

  it('classifies every grant rule as the fixture comments say', () => {
    expect(kinds(result)).toEqual([
      'wider grant-gained', // Authenticated Users, new permission
      'wider grant-gained', // Customers, incident contact → global
      'wider grant-gained', // Customers, dwcrm_order contact → account
      'wider grant-rows-changed', // Customers, contact relationship
      'wider grant-gained', // Customers, chain now complete
      'wider grant-gained', // New Role
      'wider grant-gained', // Partner added to "Case - Customers"
      'wider grant-gained', // Partner inherited by "Case Task - Inherited"
      'narrower grant-lost', // Anonymous Users, permission removed
      'narrower grant-lost', // Customers, write turned off
      'narrower grant-lost', // Customers, account global → account
      'narrower grant-lost', // Old Role removed
      'neutral grant-source-changed', // product, another permission with the same access
      'neutral grant-gained', // already has it at global scope
      'neutral role-renamed',
      'neutral role-added',
      'neutral role-removed',
      'neutral role-recreated',
      'neutral grant-source-changed', // "Contact - Self" renamed
    ]);
    expect(result.summary).toEqual({ wider: 8, narrower: 4, neutral: 7 });
  });

  it('names the role, privileges, scope and permission in the same words as test', () => {
    expect(messages(result)[0]).toBe(
      'Authenticated Users gained read, write on contact (global scope) from "Contact - Authenticated Users Global Write" (Web API enabled) (also reported by lint: global-write-authenticated)',
    );
    expect(result.changes[0]!.lint).toEqual(['global-write-authenticated']);
    expect(find(result, 'knowledgearticle')).toMatchObject({
      role: { name: 'Anonymous Users', audience: 'anonymous' },
      table: 'knowledgearticle',
      scope: 'global',
      privileges: ['read'],
      webApiEnabled: false,
      sources: [
        {
          side: 'base',
          name: 'Articles - Anonymous Read',
          file: 'table-permissions/Articles-Anonymous-Read.tablepermission.yml',
        },
      ],
    });
  });

  it('shows a scope change on one permission as one line', () => {
    expect(find(result, 'on incident')).toMatchObject({
      kind: 'grant-gained',
      scope: 'global',
      fromScope: 'contact',
    });
    expect(plain(find(result, 'on account').message)).toBe(
      'Customers: read on account changed from global scope to account scope in "Account - Customers"',
    );
  });

  it('uses head names for renamed and recreated roles', () => {
    expect(messages(result).filter((m) => m.includes('Customer '))).toEqual([]);
    expect(find(result, 'Case Task')).toMatchObject({ role: { name: 'Partner' } });
    expect(plain(find(result, 'Case Task').message)).toContain(
      '(inherits roles from "Case - Customers")',
    );
  });

  it('turns the other way round into the opposite gains and losses', async () => {
    const reversed = await diffCase('grants', true);
    // A scope change between two non-global scopes is wider both ways
    expect(reversed.summary).toEqual({ wider: 6, narrower: 6, neutral: 7 });
    expect(plain(find(reversed, 'knowledgearticle').message)).toBe(
      'Anonymous Users gained read on knowledgearticle (global scope) from "Articles - Anonymous Read"',
    );
  });

  it('matches the text output snapshot', async () => {
    await expect(formatText(result)).toMatchFileSnapshot('__snapshots__/grants.txt');
  });

  it('matches the Markdown output snapshot', async () => {
    await expect(formatMarkdown(result)).toMatchFileSnapshot('__snapshots__/grants.md');
  });
});

describe('diff: Web API', async () => {
  const result = await diffCase('webapi');

  it('reports enabled, disabled and field changes, and nothing for a disabled table', () => {
    expect(kinds(result)).toEqual([
      'wider webapi-fields-wider',
      'wider webapi-enabled',
      'wider webapi-fields-wider',
      'narrower webapi-fields-narrower',
      'narrower webapi-disabled',
      'narrower webapi-fields-narrower',
    ]);
    expect(messages(result)).toContain(
      'the Web API is now enabled on account; callers: Authenticated Users (read)',
    );
    expect(find(result, 'emailaddress1')).toMatchObject({
      table: 'contact',
      fields: ['emailaddress1'],
    });
    expect(result.changes.some((c) => c.table === 'task')).toBe(false);
  });

  it('sorts a table anonymous can read with anonymous', () => {
    // contact is readable by Anonymous Users, so its field change comes first
    expect(result.changes[0]!.table).toBe('contact');
  });
});

describe('diff: roles', () => {
  it('reports the Authenticated Users flag moving to another role', async () => {
    const result = await diffCase('roles');
    expect(messages(result)).toEqual([
      '"Members" is now the Authenticated Users role: its grants now apply to every signed-in user',
      '"Authenticated Users" is no longer the Authenticated Users role: its grants no longer apply to every signed-in user',
    ]);
    expect(kinds(result)).toEqual([
      'wider role-audience-changed',
      'narrower role-audience-changed',
    ]);
  });
});

describe('diff: settings', () => {
  it('reads effective values with Power Pages defaults, in a fixed direction per setting', async () => {
    const result = await diffCase('settings');
    expect(messages(result)).toEqual([
      'Authentication/Registration/Enabled turned on: was "false", now not set (defaults to true)',
      'Authentication/Registration/RequiresInvitation turned off: was "true", now "false"',
      'HTTP/Access-Control-Allow-Origin now also allows https://b.example.com',
      'Webapi/error/innererror turned on: was "false", now "True"',
      'Authentication/Registration/OpenRegistrationEnabled turned off: was not set (defaults to true), now "false"',
      'HTTP/Access-Control-Allow-Origin no longer allows https://c.example.com',
    ]);
    expect(result.summary).toEqual({ wider: 4, narrower: 2, neutral: 0 });
  });
});

describe('diff: neutral changes and renames', async () => {
  const result = await diffCase('neutral');

  it('finds nothing wider or narrower when only names, files and sources change', () => {
    expect(result.summary).toEqual({ wider: 0, narrower: 0, neutral: 4 });
    expect(messages(result)).toEqual([
      'Authenticated Users has read on contact (global scope) from "Contact - Read", "Contact - Read Copy" instead of "Contact - Read" (same access)',
      'Case Workers gained read on incident (contact scope) from "Incident - Case Workers Contact" (already has it at global scope)',
      'Role "Case Worker" renamed to "Case Workers"',
      '"Incident - Case Worker" renamed to "Incident - Case Workers" (same access)',
    ]);
  });

  it('folds neutral changes in Markdown', () => {
    expect(formatMarkdown(result)).toContain('<details><summary>4 neutral changes</summary>');
  });

  it('finds no changes between a site and itself', async () => {
    const same = await loadSides({
      base: 'test/fixtures/ecoflux',
      head: 'test/fixtures/ecoflux',
      cwd: process.cwd(),
    });
    expect(diffSites(same.base.site, same.head.site)).toEqual([]);
  });
});

describe('diff: layouts', () => {
  it('compares a classic download with a code site record by record', async () => {
    const result = await diffCase('layouts');
    expect(messages(result)).toEqual([
      'Manager gained write on msdyn_customerasset (account scope) from "Assets - Manager" (the privilege was turned on)',
    ]);
    expect(result.base.layout).toBe('classic');
    expect(result.head.layout).toBe('code');
    await expect(formatMarkdown(result)).toMatchFileSnapshot('__snapshots__/layouts.md');
  });

  it('reads changes in a classic site root lists', async () => {
    const result = await diffCase('classic');
    expect(messages(result)).toEqual([
      'the Web API is now enabled on msdyn_customerasset; callers: Managers (read)',
      'Anonymous Users lost create on feedback (global scope) from "Feedback" (the role was taken off the permission)',
      'Role "Manager" renamed to "Managers"',
    ]);
    expect(find(result, 'renamed').sources).toEqual([
      {
        side: 'head',
        recordId: '00000000-0000-0000-0001-000000000003',
        name: 'Managers',
        file: 'webrole.yml',
      },
    ]);
  });
});

describe('diff output', () => {
  it('writes versioned JSON', async () => {
    const output = JSON.parse(formatJson(await diffCase('roles')));
    expect(output).toMatchObject({
      version: 1,
      base: {
        path: 'test/fixtures/diff/roles/base/.powerpages-site',
        layout: 'code',
        site: { id: '00000000-0000-0000-0000-000000000001', name: 'Diff Roles' },
      },
      summary: { wider: 1, narrower: 1, neutral: 0 },
    });
    expect(output.changes[0]).toEqual({
      class: 'wider',
      kind: 'role-audience-changed',
      message:
        '"Members" is now the Authenticated Users role: its grants now apply to every signed-in user',
      role: {
        id: '00000000-0000-0000-0001-000000000003',
        name: 'Members',
        audience: 'authenticated',
      },
      sources: [
        {
          side: 'head',
          recordId: '00000000-0000-0000-0001-000000000003',
          name: 'Members',
          file: 'web-roles/Members.webrole.yml',
        },
      ],
    });
  });

  it('says so when nothing changed', async () => {
    const result = await diffCase('neutral');
    const empty = { ...result, changes: [], summary: summarize([]) };
    expect(formatText(empty)).toBe(
      'No access changes in test/fixtures/diff/neutral/base/.powerpages-site → test/fixtures/diff/neutral/head/.powerpages-site.\n',
    );
    expect(formatMarkdown(empty)).toMatch(
      /^<!-- pageslens:diff site=.* -->\n### Access changes\n\nNo access changes in /,
    );
  });

  it('keeps Markdown under the size cap, dropping the least important parts first', async () => {
    const result = await diffCase('grants');
    const wide = result.changes.find((c) => c.class === 'wider')!;
    const narrow = result.changes.find((c) => c.class === 'narrower')!;
    const neutral = result.changes.find((c) => c.class === 'neutral')!;
    const many = (change: Change, count: number) =>
      Array.from({ length: count }, (_, i) => ({
        ...change,
        message: [...change.message, ` #${i}`],
      }));

    // Sources and neutral details go first, then narrower details
    const changes = [...many(wide, 100), ...many(narrow, 300), ...many(neutral, 400)];
    const big = { ...result, changes, summary: summarize(changes) };
    const markdown = formatMarkdown(big);
    expect(markdown.length).toBeLessThanOrEqual(MARKDOWN_MAX_LENGTH);
    expect(markdown).toContain('**100 wider, 300 narrower, 400 neutral**');
    expect(markdown).not.toContain('Where these come from');
    expect(markdown).toContain('_400 neutral changes not shown');
    expect(markdown.match(/^- /gm)).toHaveLength(400);

    // Wider lines are kept as far as they fit
    const huge = [...many(wide, 1000), ...many(narrow, 10)];
    const capped = formatMarkdown({ ...result, changes: huge, summary: summarize(huge) });
    expect(capped.length).toBeLessThanOrEqual(MARKDOWN_MAX_LENGTH);
    expect(capped).toContain('**1000 wider, 10 narrower, 0 neutral**');
    expect(capped).toContain('_10 narrower changes not shown');
    const shown = capped.match(/^- /gm)!.length;
    expect(capped).toContain(
      `and ${1000 - shown} more wider changes: run \`pageslens diff\` locally or see the JSON artifact`,
    );
  });

  it('escapes Markdown in names', async () => {
    const result = await diffCase('roles');
    const change = { ...result.changes[0]!, message: [{ strong: 'A*B_<i>' }, ' x'] };
    const markdown = formatMarkdown({ ...result, changes: [change], summary: summarize([change]) });
    expect(markdown).toContain('- **A\\*B\\_\\<i\\>** x');
  });

  it('keeps names from mentioning anyone', async () => {
    const result = await diffCase('roles');
    const change = { ...result.changes[0]!, message: [{ strong: '@org/team' }, ' x'] };
    const markdown = formatMarkdown({ ...result, changes: [change], summary: summarize([change]) });
    expect(markdown).toContain('- **@&#8203;org/team** x');
  });
});

describe('cli diff', () => {
  it('exits 0 whatever it finds, and 1 with --fail-on', async () => {
    const pair = ['test/fixtures/diff/neutral/base', 'test/fixtures/diff/neutral/head'];
    expect((await cli('diff', ...pair)).code).toBe(ExitCode.Ok);
    expect((await cli('diff', ...pair, '--fail-on', 'wider')).code).toBe(ExitCode.Ok);
    expect((await cli('diff', ...pair, '--fail-on', 'any')).code).toBe(ExitCode.Findings);
    const roles = ['test/fixtures/diff/roles/base', 'test/fixtures/diff/roles/head'];
    expect((await cli('diff', ...roles, '--fail-on', 'wider')).code).toBe(ExitCode.Findings);
  });

  it('prints the chosen format', async () => {
    const pair = ['test/fixtures/diff/roles/base', 'test/fixtures/diff/roles/head'];
    expect((await cli('diff', ...pair, '--format', 'markdown')).out).toMatch(
      /^<!-- pageslens:diff /,
    );
    expect(JSON.parse((await cli('diff', ...pair, '--format', 'json')).out).version).toBe(1);
  });

  it('exits 2 for arguments it cannot use', async () => {
    const neither = await cli('diff', 'no-such-folder-or-ref', 'test/fixtures/broken');
    expect(neither).toMatchObject({ code: ExitCode.Usage });
    expect(neither.err).toBe(
      'error: "no-such-folder-or-ref" is neither a folder nor a git commit\n',
    );
    const path = await cli('diff', 'test/fixtures/broken', 'test/fixtures/broken', 'site');
    expect(path.err).toBe('error: [path] can only be given with two git refs\n');
    const mergeBase = await cli(
      'diff',
      '--merge-base',
      'test/fixtures/broken',
      'test/fixtures/broken',
    );
    expect(mergeBase.err).toBe('error: --merge-base needs a git ref for both base and head\n');
    const notSite = await cli('diff', 'test/fixtures', 'test/fixtures/broken');
    expect(notSite.code).toBe(ExitCode.Usage);
    expect(notSite.err).toMatch(/No \.powerpages-site folder or website\.yml found/);
  });
});
