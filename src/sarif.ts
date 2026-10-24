import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, posix } from 'node:path';
import pkg from '../package.json' with { type: 'json' };
import type { Severity } from './lint/types.js';

// SARIF 2.1.0 as GitHub code scanning reads it: every rule has short and full descriptions
// and help text, every result a location with a start line. File URIs are relative to the
// current folder, which in CI is the repository root. `primaryLocationLineHash`, the
// fingerprint GitHub matches alerts on, is left to the upload-sarif action: it hashes the
// result's line, and results point at a record's GUID line, which edits elsewhere don't move.

export const SARIF_SCHEMA = 'https://json.schemastore.org/sarif-2.1.0.json';

export interface SarifRule {
  id: string;
  shortDescription: string;
  fullDescription: string;
  helpUri: string;
  level: SarifLevel;
}

export interface SarifResult {
  ruleId: string;
  level: SarifLevel;
  message: string;
  /** URI relative to the current folder, `/`-separated. */
  uri: string;
  line: number;
  related?: { uri: string; line: number; message: string }[];
  /** Stable across runs: what the result is about, not where it is. */
  fingerprint: string;
}

export type SarifLevel = 'error' | 'warning' | 'note';

export const SARIF_LEVEL: Record<Severity, SarifLevel> = {
  error: 'error',
  warning: 'warning',
  info: 'note',
};

/** GitHub's security severity (0.1–10): high, medium and low for error, warning and note. */
const SECURITY_SEVERITY: Record<SarifLevel, string> = { error: '7.5', warning: '5.0', note: '2.0' };

/**
 * One run of one command. `category` keeps lint and test results apart in code scanning, so
 * uploading both doesn't replace one with the other.
 */
export function sarifLog(category: string, rules: SarifRule[], results: SarifResult[]): string {
  const ruleIndex = new Map(rules.map((rule, i) => [rule.id, i]));
  const log = {
    $schema: SARIF_SCHEMA,
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'pageslens',
            semanticVersion: pkg.version,
            informationUri: pkg.homepage,
            rules: rules.map((rule) => ({
              id: rule.id,
              shortDescription: { text: rule.shortDescription },
              fullDescription: { text: rule.fullDescription },
              help: {
                text: `${rule.fullDescription} See ${rule.helpUri}`,
                markdown: `${rule.fullDescription}\n\n[How to fix](${rule.helpUri})`,
              },
              helpUri: rule.helpUri,
              defaultConfiguration: { level: rule.level },
              properties: {
                tags: ['security', 'power-pages'],
                precision: 'very-high',
                'security-severity': SECURITY_SEVERITY[rule.level],
              },
            })),
          },
        },
        automationDetails: { id: `pageslens/${category}/` },
        results: results.map((result) => ({
          ruleId: result.ruleId,
          ruleIndex: ruleIndex.get(result.ruleId),
          level: result.level,
          message: { text: result.message },
          locations: [location(result.uri, result.line)],
          ...(result.related && {
            relatedLocations: result.related.map((r, id) => ({
              id,
              ...location(r.uri, r.line),
              message: { text: r.message },
            })),
          }),
          partialFingerprints: { 'pageslens/v1': result.fingerprint },
        })),
      },
    ],
  };
  return `${JSON.stringify(log, null, 2)}\n`;
}

function location(uri: string, line: number) {
  return { physicalLocation: { artifactLocation: { uri }, region: { startLine: line } } };
}

/** A short, stable hash of the parts that identify a result. */
export function fingerprint(...parts: string[]): string {
  return createHash('sha256').update(parts.join('\0')).digest('hex').slice(0, 32);
}

/** `file` (relative to the site folder) as a URI relative to the current folder. */
export function siteUri(sitePath: string, file: string): string {
  return posix.join(sitePath, file);
}

/**
 * Finds the line of each record in its file by its GUID. The site model has no line numbers,
 * and a classic site keeps many records in one file (`webrole.yml`), so the file alone would
 * put every finding on line 1.
 */
export async function recordLines(
  siteRoot: string,
  files: string[],
): Promise<(file: string, recordId?: string) => number> {
  const lines = new Map<string, string[]>();
  for (const file of new Set(files)) {
    const text = await readFile(join(siteRoot, file), 'utf8').catch(() => '');
    lines.set(file, text.toLowerCase().split(/\r\n|\r|\n/));
  }
  return (file, recordId) => {
    if (!recordId) return 1;
    const index = lines.get(file)?.findIndex((line) => line.includes(recordId.toLowerCase())) ?? -1;
    return index + 1 || 1;
  };
}
