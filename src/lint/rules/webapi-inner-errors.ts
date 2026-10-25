import type { Rule } from '../types.js';

export const webapiInnerErrors: Rule = {
  id: 'webapi-inner-errors',
  defaultSeverity: 'warning',
  description:
    'Web API error responses include the inner error (`Webapi/error/innererror = true`).',
  check: ({ site }) =>
    site.siteSettings.flatMap((setting) => {
      if (setting.name.trim().toLowerCase() !== 'webapi/error/innererror') return [];
      if (setting.value?.trim().toLowerCase() !== 'true') return [];
      return {
        message:
          'Webapi/error/innererror is true, so Web API error responses include the server error behind them for anyone who calls the API; turn it off outside development.',
        source: setting.source,
        recordId: setting.id,
      };
    }),
};
