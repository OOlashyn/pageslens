# 0001: Policies, `pageslens test`

**Status:** shipped in 0.3.0 (PR #12). User reference: [docs/policy.md](../docs/policy.md).

Builds on the draft in [mvp-spec.md](research/mvp-spec.md) ("Policy file"), revised after [policy-research.md](research/policy-research.md). Lint asks "is this configuration a known mistake?"; a policy asks "does this site still meet _our_ requirements?". Same access graph and Web API surface, but the team writes the checks.

Design rules, from the research:

- **Closed grammar.** Every statement is one of a fixed set of sentence shapes, like `kubectl auth can-i` or AWS's fixed check kinds. No user-defined statements, patterns or expressions: the Gherkin problem (free text matched at run time) is what we avoid.
- **Names are checked.** An unknown role is an error. A table the site never mentions is a warning, since offline there's no metadata to tell a typo from an unused table (Cedar's "well-formed but wrong").
- **Allowlists as well as denylists.** `only … can …` catches access given to a role added later, which a `cannot` list never does.
- **Requirements are identifiable.** Each statement can carry an `id` and a `because`, for reports, SARIF and traceability to a standard (Checkov, InSpec).
- **Fail closed.** A missing or empty policy file is an error, not a pass (Kyverno `--require-tests`).
- **Failures explain themselves.** Each failure shows what was expected, what grants or settings break it, and where they are (OpenFGA, conftest).
- **The full picture lives elsewhere.** The policy holds targeted invariants; the access matrix (`docs`) and the planned `diff` show everything else (SpiceDB keeps assertions and expected relations apart for the same reason).

## Command

```
pageslens test [path] [--policy <file>] [--format text|json]
```

- Finds `pageslens.policy.yaml` by walking up from the site folder, like `pageslens.config.yaml`; `--policy` overrides.
- Exit 0 when every statement passes, 1 when any fails, 2 for usage errors, a missing or empty policy file, YAML errors, and statement errors (bad grammar, unknown role).
- Output lists every statement with pass or fail. JSON is versioned like lint's. SARIF (failed statements next to lint findings) and JUnit come with the GitHub Action.

## Policy file

```yaml
# pageslens.policy.yaml
access:
  - anonymous cannot create, write, delete any table
  - anonymous cannot read contact
  - authenticated cannot write contact at global scope
  - "Case Manager" can read, write incident at contact scope
  - only "Case Manager", "Administrators" can write incident
  - nobody can delete account
  - id: invoices-billing-only
    check: only "Billing" can read, write dwcrm_invoice
    because: Invoices are financial records (ISMS A.8.3)
webapi:
  - fields are explicit
  - only contact, incident are enabled
  - anonymous cannot call any table
settings:
  - registration is invite only
  - setting "Webapi/error/innererror" is "false"
```

A statement is either a string, or a mapping with `check` (the string) and optional `id` and `because`. Ids must be unique; where there's none, output names the statement by its text and line.

Every failed statement is an error. There are no severities and no exceptions in v1: the policy is the team's requirements, kept in git and changed by pull request. A requirement that has an exception is written as a narrower statement (a scope, an `only` list).

### Access statements

```
<who> can <privileges> <table> [at <scope> scope]
<who> cannot <privileges> <table> [at <scope> scope]
only <who>[, <who>…] can <privileges> <table> [at <scope> scope]
nobody can <privileges> <table> [at <scope> scope]
```

- **who**: `anonymous` (visitors who aren't signed in: the role flagged Anonymous Users), `authenticated` (every signed-in user, see below), or a role name in double quotes. An unknown or ambiguous role name is an error.
- **privileges**: `read`, `write`, `create`, `delete`, `append`, `appendto`, comma-separated.
- **table**: a logical name, or `any table`.
- **scope**: `global`, `contact`, `account`, `self`, `parent`. With a scope, only grants at that scope count. There's no "at least / at most", because scopes aren't strictly ordered.

Meaning, checked against effective grants (the same ones the access matrix shows, roles inherited by child permissions included):

| Statement           | Passes when                                            |
| ------------------- | ------------------------------------------------------ |
| `X can P T`         | X has every privilege in P on T                        |
| `X cannot P T`      | X has none of the privileges in P on T                 |
| `only X, Y can P T` | no role other than X and Y has any privilege in P on T |
| `nobody can P T`    | no role has any privilege in P on T                    |

**`authenticated`** stands for every signed-in user. Power Pages gives every signed-in user the Authenticated Users role, whether or not it's assigned, on top of their own roles. So:

- `authenticated cannot P T` fails if the Authenticated Users role **or any other role except Anonymous Users** has a privilege in P on T: some signed-in user could do it.
- `authenticated can P T` passes only if the Authenticated Users role itself has P on T: a custom role isn't held by every signed-in user.
- In an `only` list, `authenticated` allows every role except Anonymous Users (so `only authenticated can write T` means "anonymous visitors can't write T").
- `anonymous` is the Anonymous Users role only; signed-in users don't get it.

`any table` in `can` means "on at least one table"; in `cannot`, `only` and `nobody` it means "on every table". A failure lists each offending grant: role, table, privileges, scope, permission name and file.

### Web API statements

- `fields are explicit`: no table has `Webapi/<table>/fields = *`.
- `only <table>[, <table>…] are enabled`: no other table has the Web API enabled.
- `<table> is not enabled`.
- `<who> can call <table>` / `<who> cannot call <table>` (`any table` allowed): the Web API is enabled on the table and the role has a grant on it, as in the Web API surface.

### Settings statements

- `registration is invite only`: `Authentication/Registration/OpenRegistrationEnabled` isn't `true`.
- `setting "<name>" is "<value>"`, `is not "<value>"`, `is set`, `is not set`. Values are compared as text, `true`/`false` case-insensitively. Four fixed operators on one named setting; no patterns.

### Errors

Statement errors say where and what was expected: `pageslens.policy.yaml:7: expected "can" or "cannot" after "Case Manager"`, `unknown role "Case Managers" (did you mean "Case Manager"?)`. All errors are collected and reported together, like the site loader does.

## Implementation sketch

- `src/policy/parse.ts`: YAML (failsafe schema) → statements with source lines (YAML `Document` ranges). A hand-written tokenizer and one parse function per statement shape; no parser generator.
- `src/policy/evaluate.ts`: statement × (site, access graph, Web API surface) → pass or fail, with evidence.
- `src/policy/format/{text,json}.ts`; `test` in `src/cli.ts`.
- Fixtures: a policy per fixture site with a passing and a failing case for every statement shape. A page `rules/policy.md` (or `docs/policy.md` now that `docs/` is free) with the grammar, the meaning table and examples, including the advice to write both positive and negative statements and to prefer `only` for sensitive tables.
- Later: SARIF and JUnit, the GitHub Action running `lint` + `test`, `diff` reusing the evidence wording.

## Decisions (Oleksandr, 2026-10-24)

1. **Sentences**, parsed by a small fixed grammar. Not structured YAML.
2. **`authenticated` is every signed-in user** (amended): the Authenticated Users role applies to every signed-in user, so `cannot` and `only` count every role except Anonymous Users, and `can` needs the Authenticated Users role itself. Custom roles are named in quotes.
3. **`any table`** is allowed in access and Web API statements. No other wildcards or patterns.

## Adopted after research (Oleksandr, 2026-10-24)

4. `only … can …` allowlist statements.
5. Optional `id` and `because` per statement (mapping form).
6. No severities and no exceptions in v1; every failure is an error.
7. A missing or empty policy file exits 2.

## As built

Research: [policy-research.md](research/policy-research.md) (OpenFGA, SpiceDB, AWS Access Analyzer, `kubectl auth can-i`, Checkov, conftest, InSpec, Cedar, Kyverno, Gherkin as the thing to avoid). Design: this document. User reference: `docs/policy.md`.

- `pageslens test [path] [--policy <file>] [--format text|json|sarif]` reads `pageslens.policy.yaml`: one sentence per requirement, from a closed grammar. Sections `access`, `webapi`, `settings`; `can`, `cannot`, `only … can`, `nobody can`, optional scope, `any table`; statements can carry `id` and `because`.
- `authenticated` is every signed-in user: `cannot` and `only` count every role but Anonymous Users, `can` needs the Authenticated Users role. Members of a custom role also have the Authenticated Users role's grants.
- Exit 0 pass, 1 a failure, 2 no or empty policy, a bad statement or an unknown role. No severities, no exceptions.
- A statement starting with a role is written `role "Name" can …`, because YAML can't read an item starting with a quoted string followed by more text.
- `registration is invite only` uses Microsoft's defaults (open registration is on unless switched off), so a site without the settings fails.
- Code: `src/policy/`. Fixtures: `test/fixtures/policies/`.
