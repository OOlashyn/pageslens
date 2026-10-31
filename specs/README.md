# Specs

Design notes for pageslens: why it works the way it does. User docs are the [README](../README.md), [docs/](../docs/) and [rules/](../rules/); this folder is for contributors and coding agents.

| Path                     | What                                                                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| [ROADMAP.md](ROADMAP.md) | Status, what's next, open questions. Start here                                                                       |
| `NNNN-<feature>.md`      | One spec per feature, numbered in order: research summary, design, decisions, and an "As built" section once it ships |
| [research/](research/)   | The original product spec, the ALM story, spikes and research behind the specs                                        |
| [releases/](releases/)   | Release notes, pasted into GitHub releases                                                                            |
| [archive/](archive/)     | Finished plans, kept as history                                                                                       |

| Spec                                                                    | Status                                                 |
| ----------------------------------------------------------------------- | ------------------------------------------------------ |
| [0001: Policies, `pageslens test`](0001-policies.md)                    | shipped in 0.3.0                                       |
| [0002: SARIF output](0002-sarif.md)                                     | shipped in 0.4.0                                       |
| [0003: Access diffs, `pageslens diff`](0003-diff.md)                    | shipped in 0.4.0                                       |
| [0004: GitHub Action](0004-github-action.md)                            | shipped in 0.5.0                                       |
| [0005: Page access rules](0005-page-access-rules.md)                    | lint and docs shipped in 0.6.0; test and diff in 0.7.0 |
| [0006: Page access in `test` and `diff`](0006-page-access-test-diff.md) | shipped in 0.7.0                                       |
| [0007: Solution adapter](0007-solution-adapter.md)                      | shipped in 0.8.0                                       |
| [0008: `pageslens align`](0008-align.md)                                | shipped in 0.9.0                                       |
| [0009: Agent support](0009-agent-skills.md)                             | shipped in 0.10.0; skill closed                        |
| [0010: Deployment settings, `--settings`](0010-deployment-settings.md)  | shipped in 0.11.0                                      |
| [0011: Parent chains in policies](0011-policy-parent-chains.md)         | shipped in 0.12.0                                      |
| [0012: Documentation site](0012-docs-site.md)                           | deployed; output links ship in 0.13.0                  |

## Writing a spec

1. Copy the shape of an existing one: the question it answers, research with sources, design rules, the design, and open questions with a recommendation each.
2. The maintainer answers the open questions; record them under "Decisions" with the date. Don't decide them in the spec.
3. Build to the spec. Where the code needs an interpretation the spec doesn't cover, list it in the PR and in the spec's "As built" section.
4. Update [ROADMAP.md](ROADMAP.md) in the same PR.

Specs are public: no local paths, environment names, tenant details or credentials.
