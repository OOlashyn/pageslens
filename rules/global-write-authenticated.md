# global-write-authenticated

**Default: warning**

A Global scope table permission gives the Authenticated Users role (the role with `authenticatedusersrole: true`) create, write or delete.

## Why it matters

Every signed-in user has the Authenticated Users role. With Global scope, any of them can change or delete any record in the table, including records that belong to other users.

Some sites do want this, for example shared reference data maintained by all members, which is why this is a warning by default.

## How to fix

- Use Contact, Account, Parent or Self scope so users can only change their own or their organisation's records.
- Move write access to a dedicated web role assigned only to the users who need it.
- If the grant is intended, leave the warning or set the rule to `off`; set it to `error` to block it in CI.
