import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NO_VALUE } from '../adapters/solution.js';
import type { AlignConfig } from '../lint/config.js';
import { settingsValue, type DeploymentSettings } from '../model/deployment-settings.js';
import { SEVERITIES, type Severity } from '../lint/types.js';
import { compareText as compare } from '../model/normalize.js';
import type { Site, SiteSetting } from '../model/schema.js';
import { normalizeRecord, type AlignRecord } from './normalize.js';
import {
  CHECK_INFO,
  CHECKS,
  kindLabel,
  type AlignFinding,
  type AlignResult,
  type AlignSide,
  type Check,
  type FieldDifference,
  type UnusedAlignIgnore,
} from './types.js';

// Compares a download with a solution of the same site, record by record, matched by GUID
// (specs/0008). Each record is normalised first (normalize.ts), so what two snapshots of one
// site always differ in isn't reported; anything else is.

/** Reads a file's bytes: a web file's content, relative to its side's folder. */
export type ReadBytes = (root: string, file: string) => Promise<Buffer>;

const readFromDisk: ReadBytes = (root, file) => readFile(join(root, file));

/** How many fields a `content-differs` message names before "and N more". */
const FIELDS_NAMED = 5;
/** Values longer than this, or on several lines, aren't quoted in a message. */
const QUOTED_LENGTH = 60;

/** A finding before the config gives it a severity. */
type Raw = Omit<AlignFinding, 'severity'> & { severity?: Severity };

export async function alignSites(
  site: Site,
  solution: Site,
  sides: { site: AlignSide; solution: AlignSide },
  config: AlignConfig = { checks: {}, ignore: [] },
  settings?: DeploymentSettings,
  readBytes: ReadBytes = readFromDisk,
): Promise<AlignResult> {
  const raw: Raw[] = [];
  let matched = 0;
  if (site.website.id !== solution.website.id) {
    raw.push({
      check: 'site-mismatch',
      kind: 'website',
      recordId: site.website.id,
      name: site.website.name,
      message: `the download is site "${site.website.name}" (${site.website.id}), the solution has site "${solution.website.name}" (${solution.website.id})`,
      siteFile: site.website.source.file,
      solutionFile: solution.website.source.file,
    });
  } else {
    const left = records(site);
    const right = records(solution);
    const leftKeys = keysByKind(left);
    const rightKeys = keysByKind(right);
    for (const [id, record] of left) {
      const other = right.get(id);
      if (!other) {
        raw.push(missing(record, 'missing-from-solution'));
        continue;
      }
      const found = await compareRecords(record, other, { site, solution }, readBytes, {
        site: leftKeys,
        solution: rightKeys,
      });
      if (found.length === 0) matched++;
      raw.push(...found);
    }
    for (const [id, record] of right) {
      if (!left.has(id)) raw.push(missing(record, 'missing-from-download'));
    }
    raw.push(...variableFindings(solution, left, settings));
  }

  const ignore = ignoreMatcher(config.ignore);
  const findings: AlignFinding[] = [];
  let ignored = 0;
  for (const finding of raw) {
    const setting = config.checks[finding.check];
    if (setting === 'off') continue;
    if (ignore.matches(finding)) {
      ignored++;
      continue;
    }
    findings.push({
      ...finding,
      severity: setting ?? finding.severity ?? CHECK_INFO[finding.check].defaultSeverity,
    });
  }
  findings.sort(
    (a, b) =>
      SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) ||
      CHECKS.indexOf(a.check) - CHECKS.indexOf(b.check) ||
      compare(kindLabel(a.kind), kindLabel(b.kind)) ||
      compare(a.name, b.name) ||
      compare(a.recordId, b.recordId),
  );
  const counts = Object.fromEntries(
    SEVERITIES.map((severity) => [
      severity,
      findings.filter((f) => f.severity === severity).length,
    ]),
  ) as Record<Severity, number>;
  const ran = CHECKS.filter((check) => config.checks[check] !== 'off');
  return {
    ...sides,
    findings,
    counts,
    matched,
    ignored,
    unusedIgnores: ignore.unused(ran),
  };
}

/** Every record with a GUID, by GUID. */
function records(site: Site): Map<string, AlignRecord> {
  const byId = new Map<string, AlignRecord>();
  for (const record of site.records) {
    const normalized = normalizeRecord(record, site.format);
    if (normalized) byId.set(normalized.id, normalized);
  }
  return byId;
}

/** The fields each kind's records have on a side, empty or not: what the side's format writes. */
function keysByKind(records: Map<string, AlignRecord>): Map<string, Set<string>> {
  const keys = new Map<string, Set<string>>();
  for (const record of records.values()) {
    const set = keys.get(record.kind) ?? new Set<string>();
    for (const key of record.keys) set.add(key);
    keys.set(record.kind, set);
  }
  return keys;
}

function missing(
  record: AlignRecord,
  check: 'missing-from-solution' | 'missing-from-download',
): Raw {
  const fromSolution = check === 'missing-from-solution';
  const message = fromSolution
    ? record.active
      ? "in the download, not in the solution: it won't be in test or prod"
      : "inactive, in the download, not in the solution: it won't be there if it's activated"
    : "in the solution, not in the download: it's deployed, but dev doesn't have it";
  return {
    check,
    ...(fromSolution && !record.active && { severity: 'warning' as const, inactive: true }),
    kind: record.kind,
    recordId: record.id,
    name: record.name,
    message,
    ...(fromSolution ? { siteFile: record.file } : { solutionFile: record.file }),
  };
}

async function compareRecords(
  left: AlignRecord,
  right: AlignRecord,
  sites: { site: Site; solution: Site },
  readBytes: ReadBytes,
  keys: { site: Map<string, Set<string>>; solution: Map<string, Set<string>> },
): Promise<Raw[]> {
  const base = {
    kind: left.kind,
    recordId: left.id,
    name: left.name,
    siteFile: left.file,
    solutionFile: right.file,
  };
  const found: Raw[] = [];
  if (left.active !== right.active) {
    found.push({
      ...base,
      check: 'state-differs',
      message: left.active
        ? 'active in the download, inactive in the solution'
        : 'inactive in the download, active in the solution',
    });
  }

  const differs: FieldDifference[] = [];
  const oneSided: FieldDifference[] = [];
  if (left.kind !== right.kind)
    differs.push({ field: 'kind', site: left.kind, solution: right.kind });
  for (const field of union(left.fields.keys(), right.fields.keys())) {
    const a = left.fields.get(field);
    const b = right.fields.get(field);
    if (a?.canonical === b?.canonical) continue;
    const difference = {
      field,
      ...(a && { site: a.display }),
      ...(b && { solution: b.display }),
    };
    // A value on one side only, where the other side's format doesn't write the field at all
    const unknown = a
      ? !keys.solution.get(right.kind)?.has(field)
      : !keys.site.get(left.kind)?.has(field);
    if (a && b) differs.push(difference);
    else if (unknown) oneSided.push(difference);
    else differs.push(difference);
  }
  for (const field of union(left.text.keys(), right.text.keys())) {
    const a = left.text.get(field);
    const b = right.text.get(field);
    if (a === b) continue;
    differs.push({
      field,
      ...(a !== undefined && { site: 'differs' }),
      ...(b !== undefined && { solution: 'differs' }),
    });
  }
  if (left.contentFile || right.contentFile) {
    const read = (root: string, file: string | undefined) =>
      file ? readBytes(root, file) : Promise.resolve(undefined);
    const a = await read(sites.site.root, left.contentFile);
    const b = await read(sites.solution.root, right.contentFile);
    if (!a || !b || !a.equals(b)) {
      differs.push({
        field: 'content',
        ...(a && { site: 'differs' }),
        ...(b && { solution: 'differs' }),
      });
    }
  }

  if (differs.length > 0) {
    // Fields one side doesn't know go with the rest, so the record has one finding
    const fields = [...differs, ...oneSided].sort((x, y) => compare(x.field, y.field));
    found.push({ ...base, check: 'content-differs', message: describeFields(fields), fields });
  } else if (oneSided.length > 0) {
    const fields = oneSided.sort((x, y) => compare(x.field, y.field));
    found.push({
      ...base,
      check: 'field-one-side',
      message: `${describeFields(fields)}; the other side's format doesn't write ${fields.length === 1 ? 'it' : 'them'}`,
      fields,
    });
  }
  return found;
}

function union<T>(a: Iterable<T>, b: Iterable<T>): T[] {
  return [...new Set([...a, ...b])];
}

/**
 * `value is "true" in the download, "false" in the solution` for one field with short values,
 * else the fields' names: `copy, value and title differ`.
 */
function describeFields(fields: FieldDifference[]): string {
  if (fields.length === 1) {
    const { field, site, solution } = fields[0]!;
    const quotable = (value: string | undefined) =>
      value !== undefined &&
      value !== 'differs' &&
      value.length <= QUOTED_LENGTH &&
      !value.includes('\n');
    if (site !== undefined && solution !== undefined) {
      return quotable(site) && quotable(solution)
        ? `${field} is "${site}" in the download, "${solution}" in the solution`
        : `${field} differs`;
    }
    const value = site ?? solution;
    const where = site !== undefined ? 'the download' : 'the solution';
    return quotable(value)
      ? `${field} is "${value}" in ${where} only`
      : `${field} is in ${where} only`;
  }
  const names = fields.slice(0, FIELDS_NAMED).map((f) => f.field);
  const more = fields.length - names.length;
  if (more > 0) return `${names.join(', ')} and ${more} more differ`;
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)!} differ`;
}

/**
 * Settings in the solution backed by an environment variable it doesn't have, or one without a
 * value. A secret has its value in Azure Key Vault and isn't reported. With a deployment settings
 * file, a value from the file is a value, and a variable the file gives none is reported even when
 * the solution has one: the stage may get dev's (specs/0010).
 */
function variableFindings(
  solution: Site,
  download: Map<string, AlignRecord>,
  settings: DeploymentSettings | undefined,
): Raw[] {
  const records: SiteSetting[] = [...solution.siteSettings, ...solution.inactive.siteSettings];
  return records.flatMap((setting): Raw[] => {
    if (setting.variable === undefined) return [];
    if (setting.noValue === NO_VALUE.secret) return [];
    const fromFile = settings && settingsValue(setting, settings);
    const entry = settings?.variables.get(setting.variable.toLowerCase());
    if (entry?.secret) return [];
    const inFile = !settings
      ? ''
      : entry
        ? `, and ${settings.path} gives it none`
        : `, and ${settings.path} doesn't have it`;
    let check: Check;
    let message: string;
    if (setting.noValue === NO_VALUE.missing) {
      check = 'variable-missing';
      message = `uses the environment variable "${setting.variable}", which isn't in the solution: the import needs it`;
    } else if (setting.noValue === NO_VALUE.empty) {
      if (fromFile !== undefined) return [];
      check = 'variable-no-value';
      message = `uses the environment variable "${setting.variable}", which has no current or default value in the solution${inFile}: the import needs one from the deployment settings`;
    } else {
      if (!settings || fromFile !== undefined) return [];
      check = 'variable-not-in-settings';
      message = `uses the environment variable "${setting.variable}", which has "${setting.value ?? ''}" in the solution${inFile}: the stage may get the solution's value`;
    }
    const siteFile = download.get(setting.id)?.file;
    return [
      {
        check,
        kind: 'sitesetting',
        recordId: setting.id,
        name: setting.name,
        message,
        ...(siteFile && { siteFile }),
        solutionFile: setting.source.file,
      },
    ];
  });
}

function ignoreMatcher(entries: AlignConfig['ignore']) {
  const compiled = entries.map((entry, index) => ({
    entry: index + 1,
    checks: entry.checks,
    records: entry.records.map((id) => ({ id, used: false })),
  }));
  return {
    matches(finding: Raw): boolean {
      let matched = false;
      for (const entry of compiled) {
        if (entry.checks && !entry.checks.includes(finding.check)) continue;
        for (const record of entry.records) {
          if (record.id === finding.recordId) matched = record.used = true;
        }
      }
      return matched;
    },
    /** GUIDs no finding matched, leaving out entries for checks that didn't run. */
    unused(ran: readonly Check[]): UnusedAlignIgnore[] {
      return compiled
        .filter((entry) => !entry.checks || entry.checks.every((check) => ran.includes(check)))
        .flatMap((entry) =>
          entry.records
            .filter((record) => !record.used)
            .map((record) => ({ entry: entry.entry, value: record.id })),
        );
    },
  };
}
