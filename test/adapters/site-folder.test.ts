import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vite-plus/test';
import { loadSiteFolder, resolveSiteRoot, SiteLoadError } from '../../src/adapters/site-folder.js';

const ECOFLUX = 'test/fixtures/ecoflux';
const BROKEN = 'test/fixtures/broken';

describe('loadSiteFolder: ecoflux', async () => {
  const site = await loadSiteFolder(ECOFLUX);

  it('reads every record, matching the 143 GUIDs spike 0 found', () => {
    expect(site.records).toHaveLength(143);
    expect(site.unrecognizedFiles).toEqual([]);
    expect(site.website).toMatchObject({
      id: '8f7bf824-ba20-4d0d-9a86-b2cafa3c34a6',
      name: 'EcoFlux',
    });
  });

  it('skips .portalconfig', () => {
    expect(site.records.some((r) => r.source.file.startsWith('.portalconfig/'))).toBe(false);
  });

  it('types web roles with the built-in role flags', () => {
    expect(site.webRoles.map((r) => [r.name, r.anonymous, r.authenticated])).toEqual([
      ['Administrators', false, false],
      ['Anonymous Users', true, false],
      ['Asset Manager', false, false],
      ['Authenticated Users', false, true],
      ['Logistics Partner', false, false],
    ]);
  });

  it('types table permissions', () => {
    expect(site.tablePermissions).toHaveLength(9);
    expect(site.tablePermissions.find((p) => p.name === 'Asset - Asset Manager CRUD')).toEqual({
      id: '08aa7eb7-f93f-40ab-b07d-1118581767d8',
      name: 'Asset - Asset Manager CRUD',
      table: 'dwcrm_asset',
      scope: 'account',
      scopeValue: 756150002,
      privileges: {
        read: true,
        write: true,
        create: true,
        delete: true,
        append: false,
        appendto: true,
      },
      roleIds: ['323f94e6-c646-4832-bd7f-daa1572b20fe'],
      contactRelationship: undefined,
      accountRelationship: undefined,
      parentPermissionId: undefined,
      parentRelationship: undefined,
      source: { file: 'table-permissions/Asset---Asset-Manager-CRUD.tablepermission.yml' },
    });
  });

  it('keeps site setting values verbatim', () => {
    const byName = new Map(site.siteSettings.map((s) => [s.name, s.value]));
    expect(site.siteSettings).toHaveLength(60);
    expect(byName.get('Webapi/dwcrm_asset/enabled')).toBe('true');
    expect(byName.get('Webapi/dwcrm_conditionlog/fields')).toMatch(/^_dwcrm_assetid_value,/);
    // A setting with no value in Dataverse has no `value` key in the YAML
    expect(byName.has('Authentication/OpenAuth/Microsoft/ClientSecret')).toBe(true);
    expect(byName.get('Authentication/OpenAuth/Microsoft/ClientSecret')).toBeUndefined();
  });

  it('types page rules and website access with their roles', () => {
    expect(site.webPageRules.map((r) => [r.name, r.right, r.roleIds.length])).toEqual([
      ['Grant Change to Administrators', 1, 1],
      ['Grant Change to Content', 1, 0],
    ]);
    expect(site.websiteAccess.map((a) => [a.name, a.roleIds.length])).toEqual([
      ['Administrative permissions for Blank Template', 1],
      ['Preview permission for Blank Template', 0],
    ]);
  });

  it('attaches side files with normalised newlines', () => {
    const home = site.records.find((r) => r.source.file === 'web-pages/home/Home.webpage.yml');
    expect(Object.keys(home?.text ?? {}).sort()).toEqual([
      'copy',
      'custom_css',
      'custom_javascript',
      'summary',
    ]);
    for (const record of site.records) {
      for (const text of Object.values(record.text)) expect(text).not.toContain('\r');
    }
  });

  it('points each web file at its content', () => {
    const webFiles = site.records.filter((r) => r.kind === 'webfile');
    expect(webFiles).toHaveLength(8);
    // Folder and file name differ in case; the content file is found anyway
    expect(webFiles.find((r) => r.name === 'index-t6V5j7hf.js')?.contentFile).toBe(
      'web-files/index-t6v5j7hf.js/index-t6V5j7hf.js',
    );
    expect(webFiles.every((r) => r.contentFile)).toBe(true);
  });

  it('sorts records by source file', () => {
    const files = site.records.map((r) => r.source.file);
    expect(files).toEqual([...files].sort());
  });
});

describe('loadSiteFolder: broken', async () => {
  const site = await loadSiteFolder(BROKEN);
  const permission = (name: string) => site.tablePermissions.find((p) => p.name === name);

  it('reads a permission with no roles as an empty role list', () => {
    expect(permission('Incident - No Role')?.roleIds).toEqual([]);
  });

  it('reads parent and contact relationships', () => {
    expect(permission('Incident Comment - Case Manager Parent')).toMatchObject({
      scope: 'parent',
      parentPermissionId: '00000000-0000-0000-0002-000000000003',
      parentRelationship: 'incident_adx_portalcomments',
    });
    expect(permission('Incident - Case Manager Contact')).toMatchObject({
      scope: 'contact',
      contactRelationship: 'incident_customer_contacts',
    });
  });

  it('reads a quoted wildcard field list as the string *', () => {
    expect(site.siteSettings.find((s) => s.name === 'Webapi/contact/fields')?.value).toBe('*');
  });
});

describe('resolveSiteRoot', () => {
  it('accepts the .powerpages-site folder or the folder that contains it', async () => {
    const { root } = await resolveSiteRoot(ECOFLUX);
    expect(root.replaceAll('\\', '/')).toMatch(/test\/fixtures\/ecoflux\/\.powerpages-site$/);
    expect(await resolveSiteRoot(root)).toEqual({ root });
    expect((await loadSiteFolder(root)).layout).toBe('code');
  });

  it('tells a classic site folder by the adx_ keys in website.yml', async () => {
    const { root } = await resolveSiteRoot('test/fixtures/classic');
    expect(root.replaceAll('\\', '/')).toMatch(/test\/fixtures\/classic$/);
    const site = await loadSiteFolder(root);
    expect([site.layout, site.format]).toEqual(['classic', 'classic-download']);
  });
});

describe('loadSiteFolder: errors', () => {
  let temp: string | undefined;
  afterEach(async () => {
    if (temp) await rm(temp, { recursive: true, force: true });
    temp = undefined;
  });

  async function site(files: Record<string, string>): Promise<string> {
    temp = await mkdtemp(join(tmpdir(), 'pageslens-'));
    for (const [file, content] of Object.entries(files)) {
      const path = join(temp, '.powerpages-site', file);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content);
    }
    return temp;
  }

  async function problems(path: string) {
    const error = await loadSiteFolder(path).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SiteLoadError);
    return error as SiteLoadError;
  }

  const website = 'id: 8f7bf824-ba20-4d0d-9a86-b2cafa3c34a6\nname: Test\n';

  it('fails when there is no site folder', async () => {
    temp = await mkdtemp(join(tmpdir(), 'pageslens-'));
    expect((await problems(temp)).message).toMatch(
      /No \.powerpages-site folder, website\.yml or unpacked solution/,
    );
  });

  it('reads a website.yml with adx_ keys as a classic site', async () => {
    const path = await site({ 'website.yml': 'adx_name: Test\nadx_websiteid: x\n' });
    expect((await problems(path)).problems).toEqual([
      { file: 'website.yml', message: 'adx_websiteid: expected a GUID' },
    ]);
  });

  it('reports invalid YAML with the file path', async () => {
    const path = await site({
      'website.yml': website,
      'web-roles/Bad.webrole.yml': 'id: [unclosed\n',
    });
    const error = await problems(path);
    expect(error.problems).toHaveLength(1);
    expect(error.problems[0]?.file).toBe('web-roles/Bad.webrole.yml');
    expect(error.problems[0]?.message).toMatch(/^invalid YAML/);
  });

  it('reports every missing or malformed field, not only the first', async () => {
    const path = await site({
      'website.yml': website,
      'table-permissions/A.tablepermission.yml': 'id: not-a-guid\nentityname: A\nscope: global\n',
      'web-roles/B.webrole.yml': 'id: 2e0318dd-699b-40d9-829b-4f0df96c8a91\n',
    });
    const error = await problems(path);
    expect(error.problems.map((p) => `${p.file}: ${p.message}`)).toEqual([
      'table-permissions/A.tablepermission.yml: entitylogicalname: Invalid input: expected string, received undefined',
      'table-permissions/A.tablepermission.yml: id: expected a GUID',
      'table-permissions/A.tablepermission.yml: scope: expected a whole number',
      'web-roles/B.webrole.yml: name: Invalid input: expected string, received undefined',
    ]);
  });
});
