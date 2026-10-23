import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { parse, YAMLParseError } from 'yaml';
import { z } from 'zod';
import { isDirectory, isFile } from '../util/fs.js';
import type { RuleSetting } from './types.js';

export const CONFIG_FILE = 'pageslens.config.yaml';

export interface LintConfig {
  /** Absolute path of the file the config came from; absent when none was found. */
  path?: string;
  rules: Record<string, RuleSetting>;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

const configSchema = z.strictObject({
  rules: z.record(z.string(), z.enum(['off', 'info', 'warning', 'error'])).default({}),
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
  const path = explicitPath ? resolve(explicitPath) : await findConfig(resolve(startDir));
  if (!path) return { rules: {} };

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

  const unknown = Object.keys(result.data.rules).filter((id) => !knownRuleIds.includes(id));
  if (unknown.length > 0) {
    throw new ConfigError(`${path}: unknown rule(s): ${unknown.join(', ')}`);
  }
  return { path, rules: result.data.rules };
}

async function findConfig(startDir: string): Promise<string | undefined> {
  let dir = (await isDirectory(startDir)) ? startDir : dirname(startDir);
  for (;;) {
    const candidate = join(dir, CONFIG_FILE);
    if (await isFile(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}
