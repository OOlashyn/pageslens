# Roadmap

Where pageslens stands and what comes next. Keep this file short and current: update it in the same change that finishes or starts a piece of work. History lives in the feature specs and in [archive/m1-plan.md](archive/m1-plan.md).

## Status (2026-10-25)

|                         |                                                                                                                                                                                                                                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Released (`latest`)     | `0.7.0`: `lint`, `test`, `diff`, `docs`, `--format sarif`, the GitHub Action, code-site and classic layouts, config ignores, inactive records left out, and page access for classic sites in all four commands (specs [0005](0005-page-access-rules.md), [0006](0006-page-access-test-diff.md)) |
| On `main`, not released | the `webapi-inner-errors` lint rule, and unused ignore entries listed by `lint`. Goes out with `0.8.0`, together with the solution adapter                                                                                                                                                      |
| Milestones              | M1 (MVP) and M2 (policies, SARIF, diff, the GitHub Action) done. `align` waits for the solution adapter (M3)                                                                                                                                                                                    |

## Next

1. **Solution adapter** (spec [0007](0007-solution-adapter.md), every question answered; build next). Read an unpacked solution in the XML format (`powerpagecomponents/<guid>`, from `pac solution unpack` or `clone`) with one site into the same model, so `lint`, `test`, `docs` and `diff` work on it.
2. **Release `0.8.0`** with the solution adapter, the `webapi-inner-errors` rule and the unused ignore entries. Notes so far: [releases/0.8.0.md](releases/0.8.0.md).
3. **`align`** (M3, its own spec): whether a site download and an unpacked solution are the same site, so a component left out of the solution shows before it is deployed ([alm-story.md](research/alm-story.md)).
4. **Verification in a Dataverse environment**, whenever one is at hand: the open questions below. Question 1 decides an error-level rule, and question 3 the README's status note.

## Verification still owed

- Run `diff` on macOS.
- The action on GitHub: a comment near the size cap, a fork pull request (needs a second account), a token without `pull-requests: write`.

## Open questions (need a Dataverse environment)

1. Does an Account-scope permission without `accountrelationship` (as in EcoFlux) grant anything at runtime? Decides whether `scope-relationship-missing` stays an error.
2. A child permission with a web role its parent lacks: does that role get access at runtime? Decides a `parent-roles-not-subset` rule.
3. Does a standard data model site download in the same layout as an enhanced one, as the README expects?
4. Page access rules ([0005](0005-page-access-rules.md)): which rule wins when a page has several Restrict Read rules, and what the Anonymous Users role does on a Grant Change rule. Everything else in its "Verification owed" was checked.

## Candidates

- Agent skills on `--format json`: `site-review`, `pr-access-review`, `site-docs`.
- JUnit output for `test`, if CI users ask. It's what Azure DevOps shows in a pipeline's Tests tab.

## Later

- Classic site-structure rules and site map docs.
- Server Logic and cloud flows in docs.
- Azure DevOps: a template or Marketplace task that does what the GitHub Action does (pull request comment, SARIF with GitHub Advanced Security for Azure DevOps). Not a priority: a pipeline can already run `npx pageslens` in a script step.
- Solution `.zip` files, read without unpacking.
- The solution YAML source control format (Dataverse Git integration; `pac solution clone` from PAC CLI 2.4.1, as Learn says). Getting it out of `pac` didn't work on 2026-10-25: to investigate (0007, verification 1).
- Solutions with more than one site (`--site`).
- Web files in effective access: who can download them, in `docs`, `test` and `diff` (left out by 0005, decision 9; `diff` already shows a rule's scope change). On hold: not a common enough case yet.
