# In CI

For a full ALM workflow (the site and its solution in one repository, a check per stage, nightly drift against Dev, access changes in release notes), see [Recipes for an ALM workflow](alm.md). For Azure Pipelines with Azure Repos, see [Azure Pipelines](azure-devops.md).

## GitHub Action

The pageslens action does it all in one step: it runs `lint` and `test`, uploads the results to code scanning, and posts what a pull request does to access as one comment, which it edits on each run.

```yaml
# .github/workflows/pageslens.yml
name: pageslens
on:
  pull_request:
  push:
    branches: [main]
permissions:
  contents: read
  security-events: write # upload results to code scanning
  pull-requests: write # the access-changes comment
jobs:
  pageslens:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # the merge base needs the history of both branches
      - uses: OOlashyn/pageslens@v0.12.0
        with:
          path: site
```

- **On a pull request** it runs `lint`, `test` (when it finds a `pageslens.policy.yaml`) and `diff --merge-base`, which compares the pull request's head commit with where it branched from the base branch, as GitHub's own diff does. The access changes go to the run's summary page and to the comment. With no access changes it doesn't add a comment; it edits an earlier one to say so.
- **On a push** to `main` it runs `lint` and `test` only. Code scanning compares a pull request's alerts with the last analysis of `main`, so run the action on both.
- **With `solution`** it also runs `align <path> <solution>`: its results go to code scanning, its findings to the comment above the access changes, and errors fail the job. It's off by default: set it when you commit both a download and the solution taken from dev together.
- **With `settings`** every command gets `--settings <file>`, so the checks are for that stage. To check several stages, run the action once per stage (a matrix); each run edits the same comment, so turn `comment` off on all but one.
- **The job fails** when lint finds errors, a policy statement fails, align finds errors, or `fail-on` matches, after all the steps have run, so the results are uploaded and the comment is posted either way.
- **Pull requests from forks** get a read-only token, so there the results go to the run's summary page only, with a notice.
- **Permissions:** without `security-events: write`, or with code scanning not available for the repository, the upload is skipped with a notice. Without `pull-requests: write`, the comment is.
- **Version:** `v0.12.0` runs exactly pageslens 0.12.0. Dependabot (`package-ecosystem: github-actions`) keeps the tag up to date.

| Input          | Default                 | What                                                                                                    |
| -------------- | ----------------------- | ------------------------------------------------------------------------------------------------------- |
| `path`         | `.`                     | The site folder. For several sites, use the action once per site; each gets its own comment.            |
| `policy`       | nearest one             | The policy file. With none, `test` is skipped with a notice.                                            |
| `solution`     |                         | The unpacked solution to compare `path` with (`align`). Empty skips `align`.                            |
| `settings`     |                         | One stage's deployment settings file, given to every command as `--settings`.                           |
| `lint`         | `true`                  | Run `lint`.                                                                                             |
| `test`         | `true`                  | Run `test`.                                                                                             |
| `diff`         | `true`                  | Run `diff` on pull requests.                                                                            |
| `sarif`        | `true`                  | Upload the results to code scanning.                                                                    |
| `comment`      | `true`                  | Post the access changes as a comment.                                                                   |
| `fail-on`      |                         | `wider` or `any`: fail when the diff has wider changes, or any change. By default the diff never fails. |
| `base`         | the pull request's base | The ref to compare with. `origin/` is added to a branch name.                                           |
| `node-version` | `24`                    | Node.js for pageslens.                                                                                  |
| `token`        | `github.token`          | The token for the comment.                                                                              |

Outputs: `wider`, `narrower`, `neutral`, `lint-errors`, `policy-failures`, `align-errors` and `comment-url`, for example to add a label when anything is wider.

## Without the action

```yaml
# .github/workflows/pages.yml
name: Power Pages checks
on: pull_request
jobs:
  pageslens:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - run: npx pageslens@0 lint site
      - run: npx pageslens@0 test site
```

To see findings and failed policy statements as annotations on the pull request and in the repository's **Security** tab, write SARIF and upload it with GitHub's `upload-sarif` action (code scanning needs to be available for the repository):

```yaml
# .github/workflows/pages.yml
name: Power Pages checks
on: pull_request
permissions:
  contents: read
  security-events: write
jobs:
  pageslens:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - run: mkdir -p sarif
      - run: npx pageslens@0 lint site --format sarif > sarif/lint.sarif
      - run: npx pageslens@0 test site --format sarif > sarif/test.sarif
        if: ${{ !cancelled() }}
      - uses: github/codeql-action/upload-sarif@v4
        if: ${{ !cancelled() }}
        with:
          sarif_file: sarif
```

The exit codes stay the same with `--format sarif`, so the job still fails on lint errors and failed statements. The `if` lines make the later steps run anyway, so the results reach code scanning.

To show a pull request's access changes on the run's summary page, compare with the merge base, as the pull request's own diff does. That needs the history of both branches, so check out with `fetch-depth: 0`:

```yaml
# .github/workflows/access-changes.yml
name: Access changes
on: pull_request
jobs:
  diff:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - run: npx pageslens@0 diff --merge-base --format markdown "origin/$BASE" HEAD --site site >> "$GITHUB_STEP_SUMMARY"
        env:
          BASE: ${{ github.base_ref }}
```

## What the SARIF contains

- **Two runs, kept apart.** `lint` and `test` each get their own category (`pageslens/lint/`, `pageslens/test/`), so uploading both doesn't replace one with the other.
- **Rules.** Every lint rule, with its page as help. For `test`, one rule per statement, named `policy/<id>`, or a slug of the statement's text when it has no `id`. Give statements an `id` if you want their alerts to survive a rewording.
- **Locations.** A finding points at its record's file and the line of the record's GUID, so findings in shared files like `webrole.yml` land on the right record. A failed statement points at each table permission or setting that breaks it, with the statement's line in the policy as a related location. A failure with nothing in the site to point at, such as a missing setting or a privilege a role lacks, points at the statement itself.
- **Levels.** `error`, `warning` and `info` become `error`, `warning` and `note`, with GitHub security severities high, medium and low. Every failed statement is an `error`.
- **Paths** are relative to the folder pageslens runs in, so run it from the repository root.
