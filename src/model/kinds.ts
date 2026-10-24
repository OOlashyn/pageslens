// Records are identified by the suffix pac writes before `.yml`: `Home.webpage.yml` is a `webpage`,
// `Anonymous-Users.webrole.yml` a `webrole`. The root `website.yml` has no suffix and is `website`.
export const WEBSITE_KIND = 'website';

/** Table permission scope option values. */
export const SCOPES = {
  756150000: 'global',
  756150001: 'contact',
  756150002: 'account',
  756150003: 'parent',
  756150004: 'self',
} as const;

export type Scope = (typeof SCOPES)[keyof typeof SCOPES] | 'unknown';

export function scopeFromValue(value: number): Scope {
  return SCOPES[value as keyof typeof SCOPES] ?? 'unknown';
}
