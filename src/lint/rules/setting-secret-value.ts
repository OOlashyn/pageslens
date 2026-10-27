import type { Rule } from '../types.js';

/** Settings that hold an identity provider's secret, by the end of their name. */
const SECRET_NAME = /(ClientSecret|AppSecret|ConsumerSecret)$/i;

export const settingSecretValue: Rule = {
  id: 'setting-secret-value',
  defaultSeverity: 'error',
  description:
    'A secret site setting (`ClientSecret`, `AppSecret`, `ConsumerSecret`) with a value of its own.',
  check: ({ site }) =>
    site.siteSettings.flatMap((setting) => {
      // A setting backed by an environment variable has no value of its own
      if ('variable' in setting || !setting.value?.trim()) return [];
      if (!SECRET_NAME.test(setting.name.trim())) return [];
      return {
        message: `${setting.name} has its secret as the setting's value, so it's in every download and solution of the site; keep it in an environment variable of type Secret.`,
        source: setting.source,
        recordId: setting.id,
      };
    }),
};
