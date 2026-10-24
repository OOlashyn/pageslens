# Roadmap

Where pageslens stands and what comes next. Keep this file short and current: update it in the same change that finishes or starts a piece of work. History lives in the feature specs and in [archive/m1-plan.md](archive/m1-plan.md).

## Status (2026-10-24)

|                     |                                                                                                                             |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Released (`latest`) | `0.5.0`: `lint`, `test`, `diff`, `docs`, `--format sarif`, the GitHub Action, code-site and classic layouts, config ignores |
| Milestones          | M1 (MVP) and M2 (policies, SARIF, diff, the GitHub Action) done. `align` waits for the solution adapter (M3)                |

## Next

1. **Try the action on a real repository** at `v0.5.0`: a pull request that widens access (comment created, then edited), one that narrows it back (comment edited to say so), the SARIF upload with alerts on the GUID lines, and a fork pull request (summary only). This repository's CI already runs it on every pull request: the commands, the comment lookup with `pull-requests: write` and the failing `finish` step work on GitHub.
2. Then the candidates below.

## Verification still owed

- Upload SARIF to a real repository's code scanning and check that alerts land on the GUID lines.
- Run `diff` on macOS, and on a real pull request that changes access (it runs on Linux in the action job, with no access changes).
- The action on GitHub: comment created and edited, a comment near the size cap, fork pull requests, missing permissions, installing from npm at a release tag.

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
- Classic site-structure rules and page access rules (also for `diff`), site map docs.
- Server Logic and cloud flows in docs.
