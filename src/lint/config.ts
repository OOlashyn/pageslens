import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse, YAMLParseError } from 'yaml';
import { z } from 'zod';
import { CHECKS } from '../align/types.js';
import { toPosixPath } from '../model/normalize.js';
import { findUp } from '../util/fs.js';
import type { RuleSetting } from './types.js';

export const CONFIG_FILE = 'pageslens.config.yaml';

export interface LintConfig {
  /** Absolute path of the file the config came from; absent when none was found. */
  path?: string;
  rules: Record<string, RuleSetting>;
  ignore: IgnoreEntry[];
  /** `pageslens align`'s section. */
  align: AlignConfig;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

const nonEmptyList = z.array(z.string().min(1)).min(1);

const ignoreSchema = z
  .strictObject({
    rules: nonEmptyList.optional(),
    files: nonEmptyList.optional(),
    records: nonEmptyList.optional(),
    reason: z.string().optional(),
  })
  .refine((entry) => entry.files || entry.records, 'needs files or records (or both)');

/**
 * Findings to leave out: those on any of `files` (globs over the paths lint prints, relative to
 * the site folder) or `records` (GUIDs, lower-cased), from `rules` only when it's given.
 */
export type IgnoreEntry = z.output<typeof ignoreSchema>;

const settingSchema = z.enum(['off', 'info', 'warning', 'error']);

const alignIgnoreSchema = z.strictObject({
  checks: z.array(z.enum(CHECKS)).min(1).optional(),
  records: nonEmptyList,
  reason: z.string().optional(),
});

/** Findings `align` leaves out: those on any of `records` (GUIDs), from `checks` only when given. */
export type AlignIgnoreEntry = z.output<typeof alignIgnoreSchema>;

const alignSchema = z.strictObject({
  checks: z.partialRecord(z.enum(CHECKS), settingSchema).default({}),
  ignore: z.array(alignIgnoreSchema).default([]),
});

export type AlignConfig = z.output<typeof alignSchema>;

const configSchema = z.strictObject({
  rules: z.record(z.string(), settingSchema).default({}),
  ignore: z.array(ignoreSchema).default([]),
  align: alignSchema.default({ checks: {}, ignore: [] }),
});

/**
 * Loads `explicitPath`, or else the nearest `pageslens.config.yaml` in `startDir` or a folder above it.
 * No file found means defaults for every rule.
 */
export async function loadConfig(
  startDir: string,
  knownRuleIds: readonly string[],
  explicitPath?: string,
): Promise<LintConfig> {
  const path = explicitPath ? resolve(explicitPath) : await findUp(resolve(startDir), CONFIG_FILE);
  if (!path) return { rules: {}, ignore: [], align: { checks: {}, ignore: [] } };

  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch {
    throw new ConfigError(`Can't read config file ${path}`);
  }

  let value: unknown;
  try {
    value = parse(text) ?? {};
  } catch (error) {
    if (!(error instanceof YAMLParseError)) throw error;
    throw new ConfigError(`${path}: invalid YAML: ${error.message}`);
  }

  const result = configSchema.safeParse(value);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const field = issue.path.join('.');
      return field ? `${field}: ${issue.message}` : issue.message;
    });
    throw new ConfigError(`${path}: ${issues.join('; ')}`);
  }

  const { rules, ignore, align } = result.data;
  const named = [...Object.keys(rules), ...ignore.flatMap((entry) => entry.rules ?? [])];
  const unknown = [...new Set(named.filter((id) => !knownRuleIds.includes(id)))];
  if (unknown.length > 0) {
    throw new ConfigError(`${path}: unknown rule(s): ${unknown.join(', ')}`);
  }
  return {
    path,
    rules,
    ignore: ignore.map((entry) => ({
      ...entry,
      ...(entry.files && { files: entry.files.map((f) => toPosixPath(f).replace(/^\.\//, '')) }),
      ...(entry.records && { records: entry.records.map((id) => id.toLowerCase()) }),
    })),
    align: {
      checks: align.checks,
      ignore: align.ignore.map((entry) => ({
        ...entry,
        records: entry.records.map((id) => id.toLowerCase()),
      })),
    },
  };
}
