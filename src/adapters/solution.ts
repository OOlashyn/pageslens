import { posix } from 'node:path';
import { DOMParser, type Element } from '@xmldom/xmldom';
import { WEBSITE_KIND } from '../model/kinds.js';
import { normalizeNewlines } from '../model/normalize.js';
import type { Site, SiteRecord } from '../model/schema.js';
import {
  buildSite,
  isMapping,
  listFiles,
  SiteLoadError,
  type FieldMapping,
  type Problem,
} from './common.js';
import type { FileSource } from './files.js';

// An unpacked solution in the XML format (`pac solution unpack`, or `src/` of a `pac solution
// clone` project) keeps each site component in `powerpagecomponents/<guid>/powerpagecomponent.xml`:
// its name, type and state as elements, and its fields as JSON in `content`, under a classic
// download's keys without `adx_`. Liquid and HTML are inline in `content`, where a download
// writes side files. The site and its languages are in `Assets/`. See specs/0007.

export const SOLUTION_FILE = 'Other/Solution.xml';
const SITES_FILE = 'Assets/powerpagesites.xml';
const LANGUAGES_FILE = 'Assets/powerpagesitelanguages.xml';
const COMPONENT_FILE = /^powerpagecomponents\/(?<folder>[^/]+)\/powerpagecomponent\.xml$/;
const VARIABLE_FILE =
  /^environmentvariabledefinitions\/(?<schema>[^/]+)\/environmentvariabledefinition\.xml$/;

/** `powerpagecomponenttype` → the kind a download names the record by. */
const KINDS: Record<number, string> = {
  1: 'publishingstate',
  2: 'webpage',
  3: 'webfile',
  4: 'weblinkset',
  5: 'weblink',
  6: 'pagetemplate',
  7: 'contentsnippet',
  8: 'webtemplate',
  9: 'sitesetting',
  10: 'webpagerule',
  11: 'webrole',
  12: 'websiteaccess',
  13: 'sitemarker',
  15: 'basicform',
  16: 'basicformmetadata',
  17: 'list',
  18: 'tablepermission',
  24: 'pollplacement',
  26: 'adplacement',
  27: 'botconsumer',
};

/**
 * Fields a download writes as side files (`Home.webpage.copy.html`), by kind, with the name the
 * side file uses where it differs (`customcss` → `Home.webpage.custom_css.css`).
 */
const TEXT_FIELDS: Record<string, Record<string, string>> = {
  webtemplate: { source: 'source' },
  webpage: {
    copy: 'copy',
    summary: 'summary',
    customcss: 'custom_css',
    customjavascript: 'custom_javascript',
  },
  contentsnippet: { value: 'value' },
  basicform: { registerstartupscript: 'custom_javascript' },
  list: { registerstartupscript: 'custom_javascript' },
};

/**
 * The field a download keeps a record's language in, by kind. A solution has it as the element
 * `powerpagesitelanguageid`, outside `content`.
 */
const LANGUAGE_FIELDS: Record<string, string> = {
  webpage: 'webpagelanguageid',
  contentsnippet: 'contentsnippetlanguageid',
  weblinkset: 'websitelanguageid',
};

/** Environment variable types: Secret keeps its value in Azure Key Vault. */
const SECRET_TYPE = '100000005';

/** Why a variable-backed setting has no value in a solution (`SiteSetting.noValue`). */
export const NO_VALUE = {
  missing: "the variable isn't in the solution",
  secret: 'the variable is a secret',
  empty: 'the variable has no value',
} as const;

interface Variable {
  value?: string;
  defaultValue?: string;
  secret: boolean;
}

/** Whether the files are an unpacked solution in the XML format. */
export function isSolution(files: readonly string[]): boolean {
  return files.includes(SOLUTION_FILE);
}

/** Reads an unpacked solution with one site into a site model. */
export async function readSolution(source: FileSource): Promise<Site> {
  const problems: Problem[] = [];
  const files = await listFiles(source);
  const claimed = new Set<string>([SOLUTION_FILE]);
  const xml = (file: string) => readXml(source, file, problems);

  const manifest = firstChild(await xml(SOLUTION_FILE), 'SolutionManifest');
  const solution = manifest && {
    name: childText(manifest, 'UniqueName') ?? '',
    version: childText(manifest, 'Version') ?? '',
  };

  const site = await readWebsite(source, files, problems);
  claimed.add(SITES_FILE);
  const records: SiteRecord[] = site ? [site] : [];
  if (files.includes(LANGUAGES_FILE)) {
    claimed.add(LANGUAGES_FILE);
    const languages = await xml(LANGUAGES_FILE);
    for (const language of languages ? children(languages, 'powerpagesitelanguage') : []) {
      records.push(element(language, 'websitelanguage', 'powerpagesitelanguageid', LANGUAGES_FILE));
    }
  }

  const variables = await readVariables(source, files, problems, claimed);
  for (const file of files) {
    const folder = COMPONENT_FILE.exec(file)?.groups?.folder;
    if (folder === undefined) continue;
    claimed.add(file);
    const record = await readComponent(source, file, folder, site?.id, problems);
    if (!record) continue;
    // A web file's content: `powerpagecomponents/<guid>/filecontent/<filename>`
    const content = files.find((f) => f.startsWith(`${posix.dirname(file)}/filecontent/`));
    if (record.kind === 'webfile' && content) {
      record.contentFile = content;
      claimed.add(content);
    }
    records.push(record);
  }

  // Only the site's own files can be unrecognized: a solution holds far more than a site
  const siteFiles = files.filter(
    (file) =>
      file.startsWith('powerpagecomponents/') ||
      file.startsWith('environmentvariabledefinitions/') ||
      file.startsWith('Assets/powerpagesite'),
  );
  return buildSite(
    { layout: isCodeSite(records) ? 'code' : 'classic', format: 'solution', solution },
    source,
    siteFiles,
    records,
    claimed,
    solutionFields(variables),
    problems,
  );
}

/** The one site in `Assets/powerpagesites.xml`, as the `website` record. */
async function readWebsite(
  source: FileSource,
  files: readonly string[],
  problems: Problem[],
): Promise<SiteRecord | undefined> {
  if (!files.includes(SITES_FILE)) {
    throw new SiteLoadError(`No site in ${source.label}: ${SITES_FILE} is missing`, problems);
  }
  const root = await readXml(source, SITES_FILE, problems);
  const sites = root ? children(root, 'powerpagesite') : [];
  if (root && sites.length === 0) {
    throw new SiteLoadError(`No site in ${source.label}: ${SITES_FILE} lists none`, problems);
  }
  if (sites.length > 1) {
    const names = sites.map(
      (s) => `"${childText(s, 'name') ?? s.getAttribute('powerpagesiteid')}"`,
    );
    throw new SiteLoadError(
      `${source.label} has ${sites.length} sites (${names.join(', ')}); pageslens reads a solution with one site`,
    );
  }
  return sites[0] && element(sites[0], WEBSITE_KIND, 'powerpagesiteid', SITES_FILE);
}

/** A site or language element: its id attribute, `name`, and the fields in its `content`. */
function element(node: Element, kind: string, idAttribute: string, file: string): SiteRecord {
  const id = node.getAttribute(idAttribute)?.toLowerCase() || undefined;
  const name = childText(node, 'name');
  const fields = { ...parseContent(childText(node, 'content'), file, []), id, name };
  return { kind, id, name, fields, text: {}, source: { file } };
}

async function readComponent(
  source: FileSource,
  file: string,
  folder: string,
  siteId: string | undefined,
  problems: Problem[],
): Promise<SiteRecord | undefined> {
  const root = await readXml(source, file, problems);
  if (!root) return undefined;
  const id = root.getAttribute('powerpagecomponentid')?.toLowerCase() || undefined;
  if (id !== folder.toLowerCase()) {
    problems.push({
      file,
      message: `powerpagecomponentid ${id ?? '(none)'} isn't the folder name`,
    });
  }
  const type = Number(childText(root, 'powerpagecomponenttype'));
  const kind = KINDS[type] ?? `component-${childText(root, 'powerpagecomponenttype') ?? 'unknown'}`;
  const owner = childText(firstChild(root, 'powerpagesiteid'), 'powerpagesiteid')?.toLowerCase();
  if (siteId && owner !== siteId) {
    problems.push({ file, message: `belongs to another site (${owner ?? 'none'}), not ${siteId}` });
  }

  const name = childText(root, 'name');
  const content = parseContent(childText(root, 'content'), file, problems);
  const text: Record<string, string> = {};
  for (const [field, sideFile] of Object.entries(TEXT_FIELDS[kind] ?? {})) {
    const value = content[field];
    delete content[field];
    if (typeof value === 'string' && value) text[sideFile] = normalizeNewlines(value);
  }
  // `websiteid` is in some solutions' content and in no download; `statecode` is an element
  delete content.websiteid;
  const fields: Record<string, unknown> = { id, name, ...content };
  const languageField = LANGUAGE_FIELDS[kind];
  const language = childText(
    firstChild(root, 'powerpagesitelanguageid'),
    'powerpagesitelanguageid',
  );
  if (languageField && language) fields[languageField] = language.toLowerCase();
  const state = childText(root, 'statecode');
  if (state && state !== '0') fields.statecode = state;
  return { kind, id, name, fields, text, source: { file } };
}

/** `content` as fields: JSON scalars become strings, as the downloads' YAML gives them. */
function parseContent(
  content: string | undefined,
  file: string,
  problems: Problem[],
): Record<string, unknown> {
  if (!content) return {};
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch (error) {
    problems.push({ file, message: `content: invalid JSON: ${(error as Error).message}` });
    return {};
  }
  if (!isMapping(value)) {
    problems.push({ file, message: 'content: expected a JSON object' });
    return {};
  }
  return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, asText(v)]));
}

function asText(value: unknown): unknown {
  if (value === null) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(asText);
  return value;
}

/** Each environment variable in the solution, by lower-cased schema name. */
async function readVariables(
  source: FileSource,
  files: readonly string[],
  problems: Problem[],
  claimed: Set<string>,
): Promise<Map<string, Variable>> {
  const variables = new Map<string, Variable>();
  for (const file of files) {
    const schema = VARIABLE_FILE.exec(file)?.groups?.schema;
    if (schema === undefined) continue;
    claimed.add(file);
    const root = await readXml(source, file, problems);
    if (!root) continue;
    const variable: Variable = {
      secret: childText(root, 'secretstore') === '1' || childText(root, 'type') === SECRET_TYPE,
    };
    const defaultValue = childText(root, 'defaultvalue');
    if (defaultValue) variable.defaultValue = defaultValue;

    const valuesFile = `${posix.dirname(file)}/environmentvariablevalues.json`;
    if (files.includes(valuesFile)) {
      claimed.add(valuesFile);
      const value = currentValue(await source.read(valuesFile), valuesFile, problems);
      if (value) variable.value = value;
    }
    variables.set((root.getAttribute('schemaname') || schema).toLowerCase(), variable);
  }
  return variables;
}

/** `{"environmentvariablevalues": {"environmentvariablevalue": {"value": "20"}}}` → `20`. */
function currentValue(text: string, file: string, problems: Problem[]): string | undefined {
  try {
    const parsed: unknown = JSON.parse(text.replace(/^﻿/, ''));
    const values = isMapping(parsed) ? parsed.environmentvariablevalues : undefined;
    const entry = isMapping(values) ? values.environmentvariablevalue : undefined;
    const value = isMapping(entry) ? entry.value : undefined;
    return typeof value === 'string' ? value : undefined;
  } catch (error) {
    problems.push({ file, message: `invalid JSON: ${(error as Error).message}` });
    return undefined;
  }
}

/**
 * Fields are already the model's keys. A setting backed by an environment variable gets the
 * variable's current value, or else its default, or says why there's none (specs/0007).
 */
function solutionFields(variables: Map<string, Variable>): FieldMapping {
  return {
    identify: (_kind, fields) => ({
      id: typeof fields.id === 'string' ? fields.id : undefined,
      name: typeof fields.name === 'string' && fields.name ? fields.name : undefined,
    }),
    modelFields: (kind, fields) => {
      if (kind !== 'sitesetting' || fields.source !== '1') return fields;
      const schema = typeof fields.envvar_schema === 'string' ? fields.envvar_schema : '';
      const variable = variables.get(schema.toLowerCase());
      if (!variable) return { ...fields, envvar_none: NO_VALUE.missing };
      if (variable.secret) return { ...fields, envvar_none: NO_VALUE.secret };
      const value = variable.value ?? variable.defaultValue;
      if (value === undefined) return { ...fields, envvar_none: NO_VALUE.empty };
      return { ...fields, envvar_value: value };
    },
    sourceKey: (_kind, key) => key,
    lists: false,
  };
}

/** A code site has `CodeSite/Enabled = true`; a classic site has no such setting. */
function isCodeSite(records: SiteRecord[]): boolean {
  return records.some(
    (r) =>
      r.kind === 'sitesetting' &&
      r.name?.toLowerCase() === 'codesite/enabled' &&
      String(r.fields.value).trim().toLowerCase() === 'true',
  );
}

async function readXml(
  source: FileSource,
  file: string,
  problems: Problem[],
): Promise<Element | undefined> {
  const text = (await source.read(file)).replace(/^﻿/, '');
  const errors: string[] = [];
  const document = new DOMParser({
    onError: (level, message) => {
      if (level !== 'warning') errors.push(message);
    },
  }).parseFromString(text, 'text/xml');
  const root = document.documentElement;
  if (errors.length > 0 || !root) {
    problems.push({ file, message: `invalid XML: ${errors[0] ?? 'no root element'}` });
    return undefined;
  }
  return root;
}

function children(node: Element, tag: string): Element[] {
  return Array.from(node.childNodes).filter(
    (child): child is Element => child.nodeType === 1 && (child as Element).tagName === tag,
  );
}

function firstChild(node: Element | undefined, tag: string): Element | undefined {
  return node && children(node, tag)[0];
}

function childText(node: Element | undefined, tag: string): string | undefined {
  const child = firstChild(node, tag);
  return child ? (child.textContent ?? '') : undefined;
}
