# Roadmap

Where pageslens stands and what comes next. Keep this file short and current: update it in the same change that finishes or starts a piece of work. History lives in the feature specs and in [archive/m1-plan.md](archive/m1-plan.md).

## Status (2026-10-24)

|                         |                                                                                                                                                                                              |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Released (`latest`)     | `0.5.0`: `lint`, `test`, `diff`, `docs`, `--format sarif`, the GitHub Action, code-site and classic layouts, config ignores                                                                  |
| On `main`, not released | inactive records (`statecode: 1`) left out everywhere; the action compares with the pull request's head commit. Goes out with `0.6.0`; draft notes in [releases/0.6.0.md](releases/0.6.0.md) |
| Milestones              | M1 (MVP) and M2 (policies, SARIF, diff, the GitHub Action) done. `align` waits for the solution adapter (M3)                                                                                 |

## Next

1. **Page access rules, classic sites first** (spec `0005` to write first). pageslens already reads them (`webpagerule`, with their roles) but only `role-unused` uses them. To decide: what a rule means offline (Restrict Read and Grant Change, inheritance down the page tree), which lint rules (`page-access-gap` and others), whether `docs`, `test` and `diff` cover them in the same release (`diff` has the rule-level classification waiting in [0003](0003-diff.md)), and what code sites download for pages.
2. **Release `0.6.0`** with the page access work and the action fix already on `main`.
3. Then the candidates below.

## Verification still owed

- Run `diff` on macOS.
- The action on GitHub: a comment near the size cap, a fork pull request (needs a second account), a token without `pull-requests: write`.

## Open questions (need a Dataverse environment)

1. Does an Account-scope permission without `accountrelationship` (as in EcoFlux) grant anything at runtime? Decides whether `scope-relationship-missing` stays an error.
2. A child permission with a web role its parent lacks: does that role get access at runtime? Decides a `parent-roles-not-subset` rule.
3. Does a standard data model site download in the same layout as an enhanced one, as the README expects?

## Candidates

- `webapi-inner-errors` lint rule (`Webapi/error/innererror = true`; EcoFlux has it).
- Report ignore entries in `pageslens.config.yaml` that no longer match anything.
- JUnit output for `test`, if CI users ask.

## Later (M3 and beyond)

- Solution adapter (unpacked `powerpagecomponents/<guid>` and `.zip`), then `align` ([alm-story.md](research/alm-story.md)).
- Agent skills on `--format json`: `site-review`, `pr-access-review`, `site-docs`.
- Classic site-structure rules and site map docs (page access rules moved to Next).
- Server Logic and cloud flows in docs.
