# Roadmap

Where pageslens stands and what comes next. Keep this file short and current: update it in the same change that finishes or starts a piece of work. History lives in the feature specs and in [archive/m1-plan.md](archive/m1-plan.md).

## Status (2026-11-01)

|                     |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Released (`latest`) | `0.13.0`: `lint`, `test`, `diff`, `align`, `docs`, `explain`, `--format sarif`, the GitHub Action, parent chains in policies (`under` and `except under`, spec [0011](0011-policy-parent-chains.md)), recipes for an ALM workflow and Azure Pipelines ([docs/alm.md](../docs/alm.md), [docs/azure-devops.md](../docs/azure-devops.md)), code-site and classic downloads and unpacked solutions (specs [0007](0007-solution-adapter.md), [0008](0008-align.md)), settings from environment variables and a stage's deployment settings file (`--settings`, spec [0010](0010-deployment-settings.md)), config ignores (unused ones listed), inactive records left out, and page access for classic sites in all four commands (specs [0005](0005-page-access-rules.md), [0006](0006-page-access-test-diff.md)), and the docs site at [pageslens.olashyn.dev](https://pageslens.olashyn.dev), which the output links to (spec [0012](0012-docs-site.md)) |
| Milestones          | M1 (MVP) and M2 (policies, SARIF, diff, the GitHub Action) done. M3 done: the solution adapter shipped in 0.8.0, `align` and the `setting-secret-value` rule in 0.9.0. Agent support done: `explain` and the README section for agents in 0.10.0; a comparison on the fixtures found no need for a skill (spec [0009](0009-agent-skills.md))                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

## Next

1. **Verification in a Dataverse environment**, whenever one is at hand: the open questions below. Question 1 decides an error-level rule, and question 3 the README's status note.

## Verification still owed

- The Azure Pipelines steps in [docs/azure-devops.md](../docs/azure-devops.md) in a test organization: the merge base after checkout, the pull request comment, and Advanced Security ([research/azure-devops.md](research/azure-devops.md), "To verify").
- Run `diff` on macOS.
- The action on GitHub: the `settings` input, a comment near the size cap, a fork pull request (needs a second account), a token without `pull-requests: write`, and a comment with both the alignment and the access changes.
- Downloads and solutions from `pac` 2.9.x, the version the ALM white paper pins, through the adapter tests; record each real fixture pair's `pac` version.
- `pac solution add-solution-component --componentType powerpagecomponent` for a site component, as the white paper says (`align --fix` needs it).
- `align` on advanced forms, column permissions, Server Logic and cloud flows, and a code site's variable-backed setting (0008, verification 2 and 3).

## Open questions (need a Dataverse environment)

1. Does an Account-scope permission without `accountrelationship` (as in EcoFlux) grant anything at runtime? Decides whether `scope-relationship-missing` stays an error.
2. A child permission with a web role its parent lacks: does that role get access at runtime? Decides a `parent-roles-not-subset` rule.
3. Does a standard data model site download in the same layout as an enhanced one, as the README expects?
4. What does the import do with an empty `Value` in a deployment settings file, or a variable the file doesn't list: keep the target's value, use the default, or fail? `--settings` keeps today's behaviour until it's known (spec [0010](0010-deployment-settings.md), decision 2).
5. Page access rules ([0005](0005-page-access-rules.md)): which rule wins when a page has several Restrict Read rules, and what the Anonymous Users role does on a Grant Change rule. Everything else in its "Verification owed" was checked.

## Candidates

- JUnit output for `test`, if CI users ask. It's what Azure DevOps shows in a pipeline's Tests tab.

## Later

- A `pageslens` agent skill or plugin, if people ask for one (0009, decision 15; part 3 has the design).
- Classic site-structure rules and site map docs.
- Server Logic and cloud flows in docs.
- Azure DevOps: a Marketplace task that does what the GitHub Action does, postponed (decision 3 in [research/azure-devops.md](research/azure-devops.md)). Script steps are documented in [docs/azure-devops.md](../docs/azure-devops.md). GitHub repositories built by Azure Pipelines, and Azure DevOps Server, come after that.
- Solution `.zip` files, read without unpacking.
- The solution YAML source control format (Dataverse Git integration; `pac solution clone` from PAC CLI 2.4.1, as Learn says). Getting it out of `pac` didn't work on 2026-10-25: to investigate (0007, verification 1).
- Solutions with more than one site (`--site`).
- `align --fix`: print the `pac solution add-solution-component` commands for what the solution is missing. The white paper says `--componentType powerpagecomponent` works where the numbers don't, which would settle the type numbers (to verify). Still open: whether `pac pages upload` keeps GUIDs on a classic site; a code site's changed web files get new ones (0008, decision 1).
- `align --target`: a download of test or prod against the solution, to show edits made in the target, which the white paper's "downstream is import-only" rule forbids. Needs environments to deploy to and a sample download from a managed target (0008, decision 2).
- Web files in effective access: who can download them, in `docs`, `test` and `diff` (left out by 0005, decision 9; `diff` already shows a rule's scope change). On hold: not a common enough case yet.
