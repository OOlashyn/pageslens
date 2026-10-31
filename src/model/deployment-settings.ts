import { readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { z } from 'zod';
import { NO_VALUE } from '../adapters/solution.js';
import { toPosixPath } from './normalize.js';
import type { Site, SiteSetting } from './schema.js';

// A deployment settings file gives one stage the values of its environment variables, as
// `pac solution create-settings` writes it and `pac solution import --settings-file` reads it
// (specs/0010). Only `EnvironmentVariables` is read: connection references are for flows, and
// keys pac adds later are ignored, at the top and in each entry.

/** Environment variable types: Secret keeps its value in Azure Key Vault. */
const SECRET_TYPE = 100000005;

export interface SettingsVariable {
  /** `''` when the file has the variable without a value, as `create-settings` writes it. */
  value: string;
  secret: boolean;
}

export interface DeploymentSettings {
  /** The file relative to the current folder, `/`-separated, as messages name it. */
  path: string;
  /** By lower-cased schema name. */
  variables: Map<string, SettingsVariable>;
}

/** The file can't be used: exit code 2, like a bad config. */
export class SettingsFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SettingsFileError';
  }
}

const fileSchema = z.looseObject({
  EnvironmentVariables: z.array(
    z.looseObject({
      SchemaName: z.string().min(1),
      Value: z.string().optional(),
      TypeId: z.unknown().optional(),
    }),
  ),
});

/** The file as text: `path` is how messages name it. */
export function parseSettings(text: string, path: string): DeploymentSettings {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^﻿/, ''));
  } catch (error) {
    throw new SettingsFileError(`${path} isn't JSON: ${(error as Error).message}`);
  }
  const result = fileSchema.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0]!;
    const where = issue.path.length > 0 ? ` at ${issue.path.join('.')}` : '';
    throw new SettingsFileError(
      `${path} isn't a deployment settings file${where}: ${issue.message}. It needs an EnvironmentVariables list of entries with a SchemaName, and a string Value when there's one`,
    );
  }
  const variables = new Map<string, SettingsVariable>();
  for (const entry of result.data.EnvironmentVariables) {
    variables.set(entry.SchemaName.toLowerCase(), {
      value: entry.Value ?? '',
      secret: Number(entry.TypeId) === SECRET_TYPE,
    });
  }
  return { path, variables };
}

/** Reads `file`, relative to `cwd`. */
export async function readSettingsFile(file: string, cwd: string): Promise<DeploymentSettings> {
  const absolute = resolve(cwd, file);
  const path = toPosixPath(relative(cwd, absolute)) || file;
  let text: string;
  try {
    text = await readFile(absolute, 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    throw new SettingsFileError(
      code === 'ENOENT'
        ? `there's no deployment settings file ${path}`
        : `can't read the deployment settings file ${path}: ${(error as Error).message}`,
    );
  }
  return parseSettings(text, path);
}

/** No variables: a side of `diff` without the file. */
export function emptySettings(path: string): DeploymentSettings {
  return { path, variables: new Map() };
}

/**
 * The value the file gives a setting backed by an environment variable, or `undefined` when the
 * setting keeps what it has: the file doesn't have the variable or gives it no value, the
 * variable is a secret, or the solution doesn't have the variable.
 */
export function settingsValue(
  setting: SiteSetting,
  settings: DeploymentSettings,
): string | undefined {
  if (setting.variable === undefined) return undefined;
  if (setting.noValue === NO_VALUE.secret || setting.noValue === NO_VALUE.missing) return undefined;
  const entry = settings.variables.get(setting.variable.toLowerCase());
  if (!entry || entry.secret || entry.value === '') return undefined;
  return entry.value;
}

/**
 * The site with the file's values in its variable-backed settings, inactive ones included. A
 * value from the file is the setting's value like any other, and the setting names the file.
 */
export function applySettings(site: Site, settings: DeploymentSettings): Site {
  const apply = (list: SiteSetting[]) =>
    list.map((setting): SiteSetting => {
      if (setting.variable === undefined) return setting;
      const value = settingsValue(setting, settings);
      if (value !== undefined) {
        return {
          ...setting,
          value,
          unknown: false,
          noValue: undefined,
          settingsFile: settings.path,
        };
      }
      // Still unknown: messages name the file that gives no value
      if (!setting.unknown) return setting;
      const secret = settings.variables.get(setting.variable.toLowerCase())?.secret ?? false;
      return { ...setting, settingsFile: settings.path, settingsSecret: secret };
    });
  return {
    ...site,
    siteSettings: apply(site.siteSettings),
    inactive: { ...site.inactive, siteSettings: apply(site.inactive.siteSettings) },
  };
}
