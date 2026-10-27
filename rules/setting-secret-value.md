# setting-secret-value

**Default: error**

A site setting whose name ends in `ClientSecret`, `AppSecret` or `ConsumerSecret` has a value of its own.

## Why it matters

These settings hold an identity provider's secret: the client secret of an OpenID Connect or Microsoft Entra ID provider, a Facebook app secret, a LinkedIn or X consumer secret. A value typed into the setting is in every `pac pages download` and every exported solution of the site, so committing either puts the secret in git, where everyone with access to the repository can read it and it stays in the history after it's removed.

An empty setting doesn't fire, nor does one that takes its value from an environment variable (`source: 1`).

## How to fix

1. Rotate the secret at the identity provider: it's been in git.
2. Create an environment variable of type **Secret**, which keeps the value in Azure Key Vault, and point the setting at it. See [Environment variables for site settings](https://learn.microsoft.com/power-pages/configure/environment-variables-for-site-settings).
3. Clear the setting's own value, then download the site or sync the solution again.

If the value is a placeholder for a development site, ignore the finding by record in `pageslens.config.yaml`.
