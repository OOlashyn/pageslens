# global-write-anonymous

**Default: warning**

A Global scope table permission gives the Anonymous Users role (the role with `anonymoususersrole: true`) create, write or delete.

## Why it matters

Global scope applies to every record in the table, and Anonymous Users is everyone who visits the site. Write or delete at that scope lets any visitor change or remove any record.

There are real uses for anonymous create, such as a public contact or feedback form, which is why this is a warning by default.

## How to fix

- Narrow the scope (Contact, Account, Parent or Self) if the access is only needed for related records.
- Keep only the privileges the page needs: a public form usually needs create, not write or delete.
- If the grant is intended, leave the warning or set the rule to `off` in `pageslens.config.yaml`. Set it to `error` to block it in CI.
