# 0004: GitHub Action

**Status:** built, on `main` for 0.5.0. User reference: the README's "GitHub Action" section.

The last M2 piece. [0002-sarif.md](0002-sarif.md) and [0003-diff.md](0003-diff.md) built the outputs; this spec is the packaging that puts them on a pull request with one `uses:` line instead of the three workflows in the README's "In CI" section. It answers: where the action lives, what kind of action it is, how it pins pageslens, what it posts and with which permissions, and what happens on pull requests from forks.

## What it does

On a pull request:

1. `pageslens lint <path> --format sarif`, and `pageslens test <path> --format sarif` when a policy file is found.
2. Uploads both SARIF files with `github/codeql-action/upload-sarif` (categories `pageslens/lint/` and `pageslens/test/` are already in the files).
3. `pageslens diff --merge-base --format markdown origin/<base> HEAD <path>`, written to the job summary and posted as one sticky comment, found by the hidden marker `<!-- pageslens:diff site=<path> -->`.
4. Fails the job if lint had errors, a policy statement failed, or `--fail-on` matched, after every step above has run.

On a push to the default branch: steps 1, 2 and 4 only. Code scanning shows "new alerts in this pull request" by comparing with an analysis of the target branch, so the action is meant to run on both events.

## Research: how comparable actions are built

| Action                                                  | Shape                                                                                                                                                                                                                                                                                                                                                                                            | Notes for us                                                                                                                                                         |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GitHub dependency review**                            | JavaScript action. `comment-summary-in-pr: always / on-failure / never` (default `never`); "a new comment will overwrite the existing one"; needs `pull-requests: write` only when commenting. Always writes the job summary.                                                                                                                                                                    | Closest analogue (0003). Comment opt-in per outcome; job summary always.                                                                                             |
| **Infracost actions**                                   | Started as `setup` (install the CLI, the user runs `infracost diff` and `infracost comment github --behavior update` as steps); now recommends `diff` and `scan` actions that run a container image and do everything.                                                                                                                                                                           | Two shapes: "install the CLI" versus "do the whole job". The project moved to the second. A setup action alone leaves the comment logic to every user.               |
| **marocchino/sticky-pull-request-comment**              | JavaScript action. A `header` identifies the comment; `recreate`, `hide`, `hide_and_recreate`, `only_update`, `delete`. Needs `pull-requests: write`; "Resource not accessible by integration" means the token can't comment.                                                                                                                                                                    | The sticky comment is a solved problem. `only_update` is our "no access changes" case (edit an existing comment, don't create one). We can do it with `gh api`.      |
| **`github/codeql-action/upload-sarif`**                 | Needs `security-events: write` and the built-in token. `ref` and `sha` inputs "ignored for pull requests from forks".                                                                                                                                                                                                                                                                            | We call it, we don't reimplement it. Code scanning must be enabled on the repository, or the upload fails.                                                           |
| **GitHub Security Lab, "preventing pwn requests"**      | Fork pull requests run `pull_request` with a read-only token and no secrets. To comment on them: an unprivileged `pull_request` workflow saves results as an artifact; a `workflow_run` workflow with write permissions downloads it to `runner.temp` and posts it. "Artifacts resulting from untrusted PR data are themselves untrusted"; the PR number in the artifact is attacker-controlled. | Fork support is a second workflow, not a flag. Posting artifact text as a comment is acceptable; running anything from it isn't. Look the PR up by head SHA instead. |
| **GitHub docs: `pull_request_target`**                  | Runs with the base repository's write token and secrets, with the workflow from the base branch. Unsafe if it checks out and runs the pull request's code; `actions/checkout` v7 refuses that by default (`allow-unsafe-pr-checkout`).                                                                                                                                                           | pageslens only reads YAML, but a `pull_request_target` recipe invites copy-paste mistakes. Don't recommend it.                                                       |
| **GitHub docs: metadata syntax**                        | `runs.using: composite` (steps, inputs through `inputs.*`) or `node24` (a `main` script run by the runner's own Node.js). No Node.js version choice for a JavaScript action.                                                                                                                                                                                                                     | pageslens requires the October 2026 security releases (`^22.23.4 \|\| ^24.22.1 \|\| >=26.12.1`); the runner's bundled Node.js 24 may lag them. Composite can choose. |
| **GitHub docs: publishing to Marketplace**              | Public repository, a single `action.yml` at the root, a unique name, 2FA, published from a release. The repository "should" contain only the action's metadata, code and files.                                                                                                                                                                                                                  | This repository holds the CLI, tests and workflows. Listing it on Marketplace means either a separate repository or accepting a mixed one.                           |
| **GitHub docs: versioning actions; immutable releases** | Recommended: semver release tags plus a major tag (`v1`) moved to each release; the toolkit's versioning doc suggests users bind to the major tag, a SHA pin being the cautious option. Since October 2025, a release can be immutable: its tag can't be moved or deleted.                                                                                                                       | A moving major tag and immutable releases don't mix on the same tag name: `v0` would be a plain tag, not a release. pageslens is pre-1.0, so `v0` promises little.   |

### What the research says

1. **Do the whole job.** Users want one step that comments; a CLI-installer action leaves the sticky-comment and SARIF wiring to everyone (Infracost's move).
2. **Job summary always, comment when possible.** Dependency review writes the summary unconditionally; it works on forks.
3. **Forks need a second workflow** with `workflow_run`, treating the artifact as text. No action can work around the read-only token from inside the `pull_request` run.
4. **Least privilege per feature.** `security-events: write` only for SARIF, `pull-requests: write` only for the comment; each feature off when its permission is missing should say so, not crash.
5. **Pin what runs.** Actions are pinned by tag or SHA; the CLI the action runs should be pinned just as exactly, not "latest".

## Design rules

- **The action adds no logic the CLI lacks.** Output, classification, the size cap, exit codes: all from the CLI. The action runs commands, uploads files and posts one comment. Anything a user could want from the action they can also do with the CLI in their own workflow.
- **Exact versions.** The action runs one exact pageslens version, known from the action's own version. No `@latest`, no range.
- **Every step runs, then the job fails.** Lint failing must not hide the diff, and the SARIF must reach code scanning on a failing run (the README's `if: !cancelled()` pattern).
- **Degrade, don't fail, on missing permissions.** No `pull-requests: write` (a fork, or a cautious workflow): the diff still goes to the job summary, with a notice saying why there's no comment. Same for SARIF without `security-events: write`.
- **Untrusted input is data.** Refs, paths and comment bodies come from the pull request: inputs reach shell steps through `env`, never `${{ }}` inside `run:`; git runs as it does in the CLI; the comment body is posted from a file.

## Usage

```yaml
# .github/workflows/pageslens.yml
name: pageslens
on:
  pull_request:
  push:
    branches: [main]
permissions:
  contents: read
  security-events: write # SARIF upload
  pull-requests: write # access-changes comment
jobs:
  pageslens:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # the merge base needs both branches
      - uses: OOlashyn/pageslens@v0.5.0
        with:
          path: site
```

### Inputs

| Input          | Default                     | What                                                                                                                       |
| -------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `path`         | `.`                         | The site folder, as for `lint`. One site per step; a repository with several sites uses the action once per site.          |
| `policy`       | found as `test` finds it    | Policy file. No policy found: `test` is skipped with a notice, not an error (unlike the CLI, which fails closed).          |
| `lint`         | `true`                      | Run `lint`.                                                                                                                |
| `test`         | `true`                      | Run `test` when a policy is found.                                                                                         |
| `diff`         | `true`                      | Run `diff` on pull requests.                                                                                               |
| `sarif`        | `true`                      | Upload SARIF. Off: lint and test print text to the log instead.                                                            |
| `comment`      | `true`                      | Post the sticky comment. With no access changes, an existing comment is edited to say so; none is created.                 |
| `fail-on`      | (none)                      | Passed to `diff --fail-on` (`wider` or `any`).                                                                             |
| `base`         | the pull request's base ref | The base to compare with, as a ref. `origin/` is added to a branch name.                                                   |
| `node-version` | `24`                        | Node.js for pageslens, through `actions/setup-node`. Any version below the supported minimum fails with the CLI's message. |

### Outputs

`wider`, `narrower`, `neutral` (counts from `diff --format json`), `lint-errors`, `policy-failures`, `comment-url`. For later steps such as adding a label when anything is wider.

### Permissions

| Feature      | Needs                    | Without it                                       |
| ------------ | ------------------------ | ------------------------------------------------ |
| Everything   | `contents: read`         | checkout fails                                   |
| SARIF upload | `security-events: write` | notice, findings in the log and job summary only |
| Comment      | `pull-requests: write`   | notice, diff in the job summary only             |

Pull request comments are issue comments in the API; `pull-requests: write` is enough to create and edit them.

### Forks

On a fork pull request the token is read-only whatever the workflow asks for. The action detects it (`github.event.pull_request.head.repo.full_name` differs from the repository) and writes everything to the job summary, with one notice. Both SARIF upload and the comment are skipped.

For teams that want the comment on fork pull requests, a documented second workflow (not in v1 of the action, see open questions): the action writes `diff.md` and the head SHA as an artifact; a `workflow_run` workflow downloads it to `runner.temp`, finds the pull request by head SHA through the API (not a number from the artifact), and posts the file as the comment. The text is posted, never executed.

### The comment

- Body: exactly `pageslens diff --format markdown`. Its first line is the marker, which names the site path, so each site gets its own comment.
- Find: list the pull request's issue comments (paged), take the first by `github-actions[bot]` (or the token's user) whose body starts with the marker for this path. Create if none and there are changes; update if found; with no changes, update only if found.
- One comment, edited in place, like dependency review and Infracost's default. No hide-and-recreate in v1: an edited comment keeps its place near the top of the conversation, which suits a summary.
- `@` in role and permission names is escaped by the CLI's Markdown output so a name like `@org/team` can't mention anyone. (Today's `escape` in `src/diff/format/markdown.ts` doesn't cover `@`; fix in the same PR, since the comment is where it matters.)
- The 60,000-character cap is the CLI's. The job summary has a separate limit (about 1 MiB per step, not confirmed in GitHub's own docs), far above it.

### Pinning pageslens

The action installs exactly its own version: `npx --yes pageslens@<version>` with `<version>` fixed in `action.yml` at release time, or read from the action's `package.json` if the action lives in this repository. `actions/setup-node` with `cache: false`; nothing from the user's lockfile.

A `version` input to run a different pageslens is left out: an action and a CLI that drift apart is a support problem, and users who want another version can run the CLI directly.

### Failure

Every step runs with `if: !cancelled()`; a last step fails the job when lint exit code was 1, test was 1, or diff was 1 (only with `fail-on`). Exit code 2 from any command fails its own step at once, as a broken site or a bad ref should.

## How it ships

- `action.yml` at the root of this repository, composite. Users write `uses: OOlashyn/pageslens@v0.5.0`. The release that tags the CLI tags the action, so the two versions are one number.
- The README's "In CI" section leads with the action and keeps the raw CLI workflows below it.
- Tested in this repository's CI with `uses: ./` on fixtures: lint and test on `broken` (expected to fail, checked with `continue-on-error` and the outputs), diff on a fixture pair through a temporary commit. Comment posting and fork behaviour can only be checked on real pull requests: the "Verification still owed" list in the roadmap.

## Decisions (Oleksandr, 2026-10-24)

Every recommendation below is adopted:

1. The action lives in this repository, `action.yml` at the root, versioned with the CLI. No Marketplace listing for now.
2. Composite action.
3. It runs exactly its own pageslens version; no `version` input.
4. Exact tags only (`v0.5.0`) while pageslens is `0.x`; no moving `v0` tag.
5. Fork pull requests get the job summary only in v1; the `workflow_run` recipe waits until someone asks.
6. One `path` per step.
7. No policy file: `test` is skipped with a notice.
8. `fetch-depth: 0` is required; the action fails with a clear message when the merge base can't be found.
9. One comment, edited in place; no input for it in v1.

## Open questions for Oleksandr (answered, see Decisions)

1. **Where the action lives.** This repository (`action.yml` at the root, versioned with the CLI, no Marketplace listing) or a separate `pageslens-action` repository (Marketplace-listable, its own releases, a pageslens version to bump on each CLI release)? Recommended: this repository for now. Marketplace can come later as a thin repository that wraps this action, without breaking users.
2. **Composite or JavaScript.** Composite (`actions/setup-node` with a chosen Node.js, `npx`, `gh api` for the comment: shell, no bundled dependencies) or JavaScript on `node24` (pageslens bundled into the action, no npm fetch at run time, but the runner's Node.js version and `@actions/*` dependencies)? Recommended: composite, mainly because of the Node.js minimum.
3. **How it pins pageslens.** Exactly the action's own version, no override input (above), or a `version` input defaulting to it? Recommended: no input.
4. **Major tag.** Publish only exact tags (`v0.5.0`), or also move a `v0` tag on each release? A moving tag can't be an immutable release. Recommended: exact tags only while pageslens is `0.x`; README examples pin the exact tag, Dependabot updates it.
5. **Forks.** v1 writes the job summary on fork pull requests and stops there; the two-workflow `workflow_run` recipe is documented later, or shipped with v1 (as an action mode `comment-from: <artifact>`)? Recommended: summary only in v1; the recipe when someone asks, since this repository's users mostly work in one repository with branches.
6. **Several sites.** One `path` per step (call the action twice), or a list input? Recommended: one path. Markers already keep the comments apart; a list makes outputs and failure messages harder.
7. **No policy file.** Skip `test` with a notice (the action's default, unlike the CLI's fail-closed), or fail? Recommended: skip with a notice, so the action is useful before a team writes a policy; a `require-policy: true` input can come later.
8. **Shallow checkouts.** Require `fetch-depth: 0` and fail with a clear message when the merge base can't be found, or have the action fetch the base branch and deepen the history itself? Recommended: require it and fail clearly; fetching inside an action surprises people and is slow on big repositories.
9. **Comment behaviour.** Edit one comment in place, or hide the old one and post a new one at the bottom (`hide_and_recreate`), or make it an input? Recommended: edit in place, no input in v1.

## Sources

- GitHub dependency review action: https://github.com/actions/dependency-review-action
- Infracost actions: https://github.com/infracost/actions
- marocchino/sticky-pull-request-comment: https://github.com/marocchino/sticky-pull-request-comment
- upload-sarif inputs: https://github.com/github/codeql-action/blob/main/upload-sarif/action.yml
- GitHub Security Lab, preventing pwn requests: https://securitylab.github.com/resources/github-actions-preventing-pwn-requests/
- Securely using `pull_request_target`: https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target
- Metadata syntax for actions: https://docs.github.com/en/actions/reference/workflows-and-actions/metadata-syntax
- Publishing actions in GitHub Marketplace: https://docs.github.com/en/actions/how-tos/create-and-publish-actions/publish-in-github-marketplace
- Managing custom actions (release tags, major tags): https://docs.github.com/en/actions/how-tos/create-and-publish-actions/manage-custom-actions
- Action versioning (toolkit): https://github.com/actions/toolkit/blob/main/docs/action-versioning.md
- Immutable releases: https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases ; GA changelog (2025-10-28): https://github.blog/changelog/2025-10-28-immutable-releases-are-now-generally-available/

Not verified this pass: the job summary size limit (only secondary sources give 1 MiB); whether current Marketplace docs forbid workflow files in the repository (one search result said so, the page fetched didn't); the Node.js patch level bundled with the runner for `node24` actions.

## As built

Design: this document (draft 1, all 9 questions answered with the recommendations). User reference: the README's "GitHub Action" section.

- `action.yml` at the repository root, composite: `actions/setup-node` (pinned by SHA, no cache), then `action/main.ts` in three steps around `github/codeql-action/upload-sarif` (pinned by SHA): `run`, `comment`, `finish`.
- `run` installs exactly the `package.json` version (`npm install --ignore-scripts` into `RUNNER_TEMP`), runs `lint` and `test` twice each (text for the log and the exit code, SARIF for the upload and the counts) and `diff` twice (Markdown with `--fail-on`, JSON for the counts). It never fails; what failed goes to a file that `finish` reports, so every step runs first.
- The comment is found by the marker line and `user.type == Bot`, so a person's comment that starts with the marker is never edited. 403 and 404 from the API are a notice, not a failure.
- Markdown output now writes `@` as `@&#8203;` (a zero-width space after it), so names can't mention users or teams; the same trick Renovate uses.
- Interpretations made while building:
  - `action/main.ts` is TypeScript that Node.js runs directly (type stripping, no build); it's type-checked with the rest. A JavaScript action wasn't needed for this.
  - A `token` input (default `github.token`) for the comment, which the spec's input table left out.
  - `PAGESLENS_ACTION_CLI` (an environment variable, not an input) runs a local build instead of the npm version. It's for this repository's CI, which runs the action with `uses: ./` on EcoFlux.
  - Exit code 2 from a command doesn't stop the `run` step at once: it's reported, the other commands still run, and `finish` fails the job. A shallow checkout gets its own error message pointing at `fetch-depth: 0`.
  - The job summary lists the lint and test counts before the diff.
  - SARIF from a command that couldn't run (exit 2) is deleted, so the upload doesn't fail on an empty file.
- Tested: helpers in `test/action/main.test.ts`; `run` and `finish` on a temporary repository (pull request, push, fork, failing lint and policy, a base that doesn't exist); `comment` against a local mock of the API (create, nothing to post, update, 403).
- **Not verified:** a real run on GitHub (the CI job does that on the first pull request), the comment on a real pull request, a fork pull request, the SARIF upload, and the action at a release tag installing from npm.
