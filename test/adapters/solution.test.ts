import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vite-plus/test';
import { loadSiteFolder, resolveSiteRoot, SiteLoadError } from '../../src/adapters/site-folder.js';
import { renderSiteDocs } from '../../src/docs/write.js';
import { lint } from '../../src/lint/engine.js';
import type { Site } from '../../src/model/schema.js';
import { tempFiles } from '../helpers.js';

// A solution and a download of the same environment give the same site (specs/0007): the real
// copies are checked against each other, record by record.

const ecoflux = await loadSiteFolder('test/fixtures/ecoflux');
const solutionEcoflux = await loadSiteFolder('test/fixtures/solution-ecoflux');
const registration = await loadSiteFolder('test/fixtures/registration');
const solutionRegistration = await loadSiteFolder('test/fixtures/solution-registration');
const broken = await loadSiteFolder('test/fixtures/solution-broken');

const CARDS_PER_PAGE = '8f6b0323-5fcf-f111-a05a-70a8a52c89ad';

/** The typed model without where each record came from. */
function model(site: Site) {
  // Role lists are sets: a solution lists them in another order than a download
  const strip = <T extends { source: unknown }>(records: T[]) =>
    records.map((record) => {
      const { source, ...rest } = record;
      void source;
      return 'roleIds' in rest && Array.isArray(rest.roleIds)
        ? { ...rest, roleIds: [...(rest.roleIds as string[])].sort() }
        : rest;
    });
  const typed = (records: Site['inactive']) => ({
    webRoles: strip(records.webRoles),
    tablePermissions: strip(records.tablePermissions),
    siteSettings: strip(records.siteSettings),
    webPageRules: strip(records.webPageRules),
    webPages: strip(records.webPages),
    websiteAccess: strip(records.websiteAccess),
  });
  return { website: strip([site.website])[0], ...typed(site), inactive: typed(site.inactive) };
}

/**
 * Each record's side files or inline text, by GUID. Downloads also write empty side files where
 * a solution has no value, so empty text is left out.
 */
function texts(site: Site): Map<string, Record<string, string>> {
  const nonEmpty = (text: Record<string, string>) =>
    Object.fromEntries(Object.entries(text).filter(([, value]) => value !== ''));
  return new Map(
    site.records
      .map((r) => [r.id, nonEmpty(r.text)] as const)
      .filter(([id, text]) => id && Object.keys(text).length > 0)
      .map(([id, text]) => [id!, text]),
  );
}

const findings = (site: Site) =>
  lint(site)
    .findings.map((f) => [f.ruleId, f.severity, f.recordId, f.message].join(' | '))
    .sort();

describe('solution adapter: EcoFlux, a code site', () => {
  it('finds the solution through a pac solution init project', async () => {
    const { root } = await resolveSiteRoot('test/fixtures/solution-ecoflux');
    expect(root.replaceAll('\\', '/')).toMatch(/solution-ecoflux\/src$/);
    expect([solutionEcoflux.format, solutionEcoflux.layout]).toEqual(['solution', 'code']);
    expect(solutionEcoflux.solution).toEqual({ name: 'EcoFluxPortal', version: '1.0.0.0' });
  });

  it('reads the same model as the download', () => {
    expect(model(solutionEcoflux)).toEqual(model(ecoflux));
    const ids = (site: Site) => new Set(site.records.map((r) => r.id));
    expect(ids(solutionEcoflux)).toEqual(ids(ecoflux));
    expect(solutionEcoflux.records).toHaveLength(ecoflux.records.length);
    expect(texts(solutionEcoflux)).toEqual(texts(ecoflux));
  });

  it('gives the same lint findings and docs', () => {
    expect(findings(solutionEcoflux)).toEqual(findings(ecoflux));
    const docs = renderSiteDocs(solutionEcoflux);
    for (const [file, content] of renderSiteDocs(ecoflux)) {
      const expected =
        file === 'index.md'
          ? content.replace('\n- ', '\n- Read from the solution `EcoFluxPortal` 1.0.0.0\n- ')
          : content;
      expect(docs.get(file), file).toBe(expected);
    }
  });

  it('points findings at the component file', () => {
    expect(lint(solutionEcoflux).findings[0]?.source.file).toMatch(
      /^powerpagecomponents\/[0-9a-f-]{36}\/powerpagecomponent\.xml$/,
    );
  });

  it('reads web file content from filecontent/', () => {
    const files = solutionEcoflux.records.filter((r) => r.kind === 'webfile');
    expect(files.length).toBeGreaterThan(0);
    expect(files.every((r) => r.contentFile?.includes('/filecontent/'))).toBe(true);
  });
});

describe('solution adapter: Registration, a classic site', () => {
  it('reads it as a classic site', () => {
    expect([solutionRegistration.format, solutionRegistration.layout]).toEqual([
      'solution',
      'classic',
    ]);
  });

  it('reads the same model as the download, apart from the variable-backed setting', () => {
    const withoutVariable = (site: Site) => {
      const m = model(site);
      return { ...m, siteSettings: m.siteSettings.filter((s) => s.id !== CARDS_PER_PAGE) };
    };
    expect(withoutVariable(solutionRegistration)).toEqual(withoutVariable(registration));
    expect(solutionRegistration.records).toHaveLength(registration.records.length);
    expect(texts(solutionRegistration)).toEqual(texts(registration));
    expect(findings(solutionRegistration)).toEqual(findings(registration));
  });

  it('reads the variable value the site uses, where the download has only the leftover value', () => {
    const setting = (site: Site) => site.siteSettings.find((s) => s.id === CARDS_PER_PAGE);
    expect(setting(solutionRegistration)).toMatchObject({
      value: '20',
      variable: 'dwcrm_CardsPerPage',
      unknown: false,
    });
    expect(setting(registration)).toMatchObject({ variable: 'dwcrm_CardsPerPage', unknown: true });
    expect(setting(registration)?.value).toBeUndefined();
  });

  it("reads a record's language element into the download's field", () => {
    const languages = (site: Site) =>
      site.records
        .filter((r) => ['webpage', 'contentsnippet', 'weblinkset'].includes(r.kind))
        .map((r) => {
          const fields = r.fields as Record<string, unknown>;
          const language =
            fields.webpagelanguageid ??
            fields.adx_webpagelanguageid ??
            fields.contentsnippetlanguageid ??
            fields.adx_contentsnippetlanguageid ??
            fields.websitelanguageid ??
            fields.adx_websitelanguageid;
          return `${r.id} ${typeof language === 'string' ? language : '-'}`;
        })
        .sort();
    expect(languages(solutionRegistration)).toEqual(languages(registration));
    expect(languages(solutionRegistration).filter((l) => !l.endsWith(' -'))).toHaveLength(179);
  });

  it("keeps a page rule's publishing states, which the download leaves out", () => {
    const rule = (site: Site) =>
      site.records.find(
        (r) => r.kind === 'webpagerule' && r.name === 'Restrict Read on Create Course',
      );
    expect(rule(solutionRegistration)?.fields.adx_accesscontrolrule_publishingstate).toEqual([
      'de110917-5fcf-f111-a05a-70a8a52c89ad',
    ]);
    expect(rule(registration)?.fields.adx_accesscontrolrule_publishingstate).toBeUndefined();
  });
});

describe('solution adapter: hand-written cases', () => {
  const setting = (name: string) => broken.siteSettings.find((s) => s.name === name);

  it('reads variable-backed settings: current value, else default, else not set', () => {
    expect(setting('Webapi/error/innererror')).toMatchObject({ value: 'true', unknown: false });
    expect(setting('Webapi/contact/enabled')).toMatchObject({ value: 'true', unknown: false });
    expect(
      [
        'Webapi/account/enabled',
        'Authentication/OpenIdConnect/Test/ClientSecret',
        'Webapi/lead/enabled',
      ].map((name) => [setting(name)?.value, setting(name)?.noValue]),
    ).toEqual([
      [undefined, "the variable isn't in the solution"],
      [undefined, 'the variable is a secret'],
      [undefined, 'the variable has no value'],
    ]);
  });

  it('lints through the adapter, variable values included', () => {
    expect(lint(broken).findings.map((f) => f.ruleId)).toEqual([
      'global-write-anonymous',
      'webapi-no-permission',
      'webapi-inner-errors',
    ]);
  });

  it('leaves inactive components out, keeps unknown types untyped, and moves inline text', () => {
    expect(broken.inactive.siteSettings.map((s) => s.name)).toEqual(['Search/Enabled']);
    expect(broken.records.find((r) => r.name === 'Hello')?.kind).toBe('component-35');
    const layout = broken.records.find((r) => r.name === 'Layout');
    expect(layout?.text).toEqual({ source: '<div>\n{{ page.title }}\n</div>' });
    expect(layout?.fields.source).toBeUndefined();
    expect(broken.unrecognizedFiles).toEqual([]);
  });
});

describe('solution adapter: errors', () => {
  /** A copy of solution-broken with some files replaced (or removed, for undefined). */
  const solution = (files: Record<string, string | undefined>) =>
    tempFiles(files, { copyFrom: 'test/fixtures/solution-broken' });

  async function failure(path: string): Promise<SiteLoadError> {
    const error = await loadSiteFolder(path).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SiteLoadError);
    return error as SiteLoadError;
  }

  const component = (id: string) => `powerpagecomponents/${id}/powerpagecomponent.xml`;
  const ROLE = '00000000-0000-0000-0007-000000000001';

  it('refuses a solution with more than one site, naming them', async () => {
    const sites = await readFile('test/fixtures/solution-broken/Assets/powerpagesites.xml', 'utf8');
    const second = sites
      .replace('<powerpagesites>\n', '')
      .replace('</powerpagesites>\n', '')
      .replace('00000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000008')
      .replace('Broken Solution', 'Other Site');
    const path = await solution({
      'Assets/powerpagesites.xml': sites.replace('</powerpagesites>', `${second}</powerpagesites>`),
    });
    expect((await failure(path)).message).toMatch(
      /has 2 sites \("Broken Solution", "Other Site"\); pageslens reads a solution with one site$/,
    );
  });

  it('reports every component problem with its file', async () => {
    const role = await readFile(`test/fixtures/solution-broken/${component(ROLE)}`, 'utf8');
    const path = await solution({
      [component(ROLE)]: role.replace('<content>{', '<content>{,'),
      [component('00000000-0000-0000-0007-0000000000aa')]: role.replace(
        'powerpagecomponentid="00000000-0000-0000-0007-000000000001"',
        'powerpagecomponentid="00000000-0000-0000-0007-0000000000ab"',
      ),
      [component('00000000-0000-0000-0007-0000000000ac')]: role
        .replaceAll('000000000001', '0000000000ac')
        .replace('00000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000008'),
    });
    const problems = (await failure(path)).problems.map((p) => [p.file, p.message.split(':')[0]]);
    expect(problems).toEqual([
      [component(ROLE), 'content'],
      [
        component('00000000-0000-0000-0007-0000000000aa'),
        "powerpagecomponentid 00000000-0000-0000-0007-0000000000ab isn't the folder name",
      ],
      [
        component('00000000-0000-0000-0007-0000000000ac'),
        'belongs to another site (00000000-0000-0000-0000-000000000008), not 00000000-0000-0000-0000-000000000007',
      ],
    ]);
  });

  it('says a solution needs Assets/powerpagesites.xml', async () => {
    const path = await solution({ 'Assets/powerpagesites.xml': undefined });
    expect((await failure(path)).message).toMatch(/Assets\/powerpagesites\.xml is missing$/);
  });

  it('says the YAML source control format is not read yet', async () => {
    const path = await tempFiles({ 'solutions/Test/solution.yml': 'SolutionManifest: {}\n' });
    expect((await failure(path)).message).toMatch(
      /YAML source control format, which pageslens doesn't read yet/,
    );
  });
});
