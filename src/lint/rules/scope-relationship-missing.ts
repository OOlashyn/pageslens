import type { TablePermission } from '../../model/schema.js';
import type { Rule } from '../types.js';

const RELATIONSHIP_FIELD: Partial<
  Record<TablePermission['scope'], [keyof TablePermission, string]>
> = {
  contact: ['contactRelationship', 'contactrelationship'],
  account: ['accountRelationship', 'accountrelationship'],
  parent: ['parentRelationship', 'parentrelationship'],
};

export const scopeRelationshipMissing: Rule = {
  id: 'scope-relationship-missing',
  defaultSeverity: 'error',
  description:
    'A Contact, Account or Parent scope table permission without the relationship that scope needs.',
  check: ({ site }) =>
    site.tablePermissions.flatMap((permission) => {
      const relationship = RELATIONSHIP_FIELD[permission.scope];
      if (!relationship || permission[relationship[0]]) return [];
      return {
        message: `Table permission "${permission.name}" has ${permission.scope} scope but no ${relationship[1]}, so Power Pages can't tell which ${permission.table} records it covers.`,
        source: permission.source,
        recordId: permission.id,
      };
    }),
};
