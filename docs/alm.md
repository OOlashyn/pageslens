# Recipes for an ALM workflow

Where pageslens goes in a Power Pages ALM workflow like the one Microsoft's white paper "Power Pages application lifecycle management (ALM): recommended approach" describes: the site and its solution in one repository, pull requests into protected branches, a nightly drift check against Dev, and releases tagged on `main` and promoted to Test and Prod. The paper's gates cover code, tests, packing and the solution checker; none of them reviews table permissions, web roles, the Web API or site settings. These recipes add that review, at the points where a person decides.

Each recipe stands alone. Change `Portal` to your solution's folder name and the stage names to yours.

## The layout

```
.powerpages-site/            the site, as pac pages download-code-site writes it
solutions/
  Portal/
    src/                     the solution, as pac solution sync writes it (Other/Solution.xml)
deployment-settings/
  test.json                  each stage's environment variable values
  prod.json
pageslens.policy.yaml        your requirements, for pageslens test
pageslens.config.yaml        severities and ignores, if you need any
```

pageslens finds both snapshots from these folders: `.` is the site (it finds `.powerpages-site/`), and `solutions/Portal` is the solution (it looks in `src/`). A base solution without site components, kept next to it, doesn't get in the way: point pageslens at the site's solution only.

The two snapshots must come from one run against one environment: download the site and sync the solution one after the other, as the paper's `sync:solution` script does, and commit both in the same commit. Taken apart, they disagree on whatever changed in between, and a code site's upload gives changed web files new GUIDs, so they can't match.

## Pull request validation

The pageslens action runs `lint` and `test` on the site, `align` between the site and the solution, and `diff --merge-base`, and posts the access changes and the alignment as one pull request comment. With `settings`, rules and policy statements check the values that stage gets instead of `unknown`.

Settings differ per stage, so check each stage with its own run. Code scanning and the comment come from one stage: two runs would each replace the other's alerts and edit the same comment.

```yaml
# .github/workflows/pr-validation.yml (a job to add to it)
on:
  pull_request:
  push:
    branches: [develop, main]
permissions:
  contents: read
  security-events: write # code scanning
  pull-requests: write # the access-changes comment
jobs:
  pageslens:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        stage: [test, prod]
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # the merge base needs the history of both branches
      - uses: OOlashyn/pageslens@v0.11.0
        with:
          path: .
          solution: solutions/Portal
          settings: deployment-settings/${{ matrix.stage }}.json
          sarif: ${{ matrix.stage == 'prod' }}
          comment: ${{ matrix.stage == 'prod' }}
```

- The job fails on lint errors, failed policy statements and `align` errors for either stage. Add `fail-on: wider` to fail on access widening too.
- It works the same on `feature/*` → `develop` and on the `develop` → `main` release pull request: `diff --merge-base` compares the pull request's head with where it branched.
- `align` warns `variable-not-in-settings` for a variable that has a value in the solution and none in a stage's file: the stage may get dev's value. Fill in the file, or ignore the finding when dev's value is right for every stage.
- If the site is edited in pull requests and the solution is synced only after the deploy, the site is ahead of the solution on every pull request: leave `solution` out there. See [align.md](align.md#how-it-fits).

Without the action, the same checks as script steps:

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 24
- run: npx pageslens@0 lint . --settings deployment-settings/prod.json
- run: npx pageslens@0 test . --settings deployment-settings/prod.json
- run: npx pageslens@0 align . solutions/Portal --settings deployment-settings/prod.json
- run: npx pageslens@0 diff --merge-base "origin/$BASE" HEAD --settings deployment-settings/prod.json --format markdown >> "$GITHUB_STEP_SUMMARY"
  if: ${{ github.event_name == 'pull_request' }}
  env:
    BASE: ${{ github.base_ref }}
```

## Nightly environment drift

The paper's nightly job runs `pac solution sync` against Dev and fails when `git diff` isn't empty, because nothing else sees an edit made in the maker portal. The raw diff of `powerpagecomponent.xml` files is hard to read. Run `pageslens diff` between the last commit and what the sync wrote, so the job summary says what the drift does to access, in sentences:

```yaml
# ... the paper's steps: install pac, sign in, pac solution sync into solutions/Portal/src
- uses: actions/setup-node@v4
  with:
    node-version: 24
- name: Access changes made in Dev
  if: ${{ !cancelled() }}
  run: npx pageslens@0 diff HEAD solutions/Portal --format markdown >> "$GITHUB_STEP_SUMMARY"
# ... the paper's step that fails on git diff and uploads the patch
```

`diff HEAD solutions/Portal` compares the folder as committed with the folder as it is now, uncommitted changes included. A sync that changed only content, not access, shows "No access changes", and the paper's `git diff` check still fails the job. Use `--fail-on wider` to fail on widening only. For the site download, `pageslens diff HEAD .` does the same.

## Release notes

An approver promoting a release to Prod needs to know what it does to access. At release, compare the release's tag with the previous one, with Prod's settings, and add it to the release notes:

```yaml
# .github/workflows/release.yml (a step after the release is created)
permissions:
  contents: write # edit the release notes
steps:
  - uses: actions/checkout@v4
    with:
      fetch-depth: 0 # both tags
  - uses: actions/setup-node@v4
    with:
      node-version: 24
  - name: Access changes in this release
    env:
      GH_TOKEN: ${{ github.token }}
      TAG: ${{ github.ref_name }}
    run: |
      PREVIOUS=$(git describe --tags --abbrev=0 "$TAG^")
      gh release view "$TAG" --json body --jq .body > notes.md
      npx pageslens@0 diff "$PREVIOUS" "$TAG" --site solutions/Portal \
        --settings deployment-settings/prod.json --format markdown >> notes.md
      gh release edit "$TAG" --notes-file notes.md
```

- Compare the solution (`--site solutions/Portal`): it's what the release installs. `--site .` compares the site download instead.
- With `--settings`, the file is read at each tag, so a release that only changes `deployment-settings/prod.json` shows what that does to access.
- The first release has no previous tag, so `git describe` fails: skip the step until there's one.
- The comparison is between the two tags, not with Prod itself. pageslens doesn't read an environment, so an edit made by hand in Prod doesn't show here.

## Before a release, locally

The same checks a maintainer can run before tagging:

```bash
npx pageslens lint . --settings deployment-settings/prod.json
npx pageslens test . --settings deployment-settings/prod.json
npx pageslens align . solutions/Portal --settings deployment-settings/prod.json
npx pageslens diff v1.3.0 HEAD --site solutions/Portal --settings deployment-settings/prod.json
```
