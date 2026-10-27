import { classicModelFields } from '../adapters/classic-site.js';
import { normalizeNewlines } from '../model/normalize.js';
import type { SiteFormat, SiteRecord } from '../model/schema.js';

// Brings a record from either side to one form before comparing, so what two snapshots of one
// site always differ in isn't reported (specs/0008, "What isn't a difference"). Every rule here
// comes from comparing the committed pairs field by field; a difference not covered is reported.

/**
 * Fields left out of the comparison, by kind (`*` for every kind). A closed list: each one is
 * written by one side only, or written differently for a reason that isn't a difference.
 */
export const ALIGN_IGNORED: Record<string, readonly string[]> = {
  // The record's GUID is how sides match; the site is the same by then. `statecode` is compared
  // as active or inactive; `statuscode` is an element the solution adapter doesn't read.
  '*': ['id', 'websiteid', 'statecode', 'statuscode'],
  // The note a download keeps a web file's content in
  webfile: ['annotationid', 'filename', 'mimetype', 'isdocument', 'objectid', 'objecttypecode'],
  // A GUID in a download, an LCID in a solution
  websitelanguage: ['portallanguageid', 'systemlanguage'],
  // A download names a permission by `entityname`, which both sides have
  tablepermission: ['name'],
  // Written by one side only
  webpagerule: ['adx_accesscontrolrule_publishingstate'],
  weblink: ['displaypagevalidation'],
  website: ['enhancedauthorization'],
};

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Keys a form's or list's JSON gives the .NET type under: `$type` in a solution, `Type` in a download. */
const TYPE_KEYS = new Set(['$type', 'Type']);

/** A field's value in one form: `canonical` for comparing, `display` for output. */
export interface FieldValue {
  canonical: string;
  display: string;
}

export interface AlignRecord {
  kind: string;
  id: string;
  name: string;
  active: boolean;
  /** Fields with a value, ignored ones left out. */
  fields: Map<string, FieldValue>;
  /** Every field the record has, empty or not: what its side's format writes for the kind. */
  keys: Set<string>;
  /** Side files and inline text with a value, under the side file names. */
  text: Map<string, string>;
  /** Web files only: the content file, relative to the side's folder. */
  contentFile?: string;
  /** The record's file, relative to the side's folder. */
  file: string;
}

/** The record in one form, or undefined for a record without a GUID (it can't be matched). */
export function normalizeRecord(record: SiteRecord, format: SiteFormat): AlignRecord | undefined {
  if (!record.id) return undefined;
  const raw =
    format === 'classic-download' ? classicModelFields(record.kind, record.fields) : record.fields;
  const ignored = new Set([...ALIGN_IGNORED['*']!, ...(ALIGN_IGNORED[record.kind] ?? [])]);

  const fields = new Map<string, FieldValue>();
  for (const [key, value] of Object.entries(raw)) {
    if (ignored.has(key)) continue;
    const normalized = normalizeValue(value);
    if (normalized) fields.set(key, normalized);
  }
  if (record.kind === 'sitesetting') {
    // A setting with no `source` takes its own value. One backed by a variable is compared on
    // `source` and `envvar_schema`: a download has only the leftover value (specs/0007).
    if (!fields.has('source')) fields.set('source', { canonical: '0', display: '0' });
    if (fields.get('source')?.canonical === '1') fields.delete('value');
  }

  const text = new Map(
    Object.entries(record.text)
      .filter(([, value]) => value !== '')
      .map(([key, value]) => [key, normalizeNewlines(value)]),
  );
  const entityName = typeof raw.entityname === 'string' ? raw.entityname : '';
  return {
    kind: record.kind,
    id: record.id,
    name: record.name || entityName || record.id,
    active: isActive(raw.statecode),
    fields,
    keys: new Set(Object.keys(raw).filter((key) => !ignored.has(key))),
    text,
    ...(record.contentFile && { contentFile: record.contentFile }),
    file: record.source.file,
  };
}

/** Active unless `statecode` is set to something other than 0. */
function isActive(state: unknown): boolean {
  return state === undefined || state === null || state === '' || state === '0' || state === 0;
}

/**
 * A value in one form, or undefined when it's empty: an empty string or list is no value.
 * GUIDs are lower-cased, lists of GUIDs are sets, and JSON objects and arrays in a string are
 * compared as JSON, with keys in any order and the type keys left out.
 */
export function normalizeValue(value: unknown): FieldValue | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') {
    if (value === '') return undefined;
    const text = normalizeNewlines(value);
    if (GUID.test(text)) return { canonical: text.toLowerCase(), display: text.toLowerCase() };
    const json = parseJson(text);
    if (json !== undefined) return { canonical: `json:${stableJson(json)}`, display: text };
    return { canonical: text, display: text };
  }
  if (Array.isArray(value)) {
    const items = value.map(normalizeValue).filter((item) => item !== undefined);
    if (items.length === 0) return undefined;
    const set = items.every((item) => GUID.test(item.canonical));
    const canonical = items.map((item) => item.canonical);
    const display = items.map((item) => item.display);
    if (set) {
      canonical.sort();
      display.sort();
    }
    return { canonical: `list:${JSON.stringify(canonical)}`, display: display.join(', ') };
  }
  if (typeof value === 'object') {
    const json = stableJson(value);
    return json === '{}' ? undefined : { canonical: `json:${json}`, display: json };
  }
  const text = String(value as string | number | boolean);
  return { canonical: text, display: text };
}

/** A JSON object or array in a string, or undefined when it isn't one. */
function parseJson(text: string): unknown {
  if (!/^\s*[[{]/.test(text)) return undefined;
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === 'object' ? value : undefined;
  } catch {
    return undefined;
  }
}

/** JSON with object keys sorted and the type keys left out. */
function stableJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !TYPE_KEYS.has(key))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, v]) => [key, sortKeys(v)]),
  );
}
