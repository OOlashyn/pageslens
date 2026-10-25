import type { Privilege } from '../graph/access.js';
import type { Scope } from '../model/kinds.js';

export const SECTIONS = ['access', 'webapi', 'settings', 'pages'] as const;
export type Section = (typeof SECTIONS)[number];

/** Who a statement is about. `authenticated` is every signed-in user, `anonymous` every visitor who isn't. */
export type Who =
  | { kind: 'anonymous' }
  | { kind: 'authenticated' }
  | { kind: 'role'; name: string };

/** A table's logical name (lower-cased), or `any table`. */
export type TableRef = { kind: 'any' } | { kind: 'table'; name: string };

export type AccessScope = Exclude<Scope, 'unknown'>;

/** `page "<url>"`, or `pages under "<url>"`: the page and every page below it. */
export interface PageRef {
  kind: 'page' | 'under';
  url: string;
}

/** `read` is who can open the page; `publish` is Grant Change, which also gives read. */
export type PageAction = 'read' | 'publish';

interface AccessBase {
  privileges: Privilege[];
  table: TableRef;
  scope?: AccessScope;
}

export type Check =
  | ({ kind: 'can' | 'cannot'; who: Who } & AccessBase)
  | ({ kind: 'only'; who: Who[] } & AccessBase)
  | ({ kind: 'nobody' } & AccessBase)
  | { kind: 'fields-explicit' }
  | { kind: 'only-enabled'; tables: string[] }
  | { kind: 'not-enabled'; table: TableRef }
  | { kind: 'call'; negated: boolean; who: Who; table: TableRef }
  | { kind: 'registration-invite-only' }
  | {
      kind: 'page';
      form: 'can' | 'cannot' | 'only' | 'nobody';
      /** One for `can` and `cannot`, the list for `only`, none for `nobody`. */
      who: Who[];
      action: PageAction;
      page: PageRef;
    }
  | {
      kind: 'setting';
      name: string;
      op: 'is' | 'is-not' | 'is-set' | 'is-not-set';
      value?: string;
    };

/** One requirement from the policy file. */
export interface Statement {
  section: Section;
  /** The statement as written, trimmed. */
  text: string;
  /** 1-based line in the policy file. */
  line: number;
  id?: string;
  because?: string;
  check: Check;
}

export interface Policy {
  /** Absolute path of the policy file. */
  path: string;
  statements: Statement[];
}
