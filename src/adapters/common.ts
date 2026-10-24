import { readdir, readFile } from 'node:fs/promises';
import { basename, dirname, join, posix, relative } from 'node:path';
import { parse, YAMLParseError } from 'yaml';
import type { z } from 'zod';
import { WEBSITE_KIND } from '../model/kinds.js';
import { compareText as compare, normalizeNewlines, toPosixPath } from '../model/normalize.js';
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

// What both download layouts share: `<base>.<kind>.yml` record files with side files next to
// them, every problem collected instead of stopping at the first, and the typed model built
// from the records. The adapters differ in where records live and what their keys are called.

export const WEBSITE_FILE = 'website.yml';
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

/** How an adapter reads one record: its id and name, and its fields under the model's keys. */
export interface FieldMapping {
  identify(kind: string, fields: Record<string, unknown>): Pick<SiteRecord, 'id' | 'name'>;
  /** The fields the typed schemas parse; the record itself keeps the keys as downloaded. */
  modelFields(kind: string, fields: Record<string, unknown>): Record<string, unknown>;
  /** The downloaded key for a model key, so problems name the key that's in the file. */
  sourceKey(kind: string, key: string): string;
  /** Whether a record file can hold a list, one record per item (classic child records). */
  lists: boolean;
}

export async function listFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => toPosixPath(relative(root, join(entry.parentPath, entry.name))))
    .filter((file) => !SKIPPED_FOLDERS.some((folder) => file.startsWith(`${folder}/`)))
    .sort(compare);
}

/** The parsed YAML document, or undefined (with a problem) when it doesn't parse. */
export async function readYaml(root: string, file: string, problems: Problem[]): Promise<unknown> {
  const text = await readFile(join(root, file), 'utf8');
  try {
    return parse(text, { schema: 'failsafe' }) as unknown;
  } catch (error) {
    if (!(error instanceof YAMLParseError)) throw error;
    problems.push({ file, message: `invalid YAML: ${error.message}` });
    return undefined;
  }
}

export function isMapping(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function toRecord(
  kind: string,
  fields: Record<string, unknown>,
  file: string,
  mapping: FieldMapping,
): SiteRecord {
  return { kind, ...mapping.identify(kind, fields), fields, text: {}, source: { file } };
}

/** One record per item of a list file; an empty file is an empty list. */
export function listRecords(
  kind: string,
  value: unknown,
  file: string,
  mapping: FieldMapping,
  problems: Problem[],
): SiteRecord[] {
  const items = value === null ? [] : Array.isArray(value) ? value : [value];
  return items.flatMap((item, index) => {
    if (isMapping(item)) return [toRecord(kind, item, file, mapping)];
    problems.push({ file, message: `item ${index + 1}: expected a YAML mapping of fields` });
    return [];
  });
}

/**
 * Reads every `<base>.<kind>.yml` file (and `website.yml` at the root) with the side files next
 * to it. Files it reads, records or not, are added to `claimed`.
 */
export async function readRecordFiles(
  root: string,
  files: string[],
  mapping: FieldMapping,
  problems: Problem[],
  claimed: Set<string>,
): Promise<SiteRecord[]> {
  const records: SiteRecord[] = [];
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
      if (fields === undefined) continue;
      if (!isMapping(fields)) {
        // `<form>.basicform.basicformmetadata.yml`: the form's child records, no side files
        if (mapping.lists && !isWebsite) {
          records.push(...listRecords(kind, fields, file, mapping, problems));
        } else {
          problems.push({ file, message: 'expected a YAML mapping of fields' });
        }
        continue;
      }

      const record = toRecord(kind, fields, file, mapping);
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

    // A web file's content is named like its record (`Logo.png` next to `Logo.png.webfile.yml`,
    // a classic site's one flat folder), or else is the one file in its folder that isn't a
    // record or a side file (a code site's folder per web file)
    const webFiles = records.filter(
      (r) => r.kind === 'webfile' && posix.dirname(r.source.file) === folder,
    );
    for (const webFile of webFiles) {
      const content = webFile.source.file.slice(0, -'.webfile.yml'.length);
      if (folderFiles.includes(content) && !claimed.has(content)) {
        webFile.contentFile = content;
        claimed.add(content);
      }
    }
    const unclaimed = folderFiles.filter((file) => !claimed.has(file));
    if (webFiles.length === 1 && !webFiles[0]!.contentFile && unclaimed.length === 1) {
      webFiles[0]!.contentFile = unclaimed[0]!;
      claimed.add(unclaimed[0]!);
    }
  }
  return records;
}

/** Types the records into a site, or throws every problem found while reading and typing. */
export function buildSite(
  root: string,
  files: string[],
  records: SiteRecord[],
  claimed: Set<string>,
  mapping: FieldMapping,
  problems: Problem[],
): Site {
  const websiteRecord = records.find((r) => r.kind === WEBSITE_KIND);
  if (!websiteRecord) throw new SiteLoadError(`${WEBSITE_FILE} is missing or unreadable`, problems);

  // Records that share a file (a classic download's `webrole.yml`) keep the order they're listed in
  records.sort((a, b) => compare(a.source.file, b.source.file));
  const typed = <T extends NamedSchema>(schema: T, record: SiteRecord) =>
    typedRecord(schema, record, mapping, problems);
  const ofKind = <T extends NamedSchema>(kind: string, schema: T) =>
    records
      .filter((r) => r.kind === kind)
      .flatMap((r) => typed(schema, r))
      .sort((a, b) => compare(a.name, b.name) || compare(a.id, b.id));

  const website = typed(websiteSchema, websiteRecord)[0];
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

function typedRecord<T extends NamedSchema>(
  schema: T,
  record: SiteRecord,
  mapping: FieldMapping,
  problems: Problem[],
): (z.output<T> & { source: SourceRef })[] {
  const result = schema.safeParse(mapping.modelFields(record.kind, record.fields));
  if (result.success) return [{ ...result.data, source: record.source }];
  for (const issue of result.error.issues) {
    const [key, ...rest] = issue.path.map(String);
    const field = key === undefined ? '' : [mapping.sourceKey(record.kind, key), ...rest].join('.');
    problems.push({
      file: record.source.file,
      message: field ? `${field}: ${issue.message}` : issue.message,
    });
  }
  return [];
}
