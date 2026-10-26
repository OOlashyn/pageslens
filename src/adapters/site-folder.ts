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
import { isSolution, readSolution, SOLUTION_FILE } from './solution.js';

export { SiteLoadError, type Problem } from './common.js';
export type { SiteLayout } from '../model/schema.js';

export const SITE_FOLDER = '.powerpages-site';

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

/** A `pac solution init` project (what `pac solution clone` writes) keeps the solution in `src/`. */
const PROJECT_SOURCE = 'src';

/**
 * Where the site is under a folder, given which files it has (paths relative to the folder): a
 * `.powerpages-site` inside it, the folder itself when it has a `website.yml` or is an unpacked
 * solution, or a solution project's `src/`. `''` is the folder itself; undefined when none.
 */
export async function findSiteRoot(
  has: (file: string) => Promise<boolean>,
): Promise<string | undefined> {
  if (await has(`${SITE_FOLDER}/${WEBSITE_FILE}`)) return SITE_FOLDER;
  if ((await has(WEBSITE_FILE)) || (await has(SOLUTION_FILE))) return '';
  if (await has(`${PROJECT_SOURCE}/${SOLUTION_FILE}`)) return PROJECT_SOURCE;
  return undefined;
}

/** Why there's no site where one was looked for. */
export function noSiteMessage(where: string, yamlSolution: boolean): string {
  return yamlSolution
    ? `${where} is a solution in the YAML source control format, which pageslens doesn't read yet; unpack it with pac solution unpack (XML format)`
    : `No ${SITE_FOLDER} folder, ${WEBSITE_FILE} or unpacked solution (${SOLUTION_FILE}) found at ${where}`;
}

/** The site folder for `path`: see `findSiteRoot`. */
export async function resolveSiteRoot(path: string): Promise<{ root: string }> {
  const absolute = resolve(path);
  const found = await findSiteRoot((file) => isFile(join(absolute, file)));
  if (found === undefined) {
    if (await isDirectory(join(absolute, SITE_FOLDER))) {
      throw new SiteLoadError(`No ${WEBSITE_FILE} found in ${join(absolute, SITE_FOLDER)}`);
    }
    throw new SiteLoadError(
      noSiteMessage(absolute, await isDirectory(join(absolute, 'solutions'))),
    );
  }
  return { root: join(absolute, found) };
}

/** Reads a downloaded site or an unpacked solution into a site model. */
export async function loadSiteFolder(path: string): Promise<Site> {
  const { root } = await resolveSiteRoot(path);
  return loadSite(folderSource(root));
}

/** Reads a site folder (a download, or an unpacked solution), on disk or in a commit. */
export async function loadSite(source: FileSource): Promise<Site> {
  if (isSolution(await source.list())) return readSolution(source);
  const website = await readYaml(source, WEBSITE_FILE, []);
  return isClassicWebsite(website) ? readClassicSite(source) : readCodeSite(source);
}

/** Reads a `.powerpages-site` folder: one `<name>.<kind>.yml` file per record. */
async function readCodeSite(source: FileSource): Promise<Site> {
  const problems: Problem[] = [];
  const files = await listFiles(source);
  const claimed = new Set<string>();
  const records = await readRecordFiles(source, files, CODE_FIELDS, problems, claimed);
  return buildSite(
    { layout: 'code', format: 'code-download' },
    source,
    files,
    records,
    claimed,
    CODE_FIELDS,
    problems,
  );
}
