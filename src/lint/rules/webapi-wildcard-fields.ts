import type { Rule } from '../types.js';

export const webapiWildcardFields: Rule = {
  id: 'webapi-wildcard-fields',
  defaultSeverity: 'error',
  description: 'Web API is enabled on a table with `*` as the fields list.',
  check: ({ webApi }) =>
    webApi.flatMap((table) => {
      const setting = table.fieldsSetting;
      if (!table.enabled || !table.wildcard || !setting) return [];
      return {
        message: `Web API on ${table.table} exposes every column (fields = *); list the columns the site needs.`,
        source: setting.source,
        recordId: setting.id,
      };
    }),
};
