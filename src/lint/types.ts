import type { AccessGraph } from '../graph/access.js';
import type { WebApiTable } from '../graph/webapi.js';
import type { Site, SourceRef } from '../model/schema.js';

export const SEVERITIES = ['error', 'warning', 'info'] as const;
export type Severity = (typeof SEVERITIES)[number];
export type RuleSetting = Severity | 'off';

export interface RuleContext {
  site: Site;
  graph: AccessGraph;
  webApi: WebApiTable[];
}

/** What a rule reports; the engine adds the rule id and the configured severity. */
export interface RuleFinding {
  message: string;
  source: SourceRef;
  /** GUID of the record the finding is about. */
  recordId: string;
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
