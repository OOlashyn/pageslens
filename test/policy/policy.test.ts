import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vite-plus/test';
import { loadSiteFolder } from '../../src/adapters/site-folder.js';
import { evaluatePolicy } from '../../src/policy/evaluate.js';
import { formatJson } from '../../src/policy/format/json.js';
import { formatText } from '../../src/policy/format/text.js';
import { loadPolicy, parsePolicy, PolicyError } from '../../src/policy/parse.js';

const broken = await loadSiteFolder('test/fixtures/broken');
const ecoflux = await loadSiteFolder('test/fixtures/ecoflux');
const brokenPolicy = await loadPolicy('.', 'test/fixtures/policies/broken.policy.yaml');
const ecofluxPolicy = await loadPolicy('.', 'test/fixtures/policies/ecoflux.policy.yaml');
const registration = await loadSiteFolder('test/fixtures/registration');
const registrationPolicy = await loadPolicy('.', 'test/fixtures/policies/registration.policy.yaml');
const chains = await loadSiteFolder('test/fixtures/parent-chains');
const chainsPolicy = await loadPolicy('.', 'test/fixtures/policies/parent-chains.policy.yaml');

const checkOf = (section: 'access' | 'webapi' | 'settings' | 'pages', text: string) =>
  parsePolicy(`${section}:\n  - ${text}\n`, 'p.yaml').statements[0]!.check;

/** The problems a policy text is rejected with. */
function problems(text: string): string[] {
  try {
    parsePolicy(text, 'p.yaml');
  } catch (error) {
    if (error instanceof PolicyError) return error.problems;
    throw error;
  }
  return [];
}

describe('parsePolicy', () => {
  it('reads every access statement shape', () => {
    expect(checkOf('access', 'anonymous cannot create, write any table')).toEqual({
      kind: 'cannot',
      who: { kind: 'anonymous' },
      privileges: ['create', 'write'],
      table: { kind: 'any' },
    });
    expect(checkOf('access', 'role "Case Manager" can read Incident at contact scope')).toEqual({
      kind: 'can',
      who: { kind: 'role', name: 'Case Manager' },
      privileges: ['read'],
      table: { kind: 'table', name: 'incident' },
      scope: 'contact',
    });
    expect(checkOf('access', 'only "A", authenticated can delete account')).toEqual({
      kind: 'only',
      who: [{ kind: 'role', name: 'A' }, { kind: 'authenticated' }],
      privileges: ['delete'],
      table: { kind: 'table', name: 'account' },
    });
    expect(checkOf('access', 'nobody can appendto contact')).toMatchObject({ kind: 'nobody' });
  });

  it('reads under and except under', () => {
    expect(
      checkOf('access', 'authenticated can read task under Incident at contact scope'),
    ).toEqual({
      kind: 'can',
      who: { kind: 'authenticated' },
      privileges: ['read'],
      table: { kind: 'table', name: 'task' },
      under: { table: 'incident', scope: 'contact' },
    });
    expect(checkOf('access', 'nobody can read task at parent scope except under incident')).toEqual(
      {
        kind: 'nobody',
        privileges: ['read'],
        table: { kind: 'table', name: 'task' },
        scope: 'parent',
        except: { table: 'incident' },
      },
    );
    expect(problems('access:\n  - authenticated can read task except under incident\n')).toEqual([
      'p.yaml:2: "except under" only goes in "cannot", "only" and "nobody": authenticated can read task except under incident',
    ]);
    expect(
      problems('access:\n  - authenticated can read task at parent scope under incident\n')[0],
    ).toMatch(/"under" already means parent scope: leave out "at parent scope" before it/);
    expect(problems('access:\n  - nobody can read task except incident\n')[0]).toMatch(
      /expected "under", found "incident"/,
    );
  });

  it('reads Web API and settings statements', () => {
    expect(checkOf('webapi', 'fields are explicit')).toEqual({ kind: 'fields-explicit' });
    expect(checkOf('webapi', 'only contact, incident are enabled')).toEqual({
      kind: 'only-enabled',
      tables: ['contact', 'incident'],
    });
    expect(checkOf('webapi', 'any table is not enabled')).toEqual({
      kind: 'not-enabled',
      table: { kind: 'any' },
    });
    expect(checkOf('webapi', 'authenticated cannot call contact')).toEqual({
      kind: 'call',
      negated: true,
      who: { kind: 'authenticated' },
      table: { kind: 'table', name: 'contact' },
    });
    expect(checkOf('settings', 'registration is invite only')).toEqual({
      kind: 'registration-invite-only',
    });
    expect(checkOf('settings', 'setting "A/B" is not "x y"')).toEqual({
      kind: 'setting',
      name: 'A/B',
      op: 'is-not',
      value: 'x y',
    });
    expect(checkOf('settings', 'setting "A/B" is not set')).toMatchObject({ op: 'is-not-set' });
  });

  it('keeps the line, id and reason of each statement', () => {
    const [first, second] = parsePolicy(
      'access:\n  - anonymous cannot read contact\n  - id: x\n    check: nobody can delete contact\n    because: audit\n',
      'p.yaml',
    ).statements;
    expect(first).toMatchObject({ line: 2, text: 'anonymous cannot read contact' });
    expect(second).toMatchObject({ line: 3, id: 'x', because: 'audit' });
  });

  it('says where and what was expected', () => {
    expect(problems('access:\n  - anonymous may read contact\n')).toEqual([
      'p.yaml:2: expected "can" or "cannot", found "may": anonymous may read contact',
    ]);
    expect(problems('access:\n  - Manager can read contact\n')[0]).toMatch(
      /found "Manager" \(write role "Manager"\)/,
    );
    expect(problems('access:\n  - anonymous cannot read contact at team scope\n')[0]).toMatch(
      /expected "global", "contact", "account", "parent" or "self", found "team"/,
    );
    expect(problems('access:\n  - anonymous cannot read contact extra\n')[0]).toMatch(
      /unexpected "extra" at the end/,
    );
  });

  it('collects every problem, including sections, keys and duplicate ids', () => {
    expect(
      problems(
        'acess:\n  - x\nwebapi:\n  - fields are hidden\n  - id: a\n    check: fields are explicit\n  - id: a\n    check: fields are explicit\n  - { check: fields are explicit, why: x }\n',
      ),
    ).toEqual([
      'p.yaml:1: unknown section "acess" (expected access, webapi, settings, pages)',
      'p.yaml:4: expected "explicit", found "hidden": fields are hidden',
      'p.yaml:9: unknown key "why" (expected check, id, because)',
      'p.yaml:7: id "a" is already used on line 5',
    ]);
  });

  it('explains a statement that starts with a quoted role name', () => {
    expect(problems('access:\n  - "Case Manager" can read incident\n')[0]).toMatch(
      /^p\.yaml:2: invalid YAML: .*needs "role" in front/,
    );
  });

  it('refuses a policy without statements, and a missing file', async () => {
    expect(problems('access: []\n')).toEqual(['p.yaml: the policy has no statements']);
    expect(problems('')).toEqual(['p.yaml: the policy has no statements']);
    await expect(loadPolicy('.', 'does-not-exist.yaml')).rejects.toThrow(/Can't read/);
    await expect(loadPolicy('test/fixtures/broken')).rejects.toThrow(
      /No pageslens\.policy\.yaml found/,
    );
  });
});

describe('evaluatePolicy', () => {
  it('passes and fails the broken fixture statements as their comments say', () => {
    const result = evaluatePolicy(brokenPolicy, broken);
    expect(result.results.map((r) => [r.statement.line, r.passed ? 'pass' : 'fail'])).toEqual([
      [4, 'fail'],
      [5, 'fail'],
      [6, 'pass'],
      [7, 'pass'],
      [8, 'fail'],
      [9, 'pass'],
      [10, 'fail'],
      [11, 'pass'],
      [12, 'fail'],
      [13, 'pass'],
      [14, 'pass'],
      [15, 'fail'],
      [16, 'pass'],
      [20, 'fail'],
      [21, 'fail'],
      [22, 'pass'],
      [23, 'fail'],
      [24, 'pass'],
      [25, 'fail'],
      [26, 'pass'],
      [28, 'fail'],
      [29, 'fail'],
      [30, 'pass'],
      [31, 'pass'],
    ]);
    expect(result.counts).toEqual({ passed: 12, failed: 12 });
  });

  it('follows parent chains in under and except under, as the comments say', () => {
    const result = evaluatePolicy(chainsPolicy, chains);
    expect(result.results.map((r) => [r.statement.line, r.passed ? 'pass' : 'fail'])).toEqual([
      [4, 'pass'],
      [5, 'pass'],
      [6, 'fail'],
      [7, 'pass'],
      [8, 'pass'],
      [9, 'pass'],
      [10, 'fail'],
      [11, 'fail'],
      [12, 'pass'],
      [13, 'pass'],
      [14, 'pass'],
      [15, 'fail'],
      [16, 'fail'],
      [17, 'pass'],
    ]);
    const excepted = result.results.find((r) => r.statement.line === 11)!;
    expect(excepted.evidence.map((e) => e.message)).toEqual([
      'Staff has read on task (parent scope) from "Account Task - All Staff", under "Account - All Staff" (account, global scope)',
      'Staff has read on task (parent scope) from "Incident Task - All Staff", under "Incident - All Staff" (incident, global scope)',
    ]);
    expect(result.results.find((r) => r.statement.line === 6)!.evidence[0]!.message).toBe(
      "authenticated doesn't have read on task under incident at global scope",
    );
    expect(result.results.find((r) => r.statement.line === 17)!.warnings).toEqual([
      "contact isn't used by any table permission or Web API setting in the site",
    ]);
  });

  it('passes every ecoflux statement', () => {
    const result = evaluatePolicy(ecofluxPolicy, ecoflux);
    expect(result.results.filter((r) => !r.passed).map((r) => r.statement.text)).toEqual([]);
    expect(result.results.flatMap((r) => r.warnings)).toEqual([]);
  });

  it('names the grant that breaks a statement, with its file', () => {
    const result = evaluatePolicy(brokenPolicy, broken);
    expect(result.results.find((r) => r.statement.line === 5)!.evidence).toEqual([
      {
        message:
          'Authenticated Users has write on contact (global scope) from "Contact - Authenticated Users Global Write"',
        file: 'table-permissions/Contact---Authenticated-Users-Global-Write.tablepermission.yml',
        recordId: '00000000-0000-0000-0002-000000000001',
      },
    ]);
  });

  it('counts every role but Anonymous Users as authenticated in cannot', () => {
    const policy = parsePolicy(
      'access:\n  - authenticated cannot create adx_portalcomment\n',
      'p.yaml',
    );
    const [result] = evaluatePolicy(policy, broken).results;
    expect(result!.passed).toBe(false);
    expect(result!.evidence[0]!.message).toMatch(/^Case Manager has create on adx_portalcomment/);
  });

  it('warns about tables the site never mentions', () => {
    const result = evaluatePolicy(brokenPolicy, broken);
    expect(result.results.find((r) => r.statement.line === 14)!.warnings).toEqual([
      "account isn't used by any table permission or Web API setting in the site",
    ]);
  });

  it('rejects unknown role names, with a suggestion', () => {
    const policy = parsePolicy('access:\n  - role "Case Managers" can read incident\n', 'p.yaml');
    expect(() => evaluatePolicy(policy, broken)).toThrow(
      'p.yaml:2: unknown role "Case Managers" (did you mean "Case Manager"?)',
    );
  });

  it('reports open registration from its defaults and from its settings', () => {
    const policy = parsePolicy('settings:\n  - registration is invite only\n', 'p.yaml');
    expect(evaluatePolicy(policy, broken).results[0]!.passed).toBe(false);
    const [eco] = evaluatePolicy(policy, ecoflux).results;
    expect(eco!.passed).toBe(false);
    expect(eco!.evidence[1]).toMatchObject({
      message: 'Authentication/Registration/OpenRegistrationEnabled is "true"',
    });
  });

  it("fails a statement on a value a download doesn't include, and says why", async () => {
    const download = await loadSiteFolder('test/fixtures/diff/variables/head');
    const policy = parsePolicy(
      [
        'webapi:',
        '  - contact is not enabled # fail: may be enabled',
        'settings:',
        '  - setting "Webapi/error/innererror" is not "true" # fail: unknown',
        '  - setting "Webapi/error/innererror" is set # pass: the setting is there',
        '',
      ].join('\n'),
      'p.yaml',
    );
    const results = evaluatePolicy(policy, download).results;
    expect(results.map((r) => [r.passed, r.evidence.map((e) => e.message)])).toEqual([
      [
        false,
        [
          "Webapi/contact/enabled comes from environment variable dwcrm_ContactApi, which a download doesn't include",
        ],
      ],
      [
        false,
        [
          "Webapi/error/innererror comes from environment variable dwcrm_InnerErrors, which a download doesn't include",
        ],
      ],
      [true, []],
    ]);
  });

  it('reads a variable-backed value from a solution', async () => {
    const solution = await loadSiteFolder('test/fixtures/solution-broken');
    const policy = parsePolicy(
      'settings:\n  - setting "Webapi/error/innererror" is "false"\n',
      'p.yaml',
    );
    const [result] = evaluatePolicy(policy, solution).results;
    expect(result!.evidence.map((e) => e.message)).toEqual([
      'Webapi/error/innererror is "true" from environment variable dwcrm_Current',
    ]);
  });
});

describe('page statements', () => {
  it('reads every page statement shape', () => {
    expect(checkOf('pages', 'only "C1 ASP", authenticated can read pages under "/v1/"')).toEqual({
      kind: 'page',
      form: 'only',
      who: [{ kind: 'role', name: 'C1 ASP' }, { kind: 'authenticated' }],
      action: 'read',
      page: { kind: 'under', url: '/v1/' },
    });
    expect(checkOf('pages', 'nobody can publish page "/"')).toEqual({
      kind: 'page',
      form: 'nobody',
      who: [],
      action: 'publish',
      page: { kind: 'page', url: '/' },
    });
    expect(checkOf('pages', 'anonymous cannot read page "/x/"')).toMatchObject({
      form: 'cannot',
      who: [{ kind: 'anonymous' }],
    });
    expect(problems('pages:\n  - anonymous cannot read "/x/"\n')).toEqual([
      'p.yaml:2: expected "page" or "pages", found "/x/": anonymous cannot read "/x/"',
    ]);
  });

  it('passes and fails as the fixture comments say', () => {
    const result = evaluatePolicy(registrationPolicy, registration);
    const lines = readFileSync('test/fixtures/policies/registration.policy.yaml', 'utf8').split(
      '\n',
    );
    for (const r of result.results) {
      const expected = /# (pass|fail)/.exec(
        `${lines[r.statement.line - 1]} ${lines[r.statement.line]}`,
      )?.[1];
      expect(r.passed ? 'pass' : 'fail', r.statement.text).toBe(expected);
    }
    expect(result.counts).toEqual({ passed: 11, failed: 8 });
  });

  it('names the rule or page that breaks a statement', () => {
    const result = evaluatePolicy(registrationPolicy, registration);
    const evidence = (text: string) =>
      result.results.find((r) => r.statement.text === text)!.evidence;
    expect(evidence('only "C1 ASP" can read page "/delete-course/"')).toEqual([
      {
        message: 'anyone can read /delete-course/: no Restrict Read rule on it or above it',
        file: 'web-pages/[admin]-delete-course/[Admin]-Delete-Course.webpage.yml',
        recordId: '27120917-5fcf-f111-a05a-70a8a52c89ad',
      },
    ]);
    expect(evidence('nobody can publish page "/v1/v3/"')[0]!.message).toBe(
      '"C1 ASP" can publish /v1/v3/ through Grant Change rule "Grant Change" on /v1/',
    );
  });

  it('matches the text output snapshot', async () => {
    const result = evaluatePolicy(registrationPolicy, registration);
    await expect(
      formatText(result, registration, 'site', 'registration.policy.yaml'),
    ).toMatchFileSnapshot('__snapshots__/registration.txt');
  });

  it('rejects unknown, inactive and code-site pages', () => {
    const errors = (site: typeof registration, statement: string) => {
      try {
        evaluatePolicy(parsePolicy(`pages:\n  - ${statement}\n`, 'p.yaml'), site);
      } catch (error) {
        if (error instanceof PolicyError) return error.problems;
        throw error;
      }
      return [];
    };
    expect(errors(registration, 'anonymous cannot read page "/my-registration/"')).toEqual([
      'p.yaml:2: no web page has the URL /my-registration/ (did you mean "/my-registrations/"?): anonymous cannot read page "/my-registration/"',
    ]);
    expect(errors(registration, 'anonymous cannot read page "/contact-us/"')).toEqual([
      'p.yaml:2: the web page at /contact-us/ ("Contact us") is inactive: anonymous cannot read page "/contact-us/"',
    ]);
    expect(errors(ecoflux, 'anonymous cannot read page "/"')).toEqual([
      'p.yaml:2: page access rules don\'t apply to code sites, so pageslens can\'t check page statements there: anonymous cannot read page "/"',
    ]);
  });
});

describe('policy output', () => {
  it('matches the broken text output snapshot', async () => {
    const text = formatText(
      evaluatePolicy(brokenPolicy, broken),
      broken,
      'site',
      'broken.policy.yaml',
    );
    await expect(text).toMatchFileSnapshot('__snapshots__/broken.txt');
  });

  it('matches the parent-chains text output snapshot', async () => {
    const text = formatText(
      evaluatePolicy(chainsPolicy, chains),
      chains,
      'site',
      'parent-chains.policy.yaml',
    );
    await expect(text).toMatchFileSnapshot('__snapshots__/parent-chains.txt');
  });

  it('writes versioned JSON with one entry per statement', () => {
    const output = JSON.parse(
      formatJson(evaluatePolicy(brokenPolicy, broken), broken, 'site', 'p.yaml'),
    );
    expect(output).toMatchObject({
      version: 1,
      policy: 'p.yaml',
      summary: { passed: 12, failed: 12 },
    });
    expect(output.results[12]).toEqual({
      id: 'comments-case-managers',
      section: 'access',
      statement: 'role "Case Manager" can create adx_portalcomment',
      line: 16,
      because: 'Case managers reply to customers',
      status: 'pass',
      evidence: [],
      warnings: [],
    });
  });
});
