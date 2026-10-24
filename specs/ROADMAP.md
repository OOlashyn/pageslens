# Roadmap

Where pageslens stands and what comes next. Keep this file short and current: update it in the same change that finishes or starts a piece of work. History lives in the feature specs and in [archive/m1-plan.md](archive/m1-plan.md).

## Status (2026-10-24)

|                     |                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Released (`latest`) | `0.4.0`: `lint`, `test`, `diff`, `docs`, `--format sarif`, code-site and classic layouts, config ignores and JSON Schema |
| In design           | GitHub Action ([0004](0004-github-action.md)): decided, to build                                                         |
| Milestones          | M1 (MVP) done. M2: policies, SARIF and diff done; the GitHub Action left. `align` waits for the solution adapter         |

## Next

1. **GitHub Action** (last M2 piece). Spec [0004](0004-github-action.md) is decided: a composite action in this repository that runs `lint` and `test` with SARIF upload and posts `diff --merge-base --format markdown` as one sticky comment. Next: build it. It's also the first real test of the SARIF upload and of a diff comment near the size cap.

## Verification still owed

- Upload SARIF to a real repository's code scanning and check that alerts land on the GUID lines.
- Run `diff` on Linux or macOS, with a newer git, and on a real pull request.

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
