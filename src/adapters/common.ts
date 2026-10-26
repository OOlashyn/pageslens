import { posix } from 'node:path';
import { parse, YAMLParseError } from 'yaml';
import type { z } from 'zod';
import { WEBSITE_KIND } from '../model/kinds.js';
import { compareText as compare, normalizeNewlines } from '../model/normalize.js';
import {
  siteSettingSchema,
  tablePermissionSchema,
  webPageRuleSchema,
  webPageSchema,
  webRoleSchema,
  websiteAccessSchema,
  websiteSchema,
  type Site,
  type SiteFormat,
  type SiteLayout,
  type SiteRecord,
  type SourceRef,
  type TypedRecords,
} from '../model/schema.js';
import type { FileSource } from './files.js';

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

export async function listFiles(source: FileSource): Promise<string[]> {
  return (await source.list())
    .filter((file) => !SKIPPED_FOLDERS.some((folder) => file.startsWith(`${folder}/`)))
    .sort(compare);
}

/** The parsed YAML document, or undefined (with a problem) when it doesn't parse. */
export async function readYaml(
  source: FileSource,
  file: string,
  problems: Problem[],
): Promise<unknown> {
  const text = await source.read(file);
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
  source: FileSource,
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
      const fields = await readYaml(source, file, problems);
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
          record.text[field] = normalizeNewlines(await source.read(side));
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

/** What an adapter read, beyond its records. */
export interface SiteKind {
  layout: SiteLayout;
  format: SiteFormat;
  solution?: Site['solution'] | undefined;
}

/**
 * Types the records into a site, or throws every problem found while reading and typing. `files`
 * not in `claimed` are listed as unrecognized.
 */
export function buildSite(
  kind: SiteKind,
  source: FileSource,
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
  const ofKind = <T extends NamedSchema>(kind: string, schema: T, active: boolean) =>
    records
      .filter((r) => r.kind === kind && isInactive(r) !== active)
      .flatMap((r) => typed(schema, r))
      .sort((a, b) => compare(a.name, b.name) || compare(a.id, b.id));
  const typedRecords = (active: boolean): TypedRecords => ({
    webRoles: ofKind('webrole', webRoleSchema, active),
    tablePermissions: ofKind('tablepermission', tablePermissionSchema, active),
    siteSettings: ofKind('sitesetting', siteSettingSchema, active),
    webPageRules: ofKind('webpagerule', webPageRuleSchema, active),
    webPages: ofKind('webpage', webPageSchema, active),
    websiteAccess: ofKind('websiteaccess', websiteAccessSchema, active),
  });

  const website = typed(websiteSchema, websiteRecord)[0];
  const site = {
    root: source.root,
    ...kind,
    records,
    ...typedRecords(true),
    inactive: typedRecords(false),
    unrecognizedFiles: files.filter((file) => !claimed.has(file)),
  };

  if (problems.length > 0 || !website) {
    problems.sort((a, b) => compare(a.file ?? '', b.file ?? '') || compare(a.message, b.message));
    throw new SiteLoadError(`${problems.length} problem(s) reading ${source.label}`, problems);
  }
  return { ...site, website };
}

/**
 * Dataverse writes `statecode: 1` (with `statuscode: 2`) on an inactive record and leaves the key
 * out on an active one, in both layouts.
 */
function isInactive(record: SiteRecord): boolean {
  const state = record.fields.statecode;
  return state === 1 || state === '1';
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
