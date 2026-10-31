# 0011: Parent chains in policies

**Status:** built, not yet released (see "As built"). Draft 2, every open question decided (see "Decisions").

A common requirement is about a child table: "signed-in users can read the tasks of **their own** incidents, and no other tasks". A site does this with two table permissions: one on `incident` at contact scope, and a child permission on `task` at parent scope under it. `pageslens test` can't check that today. It can say that a grant on `task` is at parent scope, but not what the parent is. This spec adds a way to name the chain a grant hangs from.

## What we know

### How parent scope works

A parent-scope permission has two keys besides its privileges and roles ([spike 1](research/spike-1-findings.md)):

- `parententitypermission`: the GUID of the permission it hangs from;
- `parentrelationship`: the 1:N relationship from the parent's table to its own (`Incident_Tasks`).

A child gives access to the rows related to the rows its parent gives access to. The parent can be a parent-scope permission too, so a chain goes up until it reaches a permission at another scope (the chain's root). The root's scope decides which rows the whole chain starts from: tasks under an incident permission at global scope are every incident's tasks; at contact scope, only the signed-in contact's ([Table permissions](https://learn.microsoft.com/power-pages/security/table-permissions)).

pageslens already follows the chain. `src/graph/access.ts` gives each grant its `ancestors` (the parent permissions, nearest first), a child with no web role takes its parent's roles, and a broken chain gives no grant. `test` and `diff` name the top of the chain in a grant sentence: `from "Incident Task", under "Incident - Customers"`.

### What a policy can say today

```yaml
access:
  - authenticated can read incident at contact scope
  - authenticated can read task at parent scope
  - authenticated cannot write, create, delete task
  - authenticated cannot read task at global scope
  - authenticated cannot read task at contact scope
  - authenticated cannot read task at account scope
  - authenticated cannot read task at self scope
```

This passes on the intended site, but also when:

- the task permission hangs from an incident permission at **global** scope (every incident's tasks);
- it hangs from a permission on another table;
- it hangs from another incident permission than the one the team meant.

`at parent scope` only compares the grant's own scope (`matching` in `src/policy/evaluate.ts`). Ruling out the other scopes takes one statement each, and still says nothing about the parent.

## Design rules

- **The grammar stays closed.** One new clause, `under`, in the four access forms, and its negation, `except under`. No paths, patterns or expressions.
- **It reads as English.** `authenticated can read task under incident at contact scope`.
- **Same grants.** The clause filters the grants `test` already uses (the access matrix in `docs`), so roles inherited by a child, and broken chains, work as they do today.

## Design

### The clause

```
<who> can <privileges> <table> under <parent table> [at <scope> scope]
<who> cannot <privileges> <table> [at <scope> scope] [except under <parent table> [at <scope> scope]]
only <who>, … can <privileges> <table> [at <scope> scope] [except under <parent table> [at <scope> scope]]
nobody can <privileges> <table> [at <scope> scope] [except under <parent table> [at <scope> scope]]
```

`under` is also allowed in `cannot`, `only` and `nobody`, as a filter like `at … scope`.

- **`under Q`**: only grants whose parent chain has a permission on table Q count. That makes the grant parent scope, so `at … scope` can't come before `under` (an error that says so).
- **`at S scope` after `under Q`** is the scope of that permission on Q (decision 2).
- **`except under Q [at S scope]`**: in `cannot`, `only` and `nobody`, grants through such a chain don't break the statement. It isn't allowed in `can`, where it means nothing.

| Statement                                  | Passes when                                                                      |
| ------------------------------------------ | -------------------------------------------------------------------------------- |
| `X can P T under Q at S scope`             | X has every privilege in P on T through chains with a permission on Q at scope S |
| `X cannot P T under Q at S scope`          | X has none of the privileges in P on T through such a chain                      |
| `X cannot P T except under Q at S scope`   | X has no privilege in P on T other than through such a chain                     |
| `only X, Y can P T except under Q …`       | no role other than X and Y has a privilege in P on T, other than through Q       |
| `nobody can P T except under Q at S scope` | no role has a privilege in P on T other than through such a chain                |

`authenticated` keeps its meaning: in `can` the Authenticated Users role itself, in `cannot` and `only` every role except Anonymous Users. The requirement above becomes:

```yaml
access:
  - authenticated can read incident at contact scope
  - authenticated can read task under incident at contact scope
  - authenticated cannot read task except under incident at contact scope
  - authenticated cannot write, create, delete task
```

The third line fails on a task permission under a global incident permission, under a permission on another table, or at any other scope, for any signed-in role.

`any table` works as it does today: `nobody can delete any table under incident` checks every child table under incident permissions.

### Messages

A failure names each grant that breaks the statement, as today. For a grant through a chain, the message says where the chain goes, so the reader can see why it didn't match:

```
✗ authenticated cannot read task except under incident at contact scope
  Customers has read on task (parent scope) from "Task - Customers", under "Incident - All" (incident, global scope)
```

Today `underParent` in `src/graph/describe.ts` names only the top permission. It gains the top permission's table and scope, in `test` and `diff` alike (decision 4).

### Warnings

A parent table that no table permission mentions gets the same warning as an unknown table today.

### What doesn't change

- `lint`, `diff`, `docs` and the GitHub Action.
- How roles flow down a chain. Whether a child's own role that its parent lacks gets access at runtime is still open ([ROADMAP](ROADMAP.md), open question 2); until it's known, the grant counts, as it does today.

## Changes

- `src/policy/types.ts`: `under` and `except` (a table name and an optional scope) on `AccessBase`.
- `src/policy/parse.ts`: the clauses, the error for `at … scope under`, and the error for `except under` in `can`.
- `src/policy/evaluate.ts`: the filter in `matching`, and `except` in `cannot`, `only` and `nobody`.
- `docs/policy.md`: the grammar and the "passes when" table.
- `test/fixtures/policies/broken.policy.yaml`: `broken` has a task permission under "Incident - Case Manager Contact" with inherited roles, and a broken chain. Add a passing and a failing case for each form, plus a case where the chain has two levels.
- `test/policy/policy.test.ts` and the text snapshot.
- `README.md` if its policy example changes.

## Decisions

The maintainer took the recommendation on each question (2026-10-31).

1. **Which permissions in the chain `under Q` looks at.** (a) Any permission in the chain, the nearest one on Q counting; (b) only the direct parent; (c) only the root. Decided: (a). With one level, which is the common case, they're all the same; with `incident → task → note`, (a) lets you write `note under incident`, which is what a reader means.
2. **What `at S scope` after `under Q` is about.** (a) The permission on Q that matched; (b) the root of the chain, whatever its table. Decided: (a), as the sentence reads. When the permission on Q is itself parent scope, you write `under incident at parent scope`, or name the root's table instead (`under contact at self scope`). (b) is what decides the rows, but it makes `task under incident at contact scope` true for an incident permission at parent scope under an account permission at contact scope, which is hard to read.
3. **The relationship.** Should a statement name `parentrelationship` (`under incident through Incident_Tasks`)? Two lookups from one table to another give two relationships with different rows. Decided: not now. Tables cover the requirement, and messages can show the relationship. Add it if someone asks.
4. **Messages: the top permission's table and scope.** Add `(incident, global scope)` to `under "<top parent>"` in `underParent`, which `test` and `diff` share? Decided: yes. Without it, a failed `except under` shows the permission name only, and the reader has to open its file. It changes the `diff` snapshots and the text in pull request comments.
5. **`except under` in `cannot`, `only` and `nobody` only.** Decided: yes, and an error in `can`. Allowing a negated filter in `can` (`can read task except under incident`) would be a second way to say `can read task` with fewer grants, which nobody needs.
6. **More than one `except under`.** A table reachable through two intended chains (tasks of my incidents, and tasks of my account's incidents) would need two. Decided: not now: write one statement per role or scope. Add a comma list (`except under incident at contact scope, incident at account scope`) when asked.

## As built

Built to draft 2 with every decision as recorded. The user reference is "Parent chains" in [docs/policy.md](../docs/policy.md). Where the code needed an interpretation the spec doesn't give:

1. **Grammar.** `under` and `except under` can both be in one statement, and `at … scope` can come before `except under` (`nobody can read task at parent scope except under incident`). `at … scope` before `under` is an error, and so is `except under` in `can`, each with its own message.
2. **Matching.** `under` and `except under` filter the grants in one place (`matching` in `src/policy/evaluate.ts`), so a `can` statement's "has:" context lines use the same filter. A non-parent grant has no chain, so it's never under one, and `except under` never leaves it out.
3. **Messages.** A failed `can` names the clause: `authenticated doesn't have read on task under incident at global scope`. `underParent` names the top of the chain with its table and scope, which also changes `diff` lines and the pull request comment (decision 4); [docs/diff.md](../docs/diff.md) says so.
4. **Warnings.** A table in `under` or `except under` that nothing in the site mentions gets the unknown-table warning.
5. **Fixtures.** A new site, `test/fixtures/parent-chains/`, rather than more permissions in `broken/`, whose lint findings and docs snapshots would change. Its policy is `test/fixtures/policies/parent-chains.policy.yaml`, with a text snapshot.
