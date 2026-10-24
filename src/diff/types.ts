import type { SiteLayout } from '../adapters/site-folder.js';
import type { Privilege } from '../graph/access.js';
import type { Part } from '../graph/describe.js';
import type { Scope } from '../model/kinds.js';

/** Wider: may give someone access they didn't have. Anything not shown narrower or neutral is wider. */
export const CHANGE_CLASSES = ['wider', 'narrower', 'neutral'] as const;
export type ChangeClass = (typeof CHANGE_CLASSES)[number];

/** The closed list of change kinds; the JSON output's `kind`. */
export const CHANGE_KINDS = [
  'grant-gained',
  'grant-lost',
  'grant-rows-changed',
  'grant-source-changed',
  'webapi-enabled',
  'webapi-disabled',
  'webapi-fields-wider',
  'webapi-fields-narrower',
  'role-added',
  'role-removed',
  'role-renamed',
  'role-recreated',
  'role-audience-changed',
  'setting-wider',
  'setting-narrower',
] as const;
export type ChangeKind = (typeof CHANGE_KINDS)[number];

/** Who a role's grants reach: every visitor, every signed-in user, or the role's members. */
export type Audience = 'anonymous' | 'authenticated' | 'role';

/** A record behind a change, on the side it's read from. */
export interface ChangeSource {
  side: 'base' | 'head';
  recordId: string;
  name: string;
  /** Path relative to that side's site folder. */
  file: string;
}

/** One line of the diff: what changed, how it's classified, and the records that cause it. */
export interface Change {
  class: ChangeClass;
  kind: ChangeKind;
  /** The sentence, in parts so Markdown can bold roles and privileges. */
  message: Part[];
  role?: { id: string; name: string; audience: Audience };
  table?: string;
  /** Head scope for grants (base scope for a grant only base has). */
  scope?: Scope;
  /** A scope change on one permission: the base scope. */
  fromScope?: Scope;
  privileges?: Privilege[];
  /** Grants only: whether the Web API is enabled on the table on head. */
  webApiEnabled?: boolean;
  /** Web API field changes: the fields added or removed. */
  fields?: string[];
  setting?: string;
  /** Wider changes only: lint rules the head records behind it also trip. */
  lint?: string[];
  sources: ChangeSource[];
}

/** One side of the comparison: a folder, or a site folder read at a commit. */
export interface DiffSide {
  /** The ref as given, when this side is a commit. */
  ref?: string;
  commit?: string;
  /** The commit is the merge base of the base and head refs (`--merge-base`). */
  mergeBase?: boolean;
  /** The site folder relative to the current folder, `/`-separated. */
  path: string;
  /** Absent when there's no site at `path` on this side. */
  layout?: SiteLayout;
  site?: { id: string; name: string };
}

export interface DiffResult {
  base: DiffSide;
  head: DiffSide;
  /** Wider, then narrower, then neutral; each in a fixed order, most exposed first. */
  changes: Change[];
  summary: Record<ChangeClass, number>;
}
