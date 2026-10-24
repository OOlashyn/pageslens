import { join, resolve } from 'node:path';
import type { Site } from '../model/schema.js';
import { isDirectory, isFile } from '../util/fs.js';
import { isClassicWebsite, readClassicSite } from './classic-site.js';
import {
  buildSite,
  listFiles,
  readRecordFiles,
  readYaml,
  SiteLoadError,
  WEBSITE_FILE,
  type FieldMapping,
  type Problem,
} from './common.js';
import { folderSource, type FileSource } from './files.js';

export { SiteLoadError, type Problem } from './common.js';

export const SITE_FOLDER = '.powerpages-site';

/**
 * `code`: the `.powerpages-site` folder `pac pages download-code-site` writes, with unprefixed keys.
 * `classic`: the site folder `pac pages download` writes, with `adx_` keys and single-file lists.
 */
export type SiteLayout = 'code' | 'classic';

/** A code site's keys are already the model's: `id`, `name`, `entityname`, ... */
const CODE_FIELDS: FieldMapping = {
  identify: (_kind, fields) => ({
    id: typeof fields.id === 'string' && fields.id ? fields.id.toLowerCase() : undefined,
    name: typeof fields.name === 'string' && fields.name ? fields.name : undefined,
  }),
  modelFields: (_kind, fields) => fields,
  sourceKey: (_kind, key) => key,
  lists: false,
};

/**
 * The site folder for `path` and its layout: a `.powerpages-site` inside `path`, or `path` itself
 * when it has a `website.yml`. The keys in `website.yml` tell the layouts apart.
 */
export async function resolveSiteRoot(path: string): Promise<{ root: string; layout: SiteLayout }> {
  const absolute = resolve(path);
  const nested = join(absolute, SITE_FOLDER);
  const root = (await isDirectory(nested)) ? nested : absolute;
  if (!(await isFile(join(root, WEBSITE_FILE)))) {
    throw new SiteLoadError(
      root === nested
        ? `No ${WEBSITE_FILE} found in ${root}`
        : `No ${SITE_FOLDER} folder or ${WEBSITE_FILE} found at ${absolute}`,
    );
  }
  return { root, layout: await siteLayout(folderSource(root)) };
}

/** Reads a downloaded site, in either layout, into a site model. */
export async function loadSiteFolder(path: string): Promise<Site> {
  const { root } = await resolveSiteRoot(path);
  return (await loadSite(folderSource(root))).site;
}

async function siteLayout(source: FileSource): Promise<SiteLayout> {
  return isClassicWebsite(await readYaml(source, WEBSITE_FILE, [])) ? 'classic' : 'code';
}

/** Reads a site folder that has a `website.yml`, on disk or in a commit, in either layout. */
export async function loadSite(source: FileSource): Promise<{ site: Site; layout: SiteLayout }> {
  const layout = await siteLayout(source);
  const site = layout === 'classic' ? await readClassicSite(source) : await readCodeSite(source);
  return { site, layout };
}

/** Reads a `.powerpages-site` folder: one `<name>.<kind>.yml` file per record. */
async function readCodeSite(source: FileSource): Promise<Site> {
  const problems: Problem[] = [];
  const files = await listFiles(source);
  const claimed = new Set<string>();
  const records = await readRecordFiles(source, files, CODE_FIELDS, problems, claimed);
  return buildSite(source, files, records, claimed, CODE_FIELDS, problems);
}
