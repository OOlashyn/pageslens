# Roadmap

Where pageslens stands and what comes next. Keep this file short and current: update it in the same change that finishes or starts a piece of work. History lives in the feature specs and in [archive/m1-plan.md](archive/m1-plan.md).

## Status (2026-10-24)

|                         |                                                                                                                                                                                                                                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Released (`latest`)     | `0.5.0`: `lint`, `test`, `diff`, `docs`, `--format sarif`, the GitHub Action, code-site and classic layouts, config ignores                                                                                                                                                                                               |
| On `main`, not released | inactive records (`statecode: 1`) left out everywhere; the action compares with the pull request's head commit; page access rules for classic sites in `lint` (eight rules) and `docs` (`pages.md`), spec [0005](0005-page-access-rules.md). Goes out with `0.6.0`; draft notes in [releases/0.6.0.md](releases/0.6.0.md) |
| Milestones              | M1 (MVP) and M2 (policies, SARIF, diff, the GitHub Action) done. `align` waits for the solution adapter (M3)                                                                                                                                                                                                              |

## Next

1. **Release `0.6.0`** with page access rules (lint and `docs`, classic sites) and the fixes already on `main`. Ready: the lint rules are reviewed and the notes are in [releases/0.6.0.md](releases/0.6.0.md).
2. **Page access in `test` and `diff` (0.7.0):** `page "<url>"` statements in the policy grammar, and the effective per-branch diff (decisions 4 and 7 in spec 0005).
3. Then the candidates below.

## Verification still owed

- Run `diff` on macOS.
- The action on GitHub: a comment near the size cap, a fork pull request (needs a second account), a token without `pull-requests: write`.

## Open questions (need a Dataverse environment)

1. Does an Account-scope permission without `accountrelationship` (as in EcoFlux) grant anything at runtime? Decides whether `scope-relationship-missing` stays an error.
2. A child permission with a web role its parent lacks: does that role get access at runtime? Decides a `parent-roles-not-subset` rule.
3. Does a standard data model site download in the same layout as an enhanced one, as the README expects?
4. Page access rules ([0005](0005-page-access-rules.md)): which rule wins when a page has several Restrict Read rules, and what the Anonymous Users role does on a Grant Change rule. Everything else in its "Verification owed" was checked.

## Candidates

- `webapi-inner-errors` lint rule (`Webapi/error/innererror = true`; EcoFlux has it).
- Report ignore entries in `pageslens.config.yaml` that no longer match anything.
- JUnit output for `test`, if CI users ask.

## Later (M3 and beyond)

- Solution adapter (unpacked `powerpagecomponents/<guid>` and `.zip`), then `align` ([alm-story.md](research/alm-story.md)).
- Agent skills on `--format json`: `site-review`, `pr-access-review`, `site-docs`.
- Classic site-structure rules and site map docs (page access rules moved to Next).
- Server Logic and cloud flows in docs.
