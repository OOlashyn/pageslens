# Rules

| Rule                                                              | Default | Catches                                                                |
| ----------------------------------------------------------------- | ------- | ---------------------------------------------------------------------- |
| [`webapi-wildcard-fields`](webapi-wildcard-fields.md)             | error   | Web API enabled with `*` as the fields list                            |
| [`webapi-no-permission`](webapi-no-permission.md)                 | warning | Web API enabled on a table no table permission covers                  |
| [`permission-no-role`](permission-no-role.md)                     | warning | Table permission with no web role                                      |
| [`global-write-anonymous`](global-write-anonymous.md)             | warning | Global create, write or delete for Anonymous Users                     |
| [`global-write-authenticated`](global-write-authenticated.md)     | warning | Global create, write or delete for Authenticated Users                 |
| [`parent-chain-broken`](parent-chain-broken.md)                   | error   | Parent-scope permission whose parent is missing, has no role, or loops |
| [`scope-relationship-missing`](scope-relationship-missing.md)     | error   | Contact, Account or Parent scope without its relationship              |
| [`multiple-authenticated-roles`](multiple-authenticated-roles.md) | error   | More than one role flagged as Authenticated Users                      |
| [`role-unused`](role-unused.md)                                   | info    | Web role nothing uses                                                  |

Change a rule's severity, or turn it off, in `pageslens.config.yaml`:

```yaml
rules:
  global-write-anonymous: error
  role-unused: off
```

The file is found in the folder you lint or any folder above it; `--config <file>` points at another one.
