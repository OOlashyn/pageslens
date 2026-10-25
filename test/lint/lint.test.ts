import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vite-plus/test';
import { loadSiteFolder } from '../../src/adapters/site-folder.js';
import { ConfigError, loadConfig } from '../../src/lint/config.js';
import { configJsonSchema } from '../../src/lint/config-schema.js';
import { lint } from '../../src/lint/engine.js';
import { formatJson } from '../../src/lint/format/json.js';
import { formatText } from '../../src/lint/format/text.js';
import { RULES } from '../../src/lint/rules/index.js';

const ecoflux = await loadSiteFolder('test/fixtures/ecoflux');
const broken = await loadSiteFolder('test/fixtures/broken');
const classic = await loadSiteFolder('test/fixtures/classic');
const classicPages = await loadSiteFolder('test/fixtures/classic-pages');
const registration = await loadSiteFolder('test/fixtures/registration');
const ruleIds = RULES.map((rule) => rule.id);

const summary = (result: ReturnType<typeof lint>) =>
  result.findings.map((f) => [f.ruleId, f.severity, f.source.file]);

describe('rules on the fixtures', () => {
  it('finds exactly the broken fixture cases listed in test/fixtures/README.md', () => {
    expect(summary(lint(broken))).toEqual([
      ['webapi-wildcard-fields', 'error', 'site-settings/Webapi-contact-fields.sitesetting.yml'],
      [
        'webapi-no-permission',
        'warning',
        'site-settings/Webapi-dwcrm_invoice-enabled.sitesetting.yml',
      ],
      ['webapi-inner-errors', 'warning', 'site-settings/Webapi-error-innererror.sitesetting.yml'],
      [
        'scope-relationship-missing',
        'error',
        'table-permissions/Account---Case-Manager-No-Relationship.tablepermission.yml',
      ],
      [
        'parent-chain-broken',
        'error',
        'table-permissions/Comment---Missing-Parent.tablepermission.yml',
      ],
      [
        'global-write-authenticated',
        'warning',
        'table-permissions/Contact---Authenticated-Users-Global-Write.tablepermission.yml',
      ],
      [
        'global-write-anonymous',
        'warning',
        'table-permissions/Feedback---Anonymous-Users-Global-Create.tablepermission.yml',
      ],
      ['permission-no-role', 'warning', 'table-permissions/Incident---No-Role.tablepermission.yml'],
      [
        'parent-chain-broken',
        'error',
        'table-permissions/Note---Parent-Without-Role.tablepermission.yml',
      ],
      [
        'permission-no-role',
        'warning',
        'table-permissions/Order---Inactive-Role.tablepermission.yml',
      ],
      [
        'parent-chain-broken',
        'error',
        'table-permissions/Survey-Answer---Inactive-Parent.tablepermission.yml',
      ],
      ['multiple-authenticated-roles', 'error', 'web-roles/Authenticated-Users.webrole.yml'],
      ['multiple-authenticated-roles', 'error', 'web-roles/Signed-In-Users.webrole.yml'],
      ['role-unused', 'info', 'web-roles/Unused-Role.webrole.yml'],
    ]);
  });

  it('every rule fires on the broken fixture, or on classic-pages for the classic-only page rules', () => {
    const fired = new Set(
      [...lint(broken).findings, ...lint(classicPages).findings].map((f) => f.ruleId),
    );
    expect([...fired].sort()).toEqual([...ruleIds].sort());
  });

  it('finds exactly the classic-pages cases listed in test/fixtures/README.md', () => {
    expect(summary(lint(classicPages))).toEqual([
      ['page-parent-missing', 'error', 'web-pages/loop-a/Loop-A.webpage.yml'],
      ['page-parent-missing', 'error', 'web-pages/loop-b/Loop-B.webpage.yml'],
      ['page-parent-missing', 'error', 'web-pages/lost/Lost.webpage.yml'],
      ['grant-change-overrides-read', 'warning', 'webpagerule.yml'],
      ['page-roles-not-subset', 'warning', 'webpagerule.yml'],
      ['page-rule-anonymous', 'error', 'webpagerule.yml'],
      ['page-rule-authenticated', 'warning', 'webpagerule.yml'],
      ['page-rule-no-page', 'info', 'webpagerule.yml'],
      ['page-rule-no-page', 'warning', 'webpagerule.yml'],
      ['page-rule-no-role', 'info', 'webpagerule.yml'],
      ['page-rule-no-role', 'error', 'webpagerule.yml'],
      ['page-rules-conflict', 'error', 'webpagerule.yml'],
      ['page-rules-conflict', 'error', 'webpagerule.yml'],
    ]);
  });

  it('matches the classic-pages text output snapshot', async () => {
    await expect(formatText(lint(classicPages), classicPages, 'site')).toMatchFileSnapshot(
      '__snapshots__/classic-pages.txt',
    );
  });

  it('finds the page rule cases in the real classic site', () => {
    const findings = lint(registration).findings.filter((f) => f.source.file === 'webpagerule.yml');
    expect(findings.map((f) => [f.ruleId, f.severity])).toEqual([
      ['grant-change-overrides-read', 'warning'],
      ['page-roles-not-subset', 'warning'],
      ['page-roles-not-subset', 'warning'],
      ['page-rule-anonymous', 'error'],
      ['page-rule-authenticated', 'warning'],
      ['page-rule-no-page', 'info'],
    ]);
    expect(findings.map((f) => f.message)).toContain(
      `Restrict Read rule "Allow Auth" on "/v1/v3/" lists "Authenticated Users", but Restrict Read rule "Restrict Read on v1" on "/v1/" doesn't let it in, so it can't reach "/v1/v3/".`,
    );
  });

  it('runs no page rule on a code site', () => {
    const pageRules = ruleIds.filter((id) => id.startsWith('page-') || id.startsWith('grant-'));
    for (const site of [ecoflux, broken]) {
      expect(lint(site).findings.filter((f) => pageRules.includes(f.ruleId))).toEqual([]);
    }
  });

  it('finds only the missing account relationships and inner errors in ecoflux', () => {
    const result = lint(ecoflux);
    expect(result.findings.map((f) => f.ruleId)).toEqual([
      'webapi-inner-errors',
      ...Array(4).fill('scope-relationship-missing'),
    ]);
    expect(result.counts).toEqual({ error: 4, warning: 1, info: 0 });
  });

  it('finds the same cases in the classic fixture as in its records', () => {
    expect(summary(lint(classic))).toEqual([
      ['global-write-anonymous', 'warning', 'table-permissions/Feedback.tablepermission.yml'],
      ['global-write-authenticated', 'warning', 'table-permissions/Feedback.tablepermission.yml'],
      // The fixture keeps no web pages, so the Grant Change rule's page is missing
      ['page-rule-no-page', 'warning', 'webpagerule.yml'],
      ['page-rule-no-page', 'info', 'webpagerule.yml'],
    ]);
  });

  it('matches the classic text output snapshot', async () => {
    await expect(formatText(lint(classic), classic, 'site')).toMatchFileSnapshot(
      '__snapshots__/classic.txt',
    );
  });

  it('writes readable messages', () => {
    const messages = lint(broken).findings.map((f) => f.message);
    expect(messages).toContain(
      'Parent-scope table permission "Comment - Missing Parent" grants nothing: its parent (00000000-0000-0000-0002-0000000000ff) doesn\'t exist in the site.',
    );
    expect(messages).toContain(
      'Table permission "Feedback - Anonymous Users Global Create" gives Anonymous Users create on every dwcrm_feedback record (global scope).',
    );
  });
});

describe('rule metadata', () => {
  it('has unique ids', () => {
    expect(new Set(ruleIds).size).toBe(ruleIds.length);
  });

  it('has a docs page for every rule, listed in rules/README.md', () => {
    const index = readFileSync('rules/README.md', 'utf8');
    for (const id of ruleIds) {
      expect(existsSync(`rules/${id}.md`), id).toBe(true);
      expect(index, id).toContain(`(${id}.md)`);
    }
  });

  it('links each finding to its rule page', () => {
    const finding = lint(broken).findings[0]!;
    expect(finding.docs).toBe(
      `https://github.com/OOlashyn/pageslens/blob/main/rules/${finding.ruleId}.md`,
    );
  });
});

describe('severity config', () => {
  it("keeps a finding's own severity unless the config sets the rule", () => {
    const severities = (config: Parameters<typeof lint>[1]) =>
      lint(classicPages, config)
        .findings.filter((f) => f.ruleId === 'page-rule-no-role')
        .map((f) => f.severity);
    expect(severities({ rules: {} })).toEqual(['info', 'error']);
    expect(severities({ rules: { 'page-rule-no-role': 'warning' } })).toEqual([
      'warning',
      'warning',
    ]);
  });

  it('overrides a severity and turns a rule off', () => {
    const result = lint(broken, {
      rules: { 'global-write-anonymous': 'error', 'role-unused': 'off' },
    });
    const severities = new Map(result.findings.map((f) => [f.ruleId, f.severity]));
    expect(severities.get('global-write-anonymous')).toBe('error');
    expect(severities.has('role-unused')).toBe(false);
  });
});

describe('ignore config', () => {
  const feedback = '3453215b-d450-4073-a12c-88aa8a248b81';
  // The classic fixture keeps no web pages: leave its page rule findings out here
  const rules = { 'page-rule-no-page': 'off' } as const;

  it('leaves out findings on matching files and counts them', () => {
    const result = lint(broken, {
      rules: {},
      ignore: [{ files: ['web-roles/*.webrole.yml'] }, { files: ['**/Incident---No-Role.*'] }],
    });
    const files = result.findings.map((f) => f.source.file);
    expect(files.some((f) => f.startsWith('web-roles/'))).toBe(false);
    expect(files).not.toContain('table-permissions/Incident---No-Role.tablepermission.yml');
    expect(result.ignored).toBe(4);
    expect(result.counts).toEqual({ error: 5, warning: 5, info: 0 });
  });

  it('leaves out findings on a record, from the listed rules only', () => {
    const result = lint(classic, {
      rules,
      ignore: [{ rules: ['global-write-anonymous'], records: [feedback], reason: 'Contact form' }],
    });
    expect(result.findings.map((f) => f.ruleId)).toEqual(['global-write-authenticated']);
    expect(result.ignored).toBe(1);
  });

  it('shows the ignored count in both formats', () => {
    const result = lint(classic, { rules, ignore: [{ records: [feedback] }] });
    expect(formatText(result, classic, 'site').endsWith('No findings (2 ignored).\n')).toBe(true);
    expect(JSON.parse(formatJson(result, classic, 'site')).ignored).toBe(2);
    const partly = lint(classic, {
      rules,
      ignore: [{ rules: ['global-write-anonymous'], records: [feedback] }],
    });
    expect(formatText(partly, classic, 'site')).toContain('0 errors, 1 warning, 0 info, 1 ignored');
  });

  it('lists the files and records that left out no finding', () => {
    const gone = '00000000-0000-0000-0000-0000000000aa';
    const result = lint(classic, {
      rules,
      ignore: [
        { rules: ['global-write-anonymous'], records: [feedback, gone] },
        { files: ['table-permissions/*.yml', 'web-roles/Legacy-*.webrole.yml'] },
        { rules: ['role-unused'], records: [feedback] },
      ],
    });
    expect(result.ignored).toBe(2);
    expect(result.unusedIgnores).toEqual([
      { entry: 1, field: 'records', value: gone },
      { entry: 2, field: 'files', value: 'web-roles/Legacy-*.webrole.yml' },
      { entry: 3, field: 'records', value: feedback },
    ]);
  });

  it('counts a pattern as used when another entry also matches the finding', () => {
    const result = lint(classic, {
      rules,
      ignore: [{ records: [feedback] }, { records: [feedback] }],
    });
    expect(result.unusedIgnores).toEqual([]);
  });

  it("doesn't check an entry that lists a rule that is turned off", () => {
    const result = lint(classic, {
      rules: { ...rules, 'role-unused': 'off' },
      ignore: [{ rules: ['role-unused'], records: [feedback] }],
    });
    expect(result.unusedIgnores).toEqual([]);
  });

  it('shows unused ignores in text and JSON', () => {
    const result = lint(classic, {
      rules,
      ignore: [{ records: [feedback] }, { files: ['web-roles/Legacy-*.webrole.yml'] }],
    });
    const text = formatText(result, classic, 'site', 'config/pageslens.config.yaml');
    expect(text).toBe(
      `${classic.website.name} (site)\n\n` +
        'config/pageslens.config.yaml\n' +
        '  warning  Ignore entry 2: file "web-roles/Legacy-*.webrole.yml" matches no finding; remove it if what it ignored is fixed.\n\n' +
        'No findings (2 ignored, 1 unused ignore).\n',
    );
    expect(JSON.parse(formatJson(result, classic, 'site')).unusedIgnores).toEqual([
      { entry: 2, field: 'files', value: 'web-roles/Legacy-*.webrole.yml' },
    ]);
  });
});

describe('config JSON Schema', () => {
  it('matches pageslens.config.schema.json', async () => {
    const text = `${JSON.stringify(configJsonSchema(RULES), null, 2)}\n`;
    await expect(text).toMatchFileSnapshot('../../pageslens.config.schema.json');
  });

  it('lists every rule', () => {
    const schema = configJsonSchema(RULES) as {
      properties: { rules: { properties: Record<string, unknown> } };
    };
    expect(Object.keys(schema.properties.rules.properties)).toEqual(ruleIds);
  });
});

describe('loadConfig', () => {
  let temp: string | undefined;
  afterEach(async () => {
    if (temp) await rm(temp, { recursive: true, force: true });
    temp = undefined;
  });

  async function folder(config?: string): Promise<string> {
    temp = await mkdtemp(join(tmpdir(), 'pageslens-'));
    if (config !== undefined) await writeFile(join(temp, 'pageslens.config.yaml'), config);
    return temp;
  }

  it('uses defaults when there is no config file', async () => {
    expect(await loadConfig(await folder(), ruleIds)).toEqual({ rules: {}, ignore: [] });
  });

  it('finds the nearest config in a folder above', async () => {
    const root = await folder('rules:\n  role-unused: off\n');
    const nested = join(root, 'site', 'nested');
    await mkdir(nested, { recursive: true });
    const config = await loadConfig(nested, ruleIds);
    expect(config.rules).toEqual({ 'role-unused': 'off' });
    expect(config.path).toBe(join(root, 'pageslens.config.yaml'));
  });

  it('reads an explicit path', async () => {
    const root = await folder();
    const path = join(root, 'other.yaml');
    await writeFile(path, 'rules:\n  permission-no-role: error\n');
    expect((await loadConfig(root, ruleIds, path)).rules).toEqual({
      'permission-no-role': 'error',
    });
  });

  it('rejects unknown rules, unknown keys and bad severities', async () => {
    await expect(loadConfig(await folder('rules:\n  nope: error\n'), ruleIds)).rejects.toThrow(
      /unknown rule\(s\): nope/,
    );
    await expect(loadConfig(await folder('rule:\n  role-unused: off\n'), ruleIds)).rejects.toThrow(
      ConfigError,
    );
    await expect(
      loadConfig(await folder('rules:\n  role-unused: fatal\n'), ruleIds),
    ).rejects.toThrow(/rules\.role-unused/);
  });

  it('reads ignore entries, with file paths and GUIDs normalised', async () => {
    const config = await loadConfig(
      await folder(
        'ignore:\n' +
          "  - files: ['.\\web-roles\\Legacy.webrole.yml']\n" +
          '    records: [3453215B-D450-4073-A12C-88AA8A248B81]\n' +
          '    rules: [role-unused]\n' +
          '    reason: Kept for the old portal\n',
      ),
      ruleIds,
    );
    expect(config.ignore).toEqual([
      {
        files: ['web-roles/Legacy.webrole.yml'],
        records: ['3453215b-d450-4073-a12c-88aa8a248b81'],
        rules: ['role-unused'],
        reason: 'Kept for the old portal',
      },
    ]);
  });

  it('rejects ignore entries with unknown rules or nothing to match', async () => {
    await expect(
      loadConfig(await folder('ignore:\n  - rules: [nope]\n    files: [a.yml]\n'), ruleIds),
    ).rejects.toThrow(/unknown rule\(s\): nope/);
    await expect(
      loadConfig(await folder('ignore:\n  - rules: [role-unused]\n'), ruleIds),
    ).rejects.toThrow(/ignore\.0: needs files or records/);
    await expect(loadConfig(await folder('ignore:\n  - files: []\n'), ruleIds)).rejects.toThrow(
      /ignore\.0\.files/,
    );
  });

  it('rejects invalid YAML and a missing explicit file', async () => {
    await expect(loadConfig(await folder('rules: [\n'), ruleIds)).rejects.toThrow(/invalid YAML/);
    await expect(loadConfig('.', ruleIds, 'does-not-exist.yaml')).rejects.toThrow(/Can't read/);
  });
});

describe('output formats', () => {
  it('writes versioned JSON with one entry per finding', () => {
    const output = JSON.parse(formatJson(lint(broken), broken, 'site'));
    expect(output.version).toBe(1);
    expect(output.site).toEqual({
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Broken Fixture',
      path: 'site',
    });
    expect(output.summary).toEqual({ error: 7, warning: 6, info: 1 });
    expect(output.findings[0]).toEqual({
      ruleId: 'webapi-wildcard-fields',
      severity: 'error',
      message:
        'Web API on contact exposes every column (fields = *); list the columns the site needs.',
      file: 'site-settings/Webapi-contact-fields.sitesetting.yml',
      recordId: '00000000-0000-0000-0003-000000000002',
      docs: 'https://github.com/OOlashyn/pageslens/blob/main/rules/webapi-wildcard-fields.md',
    });
  });

  it('groups text output by file and ends with a summary', () => {
    const text = formatText(lint(ecoflux), ecoflux, 'site');
    expect(text.startsWith('EcoFlux (site)\n\n')).toBe(true);
    expect(text).toContain(
      'table-permissions/Asset---Asset-Manager-CRUD.tablepermission.yml\n  error    Table permission "Asset - Asset Manager CRUD" has account scope',
    );
    expect(text.endsWith('4 errors, 1 warning, 0 info\n')).toBe(true);
  });

  it('says so when there are no findings', () => {
    const text = formatText(
      lint(ecoflux, {
        rules: { 'scope-relationship-missing': 'off', 'webapi-inner-errors': 'off' },
      }),
      ecoflux,
      'site',
    );
    expect(text).toBe('EcoFlux (site)\n\nNo findings.\n');
  });
});
