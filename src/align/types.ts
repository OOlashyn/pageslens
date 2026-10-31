import type { Severity } from '../lint/types.js';
import type { Site, SiteFormat, SiteLayout } from '../model/schema.js';

/** The closed list of checks; the JSON output's `check` and the config's keys. Order is output order. */
export const CHECKS = [
  'site-mismatch',
  'missing-from-solution',
  'state-differs',
  'content-differs',
  'variable-missing',
  'missing-from-download',
  'field-one-side',
  'variable-no-value',
  'variable-not-in-settings',
] as const;
export type Check = (typeof CHECKS)[number];

export interface CheckInfo {
  defaultSeverity: Severity;
  /** One line: what the check reports. */
  description: string;
}

export const CHECK_INFO: Record<Check, CheckInfo> = {
  'site-mismatch': {
    defaultSeverity: 'error',
    description: 'The download and the solution are different sites. Nothing else is checked.',
  },
  'missing-from-solution': {
    defaultSeverity: 'error',
    description:
      "A record in the download that the solution doesn't have: it won't be in test or prod. A warning for an inactive record.",
  },
  'state-differs': {
    defaultSeverity: 'error',
    description: 'A record active on one side and inactive on the other.',
  },
  'content-differs': {
    defaultSeverity: 'error',
    description: "A field, a side file's text or a web file's content that differs.",
  },
  'variable-missing': {
    defaultSeverity: 'error',
    description:
      "A setting backed by an environment variable that isn't in the solution: the import needs it.",
  },
  'missing-from-download': {
    defaultSeverity: 'warning',
    description:
      "A component in the solution that the download doesn't have: deleted in dev and still shipped, or from a snapshot of another time.",
  },
  'field-one-side': {
    defaultSeverity: 'warning',
    description:
      "A field with a value on one side only that the other side's format doesn't write: a new pac version, or a field pageslens doesn't know yet.",
  },
  'variable-no-value': {
    defaultSeverity: 'warning',
    description:
      'An environment variable a setting uses with no current or default value in the solution, and none in the deployment settings file when one is given: the import needs one from the deployment settings.',
  },
  'variable-not-in-settings': {
    defaultSeverity: 'warning',
    description:
      "With --settings: an environment variable a setting uses that has a value in the solution and none in the deployment settings file, so the stage may get the solution's value.",
  },
};

/** A field that differs. Values are absent on the side without one; text shows as `differs`. */
export interface FieldDifference {
  field: string;
  site?: string;
  solution?: string;
}

export interface AlignFinding {
  check: Check;
  severity: Severity;
  /** The record's kind (`webrole`), as a download names it. */
  kind: string;
  recordId: string;
  name: string;
  /** `missing-from-solution` only: the record is inactive, so the finding is a warning. */
  inactive?: boolean;
  /** What's wrong, in a sentence, without the record's name. */
  message: string;
  /** The record's file in the download, relative to the download's site folder. */
  siteFile?: string;
  /** The component's file in the solution, relative to the solution's folder. */
  solutionFile?: string;
  /** `content-differs` only. */
  fields?: FieldDifference[];
}

/** One side of the comparison. */
export interface AlignSide {
  /** The site folder relative to the current folder, `/`-separated. */
  path: string;
  format: SiteFormat;
  layout: SiteLayout;
  site: { id: string; name: string };
  solution?: Site['solution'];
}

/** One record GUID of an `align.ignore` entry that left out no finding. */
export interface UnusedAlignIgnore {
  /** The entry's position in the config's `align.ignore` list, from 1. */
  entry: number;
  value: string;
}

export interface AlignResult {
  site: AlignSide;
  solution: AlignSide;
  /** By severity (errors first), then check, kind and name. */
  findings: AlignFinding[];
  counts: Record<Severity, number>;
  /** Records on both sides with nothing reported on them. */
  matched: number;
  /** Findings left out by `align.ignore` entries. */
  ignored: number;
  unusedIgnores: UnusedAlignIgnore[];
}

/** Records whose differences change access: `pageslens diff` shows what they do. */
export const ACCESS_KINDS = new Set(['webrole', 'tablepermission', 'webpagerule', 'websiteaccess']);

/** How output names a kind: `web role "Course Admins"`. */
export const KIND_LABELS: Record<string, string> = {
  website: 'website',
  websitelanguage: 'site language',
  webrole: 'web role',
  tablepermission: 'table permission',
  sitesetting: 'site setting',
  webpage: 'web page',
  webpagerule: 'page access rule',
  websiteaccess: 'website access',
  webfile: 'web file',
  webtemplate: 'web template',
  pagetemplate: 'page template',
  contentsnippet: 'content snippet',
  weblinkset: 'web link set',
  weblink: 'web link',
  sitemarker: 'site marker',
  publishingstate: 'publishing state',
  basicform: 'basic form',
  basicformmetadata: 'basic form metadata',
  list: 'list',
  pollplacement: 'poll placement',
  adplacement: 'ad placement',
  botconsumer: 'bot consumer',
};

export function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind;
}
