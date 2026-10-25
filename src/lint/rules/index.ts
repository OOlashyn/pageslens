import type { Rule } from '../types.js';
import { globalWriteAnonymous, globalWriteAuthenticated } from './global-write.js';
import { grantChangeOverridesRead } from './grant-change-overrides-read.js';
import { multipleAuthenticatedRoles } from './multiple-authenticated-roles.js';
import { pageParentMissing } from './page-parent-missing.js';
import { pageRolesNotSubset } from './page-roles-not-subset.js';
import { pageRuleAnonymous } from './page-rule-anonymous.js';
import { pageRuleAuthenticated } from './page-rule-authenticated.js';
import { pageRuleNoPage } from './page-rule-no-page.js';
import { pageRuleNoRole } from './page-rule-no-role.js';
import { pageRulesConflict } from './page-rules-conflict.js';
import { parentChainBroken } from './parent-chain-broken.js';
import { permissionNoRole } from './permission-no-role.js';
import { roleUnused } from './role-unused.js';
import { scopeRelationshipMissing } from './scope-relationship-missing.js';
import { webapiInnerErrors } from './webapi-inner-errors.js';
import { webapiNoPermission } from './webapi-no-permission.js';
import { webapiWildcardFields } from './webapi-wildcard-fields.js';

/** Every built-in rule. Ids are stable: configs and docs links depend on them. */
export const RULES: readonly Rule[] = [
  webapiWildcardFields,
  webapiNoPermission,
  webapiInnerErrors,
  permissionNoRole,
  globalWriteAnonymous,
  globalWriteAuthenticated,
  parentChainBroken,
  scopeRelationshipMissing,
  multipleAuthenticatedRoles,
  roleUnused,
  pageRuleNoPage,
  pageRuleNoRole,
  pageRuleAnonymous,
  pageRulesConflict,
  pageRolesNotSubset,
  grantChangeOverridesRead,
  pageRuleAuthenticated,
  pageParentMissing,
];
