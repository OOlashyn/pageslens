import type { Rule } from '../types.js';
import { globalWriteAnonymous, globalWriteAuthenticated } from './global-write.js';
import { multipleAuthenticatedRoles } from './multiple-authenticated-roles.js';
import { parentChainBroken } from './parent-chain-broken.js';
import { permissionNoRole } from './permission-no-role.js';
import { roleUnused } from './role-unused.js';
import { scopeRelationshipMissing } from './scope-relationship-missing.js';
import { webapiNoPermission } from './webapi-no-permission.js';
import { webapiWildcardFields } from './webapi-wildcard-fields.js';

/** Every built-in rule. Ids are stable: configs and docs links depend on them. */
export const RULES: readonly Rule[] = [
  webapiWildcardFields,
  webapiNoPermission,
  permissionNoRole,
  globalWriteAnonymous,
  globalWriteAuthenticated,
  parentChainBroken,
  scopeRelationshipMissing,
  multipleAuthenticatedRoles,
  roleUnused,
];
