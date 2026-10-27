import {
  fingerprint,
  SARIF_LEVEL,
  sarifLog,
  siteUri,
  type SarifResult,
  type SarifRule,
} from '../../sarif.js';
import { CHECK_INFO, CHECKS, kindLabel, type AlignResult } from '../types.js';

export const ALIGN_DOCS = 'https://github.com/OOlashyn/pageslens/blob/main/docs/align.md';

type LineOf = (file: string, recordId?: string) => number;

/**
 * SARIF 2.1.0 for GitHub code scanning: one rule per check, results on the download's file
 * when there is one (the GUID's line), with the solution's file as a related location.
 */
export function formatSarif(
  result: AlignResult,
  lines: { site: LineOf; solution: LineOf },
): string {
  const rules = CHECKS.map((check): SarifRule => ({
    id: check,
    shortDescription: CHECK_INFO[check].description,
    fullDescription: CHECK_INFO[check].description,
    helpUri: `${ALIGN_DOCS}#${check}`,
    level: SARIF_LEVEL[CHECK_INFO[check].defaultSeverity],
  }));
  const results = result.findings.map((finding): SarifResult => {
    const message = `${kindLabel(finding.kind)} "${finding.name}": ${finding.message}`;
    const solution = finding.solutionFile && {
      uri: siteUri(result.solution.path, finding.solutionFile),
      line: lines.solution(finding.solutionFile, finding.recordId),
    };
    const primary = finding.siteFile
      ? {
          uri: siteUri(result.site.path, finding.siteFile),
          line: lines.site(finding.siteFile, finding.recordId),
        }
      : solution || { uri: result.site.path, line: 1 };
    return {
      ruleId: finding.check,
      level: SARIF_LEVEL[finding.severity],
      message,
      ...primary,
      ...(finding.siteFile &&
        solution && { related: [{ ...solution, message: 'in the solution' }] }),
      fingerprint: fingerprint(finding.check, finding.recordId, finding.message),
    };
  });
  return sarifLog('align', rules, results);
}
