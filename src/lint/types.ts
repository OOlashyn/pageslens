import type { AccessGraph } from '../graph/access.js';
import type { PageGraph } from '../graph/pages.js';
import type { WebApiTable } from '../graph/webapi.js';
import type { Site, SourceRef } from '../model/schema.js';

export const SEVERITIES = ['error', 'warning', 'info'] as const;
export type Severity = (typeof SEVERITIES)[number];
export type RuleSetting = Severity | 'off';

export interface RuleContext {
  site: Site;
  graph: AccessGraph;
  webApi: WebApiTable[];
  pages: PageGraph;
}

/** What a rule reports; the engine adds the rule id and the configured severity. */
export interface RuleFinding {
  message: string;
  source: SourceRef;
  /** GUID of the record the finding is about. */
  recordId: string;
  /** The finding's severity when the config doesn't set the rule's, if not the rule's default. */
  severity?: Severity;
}

export interface Rule {
  id: string;
  defaultSeverity: Severity;
  /** One line: what the rule catches. */
  description: string;
  check(context: RuleContext): RuleFinding[];
}

export interface Finding extends RuleFinding {
  ruleId: string;
  severity: Severity;
  /** Link to the rule's page: why it matters and how to fix it. */
  docs: string;
}
