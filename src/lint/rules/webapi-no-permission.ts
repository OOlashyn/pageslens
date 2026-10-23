import type { Rule } from '../types.js';

export const webapiNoPermission: Rule = {
  id: 'webapi-no-permission',
  defaultSeverity: 'warning',
  description: 'Web API is enabled on a table that no table permission with a web role covers.',
  check: ({ webApi }) =>
    webApi.flatMap((table) => {
      const setting = table.enabledSetting;
      if (!table.enabled || table.callers.length > 0 || !setting) return [];
      return {
        message: `Web API is enabled on ${table.table}, but no table permission gives any web role access to it, so every call is refused.`,
        source: setting.source,
        recordId: setting.id,
      };
    }),
};
