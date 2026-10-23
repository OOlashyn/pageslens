import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, dirname, join, posix, relative, resolve } from 'node:path';
import { parse, YAMLParseError } from 'yaml';
import type { z } from 'zod';
import { WEBSITE_KIND } from '../model/kinds.js';
import { normalizeNewlines, toPosixPath } from '../model/normalize.js';
import {
  siteSettingSchema,
  tablePermissionSchema,
  webPageRuleSchema,
  webRoleSchema,
  websiteAccessSchema,
  websiteSchema,
  type Site,
  type SiteRecord,
  type SourceRef,
} from '../model/schema.js';

const SITE_FOLDER = '.powerpages-site';
const WEBSITE_FILE = 'website.yml';
/** pac's per-environment sync state, not site configuration. */
const SKIPPED_FOLDERS = ['.portalconfig'];
/** `<base>.<kind>.yml`, e.g. `index.html.webfile.yml` → base `index.html`, kind `webfile`. */
const RECORD_FILE = /^(?<base>.+)\.(?<kind>[a-z]+)\.yml$/;

/** Every typed record has an id and a name. */
type NamedSchema = z.ZodType<{ id: string; name: string }>;

export interface Problem {
  /** Path relative to the site folder, when the problem is in one file. */
  file?: string;
  message: string;
}

/** The folder can't be read as a site. Every problem found is listed, not only the first. */
export class SiteLoadError extends Error {
  constructor(
    message: string,
    readonly problems: Problem[] = [],
  ) {
    super(message);
    this.name = 'SiteLoadError';
  }
}

/** The `.powerpages-site` folder for `path`: the path itself, or a `.powerpages-site` inside it. */
export async function resolveSiteRoot(path: string): Promise<string> {
  const absolute = resolve(path);
  const nested = join(absolute, SITE_FOLDER);
  if (await isDirectory(nested)) return nested;
  if (await isFile(join(absolute, WEBSITE_FILE))) return absolute;
  throw new SiteLoadError(`No ${SITE_FOLDER} folder found at ${absolute}`);
}

/** Reads a `.powerpages-site` folder (enhanced data model) into a site model. */
export async function loadSiteFolder(path: string): Promise<Site> {
  const root = await resolveSiteRoot(path);
  const problems: Problem[] = [];
  const files = await listFiles(root);

  const records: SiteRecord[] = [];
  const claimed = new Set<string>();
  const filesByFolder = Map.groupBy(files, (file) => posix.dirname(file));

  for (const [folder, folderFiles] of filesByFolder) {
    for (const file of folderFiles) {
      const name = posix.basename(file);
      const isWebsite = file === WEBSITE_FILE;
      const match = isWebsite ? undefined : RECORD_FILE.exec(name);
      if (!isWebsite && !match?.groups) continue;

      const kind = isWebsite ? WEBSITE_KIND : match!.groups!.kind!;
      const fields = await readYaml(root, file, problems);
      claimed.add(file);
      if (!fields) continue;

      const record: SiteRecord = {
        kind,
        id: typeof fields.id === 'string' && fields.id ? fields.id.toLowerCase() : undefined,
        name: typeof fields.name === 'string' && fields.name ? fields.name : undefined,
        fields,
        text: {},
        source: { file },
      };

      if (!isWebsite) {
        // Side files sit next to the record: `Home.webpage.copy.html` holds the `copy` field
        const prefix = `${match!.groups!.base}.${kind}.`;
        for (const side of folderFiles) {
          const sideName = posix.basename(side);
          if (side === file || !sideName.startsWith(prefix) || sideName.endsWith('.yml')) continue;
          const field = sideName.slice(prefix.length).replace(/\.[^.]+$/, '');
          record.text[field] = normalizeNewlines(await readFile(join(root, side), 'utf8'));
          claimed.add(side);
        }
      }
      records.push(record);
    }

    // A web file's content is the one file in its folder that isn't a record or a side file
    const webFiles = records.filter(
      (r) => r.kind === 'webfile' && posix.dirname(r.source.file) === folder,
    );
    const unclaimed = folderFiles.filter((file) => !claimed.has(file));
    if (webFiles.length === 1 && unclaimed.length === 1) {
      webFiles[0]!.contentFile = unclaimed[0]!;
      claimed.add(unclaimed[0]!);
    }
  }

  const websiteRecord = records.find((r) => r.kind === WEBSITE_KIND);
  if (!websiteRecord) throw new SiteLoadError(`${WEBSITE_FILE} is missing or unreadable`, problems);
  if (Object.keys(websiteRecord.fields).some((key) => key.startsWith('adx_'))) {
    throw new SiteLoadError(
      'This looks like a standard data model download (adx_ fields in website.yml). ' +
        'Only the enhanced data model is supported for now.',
    );
  }

  records.sort((a, b) => compare(a.source.file, b.source.file));
  const ofKind = <T extends NamedSchema>(kind: string, schema: T) =>
    records
      .filter((r) => r.kind === kind)
      .flatMap((r) => typed(schema, r, problems))
      .sort((a, b) => compare(a.name, b.name) || compare(a.id, b.id));

  const website = typed(websiteSchema, websiteRecord, problems)[0];
  const site = {
    root,
    records,
    webRoles: ofKind('webrole', webRoleSchema),
    tablePermissions: ofKind('tablepermission', tablePermissionSchema),
    siteSettings: ofKind('sitesetting', siteSettingSchema),
    webPageRules: ofKind('webpagerule', webPageRuleSchema),
    websiteAccess: ofKind('websiteaccess', websiteAccessSchema),
    unrecognizedFiles: files.filter((file) => !claimed.has(file)),
  };

  if (problems.length > 0 || !website) {
    problems.sort((a, b) => compare(a.file ?? '', b.file ?? '') || compare(a.message, b.message));
    throw new SiteLoadError(
      `${problems.length} problem(s) reading ${basename(root)} at ${dirname(root)}`,
      problems,
    );
  }
  return { ...site, website };
}

async function listFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => toPosixPath(relative(root, join(entry.parentPath, entry.name))))
    .filter((file) => !SKIPPED_FOLDERS.some((folder) => file.startsWith(`${folder}/`)))
    .sort(compare);
}

async function readYaml(
  root: string,
  file: string,
  problems: Problem[],
): Promise<Record<string, unknown> | undefined> {
  const text = await readFile(join(root, file), 'utf8');
  try {
    const value: unknown = parse(text, { schema: 'failsafe' });
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    problems.push({ file, message: 'expected a YAML mapping of fields' });
  } catch (error) {
    if (!(error instanceof YAMLParseError)) throw error;
    problems.push({ file, message: `invalid YAML: ${error.message}` });
  }
  return undefined;
}

function typed<T extends NamedSchema>(
  schema: T,
  record: SiteRecord,
  problems: Problem[],
): (z.output<T> & { source: SourceRef })[] {
  const result = schema.safeParse(record.fields);
  if (result.success) return [{ ...result.data, source: record.source }];
  for (const issue of result.error.issues) {
    const field = issue.path.join('.');
    problems.push({
      file: record.source.file,
      message: field ? `${field}: ${issue.message}` : issue.message,
    });
  }
  return [];
}

/** Locale-independent ordering, so output is the same on every machine. */
function compare(a: string | undefined, b: string | undefined): number {
  const left = a ?? '';
  const right = b ?? '';
  return left < right ? -1 : left > right ? 1 : 0;
}

async function isDirectory(path: string): Promise<boolean> {
  return (await stat(path).catch(() => undefined))?.isDirectory() ?? false;
}

async function isFile(path: string): Promise<boolean> {
  return (await stat(path).catch(() => undefined))?.isFile() ?? false;
}
