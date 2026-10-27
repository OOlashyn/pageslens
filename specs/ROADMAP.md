# Roadmap

Where pageslens stands and what comes next. Keep this file short and current: update it in the same change that finishes or starts a piece of work. History lives in the feature specs and in [archive/m1-plan.md](archive/m1-plan.md).

## Status (2026-10-26)

|                     |                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Released (`latest`) | `0.8.0`: `lint`, `test`, `diff`, `docs`, `--format sarif`, the GitHub Action, code-site and classic downloads and unpacked solutions (spec [0007](0007-solution-adapter.md)), settings from environment variables, config ignores (unused ones listed), inactive records left out, and page access for classic sites in all four commands (specs [0005](0005-page-access-rules.md), [0006](0006-page-access-test-diff.md)) |
| Milestones          | M1 (MVP) and M2 (policies, SARIF, diff, the GitHub Action) done. M3: the solution adapter shipped in 0.8.0; `align` is built (spec [0008](0008-align.md)) and waits for a release                                                                                                                                                                                                                                          |

## Next

1. **The `setting-secret-value` lint rule** (0008, decision 6): a setting whose name ends in `ClientSecret`, `AppSecret` or `ConsumerSecret` with a value of its own. `align` itself is built and in the next release.
2. **Verification in a Dataverse environment**, whenever one is at hand: the open questions below. Question 1 decides an error-level rule, and question 3 the README's status note.

## Verification still owed

- Run `diff` on macOS.
- The action on GitHub: a comment near the size cap, a fork pull request (needs a second account), a token without `pull-requests: write`, and a comment with both the alignment and the access changes.
- `align` on advanced forms, column permissions, Server Logic and cloud flows, and a code site's variable-backed setting (0008, verification 2 and 3).

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
- `align --fix`: print the `pac solution add-solution-component` commands for what the solution is missing. Needs investigation first: site component type numbers per environment, and whether `pac pages upload` keeps GUIDs (0008, decision 1).
- `align --target`: a download of test or prod against the solution, to show edits made in the target. Needs environments to deploy to and a sample download from a managed target (0008, decision 2).
- Web files in effective access: who can download them, in `docs`, `test` and `diff` (left out by 0005, decision 9; `diff` already shows a rule's scope change). On hold: not a common enough case yet.
