import { posix } from 'node:path';
import type { Site, SiteRecord } from '../model/schema.js';
import {
  buildSite,
  isMapping,
  listFiles,
  readRecordFiles,
  readYaml,
  listRecords,
  WEBSITE_FILE,
  type FieldMapping,
  type Problem,
} from './common.js';
import type { FileSource } from './files.js';

// `pac pages download` writes the site folder itself (no `.powerpages-site`), with every key
// `adx_`-prefixed and each record's id under `adx_<entity>id`. Records of some kinds are one
// list per kind at the root (`webrole.yml`); the rest are `<name>.<kind>.yml` files in folders,
// as in a code site. The same layout comes from `--modelVersion 1` and `2`.

/** The record's own id key, where the entity name isn't the kind. */
const ID_KEYS: Record<string, string> = {
  tablepermission: 'adx_entitypermissionid',
  webpagerule: 'adx_webpageaccesscontrolruleid',
  basicform: 'adx_entityformid',
  basicformmetadata: 'adx_entityformmetadataid',
};

/** Relationship lists keep their names in both layouts, so they keep the prefix. */
const RELATIONSHIP_KEYS = new Set([
  'adx_entitypermission_webrole',
  'adx_webpageaccesscontrolrule_webrole',
  'adx_websiteaccess_webrole',
]);

const idKey = (kind: string) => ID_KEYS[kind] ?? `adx_${kind}id`;

const CLASSIC_FIELDS: FieldMapping = {
  identify: (kind, fields) => {
    const id = fields[idKey(kind)];
    return {
      id: typeof id === 'string' && id ? id.toLowerCase() : undefined,
      name: typeof fields.adx_name === 'string' && fields.adx_name ? fields.adx_name : undefined,
    };
  },
  lists: true,
  modelFields: (kind, fields) => {
    const own = idKey(kind);
    return Object.fromEntries(
      Object.entries(fields).map(([key, value]) => {
        if (key === own) return ['id', value];
        if (RELATIONSHIP_KEYS.has(key) || !key.startsWith('adx_')) return [key, value];
        return [key.slice('adx_'.length), value];
      }),
    );
  },
  sourceKey: (kind, key) => {
    if (key === 'id') return idKey(kind);
    return RELATIONSHIP_KEYS.has(key) ? key : `adx_${key}`;
  },
};

/** A classic `website.yml` names the site under `adx_name` and has its id under `adx_websiteid`. */
export function isClassicWebsite(website: unknown): boolean {
  return isMapping(website) && 'adx_websiteid' in website;
}

/** Reads a classic site folder: root lists (`webrole.yml`) plus record files in folders. */
export async function readClassicSite(source: FileSource): Promise<Site> {
  const problems: Problem[] = [];
  const files = await listFiles(source);
  const claimed = new Set<string>();
  const records = await readRecordFiles(source, files, CLASSIC_FIELDS, problems, claimed);
  records.push(...(await readRootLists(source, files, problems, claimed)));
  return buildSite(source, files, records, claimed, CLASSIC_FIELDS, problems);
}

/** `webrole.yml` at the root is a list of web roles: kind `webrole`, one record per item. */
async function readRootLists(
  source: FileSource,
  files: string[],
  problems: Problem[],
  claimed: Set<string>,
): Promise<SiteRecord[]> {
  const records: SiteRecord[] = [];
  for (const file of files) {
    if (file.includes('/') || file === WEBSITE_FILE || claimed.has(file)) continue;
    if (posix.extname(file) !== '.yml') continue;
    const kind = posix.basename(file, '.yml');

    const value = await readYaml(source, file, problems);
    claimed.add(file);
    if (value !== undefined)
      records.push(...listRecords(kind, value, file, CLASSIC_FIELDS, problems));
  }
  return records;
}
