# Rules

| Rule                                                              | Default | Catches                                                                |
| ----------------------------------------------------------------- | ------- | ---------------------------------------------------------------------- |
| [`webapi-wildcard-fields`](webapi-wildcard-fields.md)             | error   | Web API enabled with `*` as the fields list                            |
| [`webapi-no-permission`](webapi-no-permission.md)                 | warning | Web API enabled on a table no table permission covers                  |
| [`webapi-inner-errors`](webapi-inner-errors.md)                   | warning | Web API errors that include the inner error                            |
| [`setting-secret-value`](setting-secret-value.md)                 | error   | Secret site setting (`ClientSecret`, ...) with a value of its own      |
| [`permission-no-role`](permission-no-role.md)                     | warning | Table permission with no web role                                      |
| [`global-write-anonymous`](global-write-anonymous.md)             | warning | Global create, write or delete for Anonymous Users                     |
| [`global-write-authenticated`](global-write-authenticated.md)     | warning | Global create, write or delete for Authenticated Users                 |
| [`parent-chain-broken`](parent-chain-broken.md)                   | error   | Parent-scope permission whose parent is missing, has no role, or loops |
| [`scope-relationship-missing`](scope-relationship-missing.md)     | error   | Contact, Account or Parent scope without its relationship              |
| [`multiple-authenticated-roles`](multiple-authenticated-roles.md) | error   | More than one role flagged as Authenticated Users                      |
| [`role-unused`](role-unused.md)                                   | info    | Web role nothing uses                                                  |
| [`page-rule-no-page`](page-rule-no-page.md)                       | warning | Page access rule with no page, or a missing or inactive one            |
| [`page-rule-no-role`](page-rule-no-role.md)                       | error   | Page access rule with no web role                                      |
| [`page-rule-anonymous`](page-rule-anonymous.md)                   | error   | Page access rule listing Anonymous Users, which lets nobody in         |
| [`page-rules-conflict`](page-rules-conflict.md)                   | error   | More than one Restrict Read rule on a page                             |
| [`page-roles-not-subset`](page-roles-not-subset.md)               | warning | Restrict Read role that a rule above keeps out                         |
| [`grant-change-overrides-read`](grant-change-overrides-read.md)   | warning | Grant Change role that reads past a Restrict Read                      |
| [`page-rule-authenticated`](page-rule-authenticated.md)           | warning | Restrict Read listing Authenticated Users with other roles             |
| [`page-parent-missing`](page-parent-missing.md)                   | error   | Web page whose parent is missing or inactive, or loops                 |

`pageslens explain <rule>` prints a rule's page in the terminal, and `pageslens explain` lists the rules.

The `page-` rules and `grant-change-overrides-read` run on classic sites only (`pac pages download`). Where a rule's default names two severities, a finding gets the one that fits it, unless the config sets the rule's severity.

Change a rule's severity, or turn it off, in `pageslens.config.yaml`:

```yaml
rules:
  global-write-anonymous: error
  role-unused: off
```

The file is found in the folder you lint or any folder above it; `--config <file>` points at another one.
