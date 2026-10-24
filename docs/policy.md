# Policies: `pageslens test`

`pageslens lint` catches known mistakes. A policy checks **your own requirements**, such as "anonymous visitors can't read contacts" or "only Billing can write invoices", against the site in git, on every pull request.

```
pageslens test [path] [--policy <file>] [--format text|json|sarif]
```

`path` is the same site folder `lint` and `docs` take. The policy is `pageslens.policy.yaml` in the site folder or any folder above it, or the file given with `--policy`.

| Exit code | Meaning                                                                                                                               |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 0         | Every statement passes                                                                                                                |
| 1         | At least one statement fails                                                                                                          |
| 2         | No policy file, a policy with no statements, invalid YAML, a statement pageslens can't read, an unknown role, or a site it can't read |

A missing policy is an error, not a pass, so a CI step that checks nothing can't go green.

`--format sarif` writes the results for GitHub code scanning: each failed statement shows as an alert on the table permission or setting that breaks it. See [In CI](../README.md#in-ci) in the README.

## The policy file

```yaml
# pageslens.policy.yaml
access:
  - anonymous cannot create, write, delete any table
  - anonymous cannot read contact
  - authenticated cannot write contact at global scope
  - role "Case Manager" can read, write incident at contact scope
  - only "Case Manager", "Administrators" can write incident
  - nobody can delete account
  - id: invoices-billing-only
    check: only "Billing" can read, write dwcrm_invoice
    because: Invoices are financial records
webapi:
  - fields are explicit
  - only contact, incident are enabled
  - anonymous cannot call any table
settings:
  - registration is invite only
  - setting "Webapi/error/innererror" is "false"
```

Each statement is one sentence in a fixed form, listed below. There are no other forms, patterns or expressions: a sentence that doesn't match one of them is an error, with the line and what was expected.

A statement is plain text, or a mapping with `check` (the sentence), an optional `id` (unique in the file) and an optional `because` (shown when it fails). Use the mapping form for requirements you want to trace to a standard or a ticket.

Every failed statement fails the run. There are no severities and no exceptions: the policy is the team's requirements, changed by pull request like the site itself. If a requirement has an exception, write the narrower statement (a scope, or an `only` list).

## Who

| Word            | Means                                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------- |
| `anonymous`     | visitors who aren't signed in (the role flagged Anonymous Users)                                                    |
| `authenticated` | every signed-in user. Power Pages gives every signed-in user the Authenticated Users role on top of their own roles |
| `role "Name"`   | users with that web role. They're signed in, so they also have what the Authenticated Users role grants             |

Role names are in double quotes and must match exactly one web role in the site (case doesn't matter). An unknown name is an error, with a suggestion when there's a close one. Inside an `only` list, write the names without `role`: `only "Case Manager", "Administrators" can …`.

YAML can't read a list item that starts with a quote and continues after it, so a statement can't begin with `"Case Manager"`: write `role "Case Manager" can …`.

## Access statements

```
<who> can <privileges> <table> [at <scope> scope]
<who> cannot <privileges> <table> [at <scope> scope]
only <who>, <who>, … can <privileges> <table> [at <scope> scope]
nobody can <privileges> <table> [at <scope> scope]
```

- **Privileges**: `read`, `write`, `create`, `delete`, `append`, `appendto`, separated by commas.
- **Table**: the table's logical name (`contact`, `dwcrm_invoice`), or `any table`.
- **Scope**: `global`, `contact`, `account`, `self` or `parent`. With a scope, only grants at that scope count.

| Statement           | Passes when                                            |
| ------------------- | ------------------------------------------------------ |
| `X can P T`         | X has every privilege in P on T                        |
| `X cannot P T`      | X has none of the privileges in P on T                 |
| `only X, Y can P T` | no role other than X and Y has any privilege in P on T |
| `nobody can P T`    | no role has any privilege in P on T                    |

`any table` in `can` means "on at least one table". In `cannot`, `only` and `nobody` it means "on every table".

For `authenticated`:

- `authenticated cannot P T` fails if the Authenticated Users role **or any other role except Anonymous Users** has a privilege in P on T, since some signed-in user could do it.
- `authenticated can P T` needs the Authenticated Users role itself to have P on T, since a custom role isn't held by every signed-in user.
- In an `only` list, `authenticated` allows every role except Anonymous Users.

The grants are the ones `pageslens docs` shows in the access matrix: permissions that take effect, including child permissions that take their parent's roles. A failure lists each grant that breaks the statement, with its permission and file.

## Web API statements

| Statement                 | Passes when                                                              |
| ------------------------- | ------------------------------------------------------------------------ |
| `fields are explicit`     | no table with the Web API enabled has `Webapi/<table>/fields` = `*`      |
| `only T1, T2 are enabled` | the Web API is enabled on no other table (`only T1 is enabled` for one)  |
| `T is not enabled`        | the Web API isn't enabled on T (`any table is not enabled`: on no table) |
| `X can call T`            | the Web API is enabled on T and X has a table permission on it           |
| `X cannot call T`         | X has no table permission on T, or the Web API isn't enabled on it       |

## Settings statements

| Statement                              | Passes when                                                                                                                                                                                                                                    |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `registration is invite only`          | visitors can't sign up without an invitation: `Authentication/Registration/Enabled` or `…/OpenRegistrationEnabled` is `false`, or `…/RequiresInvitation` is `true`. Open registration is on by default, so a site without these settings fails |
| `setting "Name" is "value"`            | the setting is there with that value                                                                                                                                                                                                           |
| `setting "Name" is not "value"`        | the setting isn't there, or has another value                                                                                                                                                                                                  |
| `setting "Name" is set` / `is not set` | the setting is there / isn't                                                                                                                                                                                                                   |

Setting names don't depend on case. Values are compared as written, except `true` and `false`, which don't depend on case.

## Warnings

A table that no table permission or Web API setting in the site mentions gets a warning on the statement. Offline, pageslens can't tell a typo (`contcat`) from a table the site doesn't use, so check the name. Warnings don't fail the run.

## Writing a good policy

- **Write both kinds.** `can` statements catch access that broke; `cannot` statements catch access that leaked.
- **Prefer `only` for sensitive tables.** `anonymous cannot read dwcrm_invoice` says nothing about a role someone adds next month; `only "Billing" can read dwcrm_invoice` does.
- **Keep it to requirements.** The full picture of who can do what is in `pageslens docs`; the policy is the part you'd want a build to fail on.
