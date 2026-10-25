import { z } from 'zod';
import { scopeFromValue } from './kinds.js';

// The adapter parses YAML with the failsafe schema, so every scalar arrives as a string
// (site setting values stay verbatim) and these schemas do the typing. An empty value
// (`parentpageid: `) arrives as '' and is treated as absent. The adapters hand these schemas the
// model's keys (`id`, `name`, `entityname`); a classic download's `adx_` keys are mapped first.

const optionalText = z
  .string()
  .nullish()
  .transform((value) => (value ? value : undefined));

const guid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'expected a GUID')
  .transform((value) => value.toLowerCase());

const optionalGuid = z.union([z.literal('').transform(() => undefined), guid]).optional();

const guidList = z
  .union([z.literal('').transform(() => undefined), z.array(guid)])
  .nullish()
  .transform((value) => value ?? []);

const flag = z.stringbool().optional().default(false);

const integer = z
  .string()
  .regex(/^-?\d+$/, 'expected a whole number')
  .transform(Number);

export const websiteSchema = z.object({
  id: guid,
  name: z.string().min(1),
});

export const webRoleSchema = z
  .object({
    id: guid,
    name: z.string().min(1),
    anonymoususersrole: flag,
    authenticatedusersrole: flag,
  })
  .transform((r) => ({
    id: r.id,
    name: r.name,
    anonymous: r.anonymoususersrole,
    authenticated: r.authenticatedusersrole,
  }));

export const tablePermissionSchema = z
  .object({
    id: guid,
    entityname: z.string().min(1),
    entitylogicalname: z.string().min(1),
    scope: integer,
    read: flag,
    write: flag,
    create: flag,
    delete: flag,
    append: flag,
    appendto: flag,
    adx_entitypermission_webrole: guidList,
    contactrelationship: optionalText,
    accountrelationship: optionalText,
    parententitypermission: optionalGuid,
    parentrelationship: optionalText,
  })
  .transform((p) => ({
    id: p.id,
    name: p.entityname,
    table: p.entitylogicalname,
    scope: scopeFromValue(p.scope),
    scopeValue: p.scope,
    privileges: {
      read: p.read,
      write: p.write,
      create: p.create,
      delete: p.delete,
      append: p.append,
      appendto: p.appendto,
    },
    roleIds: p.adx_entitypermission_webrole,
    contactRelationship: p.contactrelationship,
    accountRelationship: p.accountrelationship,
    parentPermissionId: p.parententitypermission,
    parentRelationship: p.parentrelationship,
  }));

export const siteSettingSchema = z.object({
  id: guid,
  name: z.string().min(1),
  value: optionalText,
});

export const webPageRuleSchema = z
  .object({
    id: guid,
    name: z.string().min(1),
    right: integer.optional(),
    scope: integer.optional(),
    webpageid: optionalGuid,
    adx_webpageaccesscontrolrule_webrole: guidList,
  })
  .transform((r) => ({
    id: r.id,
    name: r.name,
    right: r.right,
    scope: r.scope,
    webPageId: r.webpageid,
    roleIds: r.adx_webpageaccesscontrolrule_webrole,
  }));

// A site has a root page per page and a content page per page and language. Content pages point
// at their root page (`rootwebpageid`), and `parentpageid` points at the parent's root page.
export const webPageSchema = z
  .object({
    id: guid,
    name: z.string().min(1),
    isroot: flag,
    rootwebpageid: optionalGuid,
    parentpageid: optionalGuid,
    partialurl: optionalText,
    hiddenfromsitemap: flag,
  })
  .transform((p) => ({
    id: p.id,
    name: p.name,
    isRoot: p.isroot,
    rootPageId: p.rootwebpageid,
    parentPageId: p.parentpageid,
    partialUrl: p.partialurl,
    hiddenFromSitemap: p.hiddenfromsitemap,
  }));

export const websiteAccessSchema = z
  .object({
    id: guid,
    name: z.string().min(1),
    adx_websiteaccess_webrole: guidList,
  })
  .transform((a) => ({ id: a.id, name: a.name, roleIds: a.adx_websiteaccess_webrole }));

/** Where a record came from: a path relative to the site folder, with forward slashes. */
export interface SourceRef {
  file: string;
}

type Sourced<T extends z.ZodType> = z.output<T> & { source: SourceRef };

export type Website = Sourced<typeof websiteSchema>;
export type WebRole = Sourced<typeof webRoleSchema>;
export type TablePermission = Sourced<typeof tablePermissionSchema>;
export type SiteSetting = Sourced<typeof siteSettingSchema>;
export type WebPageRule = Sourced<typeof webPageRuleSchema>;
export type WebPage = Sourced<typeof webPageSchema>;
export type WebsiteAccess = Sourced<typeof websiteAccessSchema>;

/** Any record in the folder, typed or not, with its YAML fields as parsed (keys as downloaded). */
export interface SiteRecord {
  kind: string;
  id: string | undefined;
  name: string | undefined;
  fields: Record<string, unknown>;
  /** Side files (`Home.webpage.copy.html` → `copy`), newlines normalised. */
  text: Record<string, string>;
  /** Web files only: the file's content, not read. */
  contentFile?: string;
  source: SourceRef;
}

export interface TypedRecords {
  webRoles: WebRole[];
  tablePermissions: TablePermission[];
  siteSettings: SiteSetting[];
  webPageRules: WebPageRule[];
  /** Root and content pages alike. */
  webPages: WebPage[];
  websiteAccess: WebsiteAccess[];
}

/**
 * `code`: the `.powerpages-site` folder `pac pages download-code-site` writes, with unprefixed keys.
 * `classic`: the site folder `pac pages download` writes, with `adx_` keys and single-file lists.
 */
export type SiteLayout = 'code' | 'classic';

export interface Site {
  /** Absolute path of the site folder: the `.powerpages-site` folder, or a classic site's folder. */
  root: string;
  layout: SiteLayout;
  website: Website;
  /** Every record, sorted by source file, inactive ones included. */
  records: SiteRecord[];
  webRoles: WebRole[];
  tablePermissions: TablePermission[];
  siteSettings: SiteSetting[];
  webPageRules: WebPageRule[];
  /** Root and content pages alike. */
  webPages: WebPage[];
  websiteAccess: WebsiteAccess[];
  /**
   * Records marked inactive (`statecode: 1`). They're left out of the lists above, so they grant,
   * restrict and configure nothing, as in Power Pages, but stay here to be named.
   */
  inactive: TypedRecords;
  /** Files that are neither a record, a side file nor web file content. */
  unrecognizedFiles: string[];
}
