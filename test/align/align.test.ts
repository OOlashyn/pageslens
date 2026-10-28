import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vite-plus/test';
import { classicModelFields } from '../../src/adapters/classic-site.js';
import { loadSiteFolder } from '../../src/adapters/site-folder.js';
import { alignSites } from '../../src/align/compare.js';
import { formatMarkdown, MARKDOWN_MAX_LENGTH } from '../../src/align/format/markdown.js';
import { normalizeValue } from '../../src/align/normalize.js';
import { CHECKS, type AlignFinding, type AlignResult } from '../../src/align/types.js';
import { ExitCode } from '../../src/cli.js';
import type { AlignConfig } from '../../src/lint/config.js';
import type { Site } from '../../src/model/schema.js';
import { cli, tempDir } from '../helpers.js';

// `pageslens align` (specs/0008): the real pairs give nothing, the hand-written pairs in
// test/fixtures/align/ give one finding per case their files' comments name.

const side = (site: Site) => ({
  path: site.root,
  format: site.format,
  layout: site.layout,
  site: { id: site.website.id, name: site.website.name },
});

async function align(site: string, solution: string, config?: AlignConfig): Promise<AlignResult> {
  const download = await loadSiteFolder(site);
  const unpacked = await loadSiteFolder(solution);
  return alignSites(download, unpacked, { site: side(download), solution: side(unpacked) }, config);
}

const pair = (name: string, config?: AlignConfig) =>
  align(`test/fixtures/align/${name}/site`, `test/fixtures/align/${name}/solution`, config);

const summary = (findings: AlignFinding[]) =>
  findings.map((f) => `${f.severity} ${f.check} ${f.kind} ${f.name}`);

describe('align: the real pairs', () => {
  it('finds nothing between Registration and its solution', async () => {
    const result = await align('test/fixtures/registration', 'test/fixtures/solution-registration');
    expect(result.findings).toEqual([]);
    expect(result.matched).toBe(477);
  });

  it('finds nothing between EcoFlux and its solution', async () => {
    const result = await align('test/fixtures/ecoflux', 'test/fixtures/solution-ecoflux');
    expect(result.findings).toEqual([]);
    expect(result.matched).toBe(143);
  });
});

describe('align: hand-written pairs', () => {
  it('finds nothing in a clean code site pair or a clean classic site pair', async () => {
    const code = await pair('code');
    expect(code.findings).toEqual([]);
    expect(code.matched).toBe(15);
    const classic = await pair('classic');
    expect(classic.findings).toEqual([]);
    expect(classic.matched).toBe(14);
  });

  it('reports records on one side only', async () => {
    const result = await pair('missing');
    expect(summary(result.findings)).toEqual([
      'error missing-from-solution tablepermission Course Admins - Courses',
      'error missing-from-solution webrole Course Admins',
      'warning missing-from-solution webpage Draft',
      'warning missing-from-download webpage Old Promo',
    ]);
    expect(result.findings[2]).toMatchObject({ inactive: true });
    expect(result.findings[3]?.solutionFile).toMatch(/^powerpagecomponents\//);
    expect(result.matched).toBe(2);
  });

  it('reports content and state that differ, and fields one side has', async () => {
    const result = await pair('content');
    expect(summary(result.findings)).toEqual([
      'error state-differs webrole Partners',
      'error content-differs basicform Edit',
      'error content-differs sitesetting Search/Enabled',
      'error content-differs webfile logo.png',
      'error content-differs webtemplate Header',
      'warning field-one-side webrole Staff',
    ]);
    const setting = result.findings.find((f) => f.name === 'Search/Enabled');
    expect(setting).toMatchObject({
      message: 'value is "true" in the download, "false" in the solution',
      fields: [{ field: 'value', site: 'true', solution: 'false' }],
    });
    const template = result.findings.find((f) => f.name === 'Header');
    expect(template?.fields).toEqual([{ field: 'source', site: 'differs', solution: 'differs' }]);
    expect(result.findings.find((f) => f.name === 'Staff')?.fields).toEqual([
      { field: 'futurefield', solution: 'x' },
    ]);
  });

  it('reports variables the import needs, and a setting moved to a variable', async () => {
    const result = await pair('variables');
    expect(summary(result.findings)).toEqual([
      'error content-differs sitesetting Search/PageSize',
      'error variable-missing sitesetting Search/Gone',
      'warning variable-no-value sitesetting Search/Empty',
    ]);
    expect(result.findings[0]?.fields?.map((f) => f.field)).toEqual([
      'envvar_schema',
      'source',
      'value',
    ]);
  });

  it('stops at different sites', async () => {
    const result = await pair('mismatch');
    expect(summary(result.findings)).toEqual(['error site-mismatch website Contoso']);
    expect(result.findings[0]?.message).toBe(
      'the download is site "Contoso" (00000000-0000-0000-3333-000000000001), the solution has site "Fabrikam" (00000000-0000-0000-3333-000000000002)',
    );
  });
});

describe('align: normalisation', () => {
  it('treats empty strings and lists as no value', () => {
    expect(normalizeValue('')).toBeUndefined();
    expect(normalizeValue([])).toBeUndefined();
    expect(normalizeValue([''])).toBeUndefined();
    expect(normalizeValue(undefined)).toBeUndefined();
  });

  it('lower-cases GUIDs and compares lists of GUIDs as sets', () => {
    const a = '0000000A-0000-0000-0000-000000000001';
    const b = '0000000b-0000-0000-0000-000000000002';
    expect(normalizeValue(a)?.canonical).toBe(a.toLowerCase());
    expect(normalizeValue([a, b])?.canonical).toBe(normalizeValue([b, a])?.canonical);
    expect(normalizeValue(['x', 'y'])?.canonical).not.toBe(normalizeValue(['y', 'x'])?.canonical);
  });

  it('compares JSON objects without key order, formatting or type keys', () => {
    const download = '{\n  "Type": "DeleteModal",\n  "B": [1, 2],\n  "A": "x"\n}';
    const solution = '{"A":"x","$type":"GridMetadata+DeleteModal, Adxstudio","B":[1,2]}';
    expect(normalizeValue(download)?.canonical).toBe(normalizeValue(solution)?.canonical);
    expect(normalizeValue('{"A":"y"}')?.canonical).not.toBe(normalizeValue('{"A":"x"}')?.canonical);
    expect(normalizeValue('{not json')?.canonical).toBe('{not json');
  });

  it('normalises newlines', () => {
    expect(normalizeValue('a\r\nb')?.canonical).toBe('a\nb');
  });

  it("maps a classic record's keys, keeping list names", () => {
    expect(
      classicModelFields('tablepermission', {
        adx_entitypermissionid: 'id-1',
        adx_entityname: 'Contacts',
        adx_entitypermission_webrole: ['r'],
        statecode: '0',
      }),
    ).toEqual({
      id: 'id-1',
      entityname: 'Contacts',
      adx_entitypermission_webrole: ['r'],
      statecode: '0',
    });
    expect(classicModelFields('adplacement', { adx_adplacement_ad: ['a'], adx_name: 'x' })).toEqual(
      { adx_adplacement_ad: ['a'], name: 'x' },
    );
  });
});

describe('align: config', () => {
  const ROLE = '00000000-0000-0000-c047-000000000001';

  it('sets severities and turns checks off', async () => {
    const result = await pair('content', {
      checks: { 'content-differs': 'warning', 'field-one-side': 'off' },
      ignore: [],
    });
    expect(result.counts).toEqual({ error: 1, warning: 4, info: 0 });
    expect(result.findings.some((f) => f.check === 'field-one-side')).toBe(false);
  });

  it('ignores records, for the listed checks only, and lists unused entries', async () => {
    const result = await pair('content', {
      checks: {},
      ignore: [
        { records: [ROLE] },
        { checks: ['content-differs'], records: ['00000000-0000-0000-c047-000000000002'] },
        { records: ['00000000-0000-0000-0000-00000000dead'] },
      ],
    });
    expect(result.ignored).toBe(1);
    expect(result.findings.some((f) => f.recordId === ROLE)).toBe(false);
    expect(result.findings.some((f) => f.name === 'Staff')).toBe(true);
    expect(result.unusedIgnores).toEqual([
      { entry: 2, value: '00000000-0000-0000-c047-000000000002' },
      { entry: 3, value: '00000000-0000-0000-0000-00000000dead' },
    ]);
  });

  it('reads the align section from pageslens.config.yaml', async () => {
    const config = join(await tempDir(), 'pageslens.config.yaml');
    const args = [
      'align',
      'test/fixtures/align/content/site',
      'test/fixtures/align/content/solution',
      '--config',
      config,
    ];
    await writeFile(
      config,
      `align:\n  checks:\n    state-differs: off\n    content-differs: warning\n  ignore:\n    - records: [${ROLE.toUpperCase()}]\n`,
    );
    const result = await cli(...args);
    expect(result.code).toBe(ExitCode.Ok);
    expect(result.out).toContain('0 errors, 5 warnings (1 unused ignore).');
    await writeFile(config, 'align:\n  checks:\n    nope: off\n');
    expect((await cli(...args)).code).toBe(ExitCode.Usage);
  });
});

describe('align: command line', () => {
  it('exits 0 with no errors, 1 with errors', async () => {
    const clean = await cli(
      'align',
      'test/fixtures/align/code/site',
      'test/fixtures/align/code/solution',
    );
    expect(clean.code).toBe(ExitCode.Ok);
    expect(clean.out).toContain('No differences. 15 records match.');
    const missing = await cli(
      'align',
      'test/fixtures/align/missing/site',
      'test/fixtures/align/missing/solution',
    );
    expect(missing.code).toBe(ExitCode.Findings);
  });

  it('exits 2 for the wrong kind of folder on either side', async () => {
    const solutionFirst = await cli(
      'align',
      'test/fixtures/solution-broken',
      'test/fixtures/solution-broken',
    );
    expect(solutionFirst).toMatchObject({
      code: ExitCode.Usage,
      err: 'error: test/fixtures/solution-broken is an unpacked solution; align compares a download with a solution\n',
    });
    const downloadSecond = await cli('align', 'test/fixtures/broken', 'test/fixtures/classic');
    expect(downloadSecond.code).toBe(ExitCode.Usage);
    expect(downloadSecond.err).toContain('is a classic site download');
  });

  it("exits 2 when a side can't be read", async () => {
    const result = await cli('align', 'test/fixtures/ecoflux', 'test/fixtures/nope');
    expect(result.code).toBe(ExitCode.Usage);
    expect(result.err).toMatch(/^error: No \.powerpages-site folder/);
  });

  it('writes each format', async () => {
    const args = [
      'align',
      'test/fixtures/align/content/site',
      'test/fixtures/align/content/solution',
    ];
    await expect((await cli(...args)).out).toMatchFileSnapshot('__snapshots__/content.txt');
    await expect((await cli(...args, '--format', 'markdown')).out).toMatchFileSnapshot(
      '__snapshots__/content.md',
    );
    await expect((await cli(...args, '--format', 'json')).out).toMatchFileSnapshot(
      '__snapshots__/content.json',
    );
    const missing = [
      'align',
      'test/fixtures/align/missing/site',
      'test/fixtures/align/missing/solution',
    ];
    await expect((await cli(...missing)).out).toMatchFileSnapshot('__snapshots__/missing.txt');
    await expect((await cli(...missing, '--format', 'markdown')).out).toMatchFileSnapshot(
      '__snapshots__/missing.md',
    );
  });

  it('writes SARIF on the download file, with the solution file related', async () => {
    const { out } = await cli(
      'align',
      'test/fixtures/align/content/site',
      'test/fixtures/align/content/solution',
      '--format',
      'sarif',
    );
    const run = JSON.parse(out).runs[0];
    expect(run.automationDetails).toEqual({ id: 'pageslens/align/' });
    expect(run.tool.driver.rules.map((r: { id: string }) => r.id)).toEqual([...CHECKS]);
    const setting = run.results.find((r: { message: { text: string } }) =>
      r.message.text.startsWith('site setting'),
    );
    expect(setting).toMatchObject({
      ruleId: 'content-differs',
      level: 'error',
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: 'test/fixtures/align/content/site/sitesetting.yml' },
            region: { startLine: 3 },
          },
        },
      ],
      relatedLocations: [
        {
          physicalLocation: {
            artifactLocation: {
              uri: 'test/fixtures/align/content/solution/powerpagecomponents/00000000-0000-0000-c047-000000000003/powerpagecomponent.xml',
            },
            region: { startLine: 1 },
          },
        },
      ],
    });
  });

  it('keeps Markdown under the cap with the counts exact', async () => {
    const result = await pair('missing');
    const many: AlignResult = {
      ...result,
      findings: Array.from({ length: 2000 }, (_, i) => ({
        ...result.findings[0]!,
        name: `Role ${i}`,
        recordId: `id-${i}`,
      })),
      counts: { error: 2000, warning: 0, info: 0 },
    };
    const markdown = formatMarkdown(many);
    expect(markdown.length).toBeLessThanOrEqual(MARKDOWN_MAX_LENGTH);
    expect(markdown).toContain('2000 errors, 0 warnings.');
    expect(markdown).toMatch(/_and \d+ more: run `pageslens align` locally/);
  });
});
