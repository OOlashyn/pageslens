# Azure DevOps: what a pageslens task would take

Read 2026-10-31, from Microsoft Learn. The question: what would it take to give Azure Pipelines what the GitHub Action ([0004](../0004-github-action.md)) gives GitHub, one step that checks the site, publishes the results and comments on the pull request? The ALM white paper ([alm-white-paper.md](alm-white-paper.md)) treats Azure DevOps as a full alternative to GitHub, and the roadmap has Azure DevOps as a candidate (a documented script step) and as "Later" (a template or Marketplace task).

No code here. This note maps each part of the Action to Azure DevOps, compares three ways to ship it, and ends with open questions.

## What the Action does, and where each part goes

| The Action today                             | In Azure Pipelines                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runs on `pull_request` and on push to `main` | For Azure Repos, a YAML `pr:` trigger is ignored: pull request runs come from a **build validation branch policy** on the target branch (Repos › Branches › Branch policies). Pushes use `trigger:` as usual. For a GitHub repository built by Azure Pipelines, `pr:` works.                                                                                                    |
| `fetch-depth: 0` for the merge base          | Same need. New pipelines since September 2022 may default to **shallow fetch, depth 1**, and to not syncing tags. The checkout step needs `fetchDepth: 0` (and `fetchTags: true` for the release recipe).                                                                                                                                                                       |
| The base ref from the event                  | `System.PullRequest.TargetBranch` (`refs/heads/main` for Azure Repos), `System.PullRequest.SourceCommitId`, `System.PullRequest.PullRequestId`, `System.PullRequest.IsFork`. Only set when a branch policy started the run (`Build.Reason` is `PullRequest`). The base would be `origin/main` from `refs/heads/main`.                                                           |
| Job summary (`$GITHUB_STEP_SUMMARY`)         | `##vso[task.uploadsummary]<absolute path to a .md file>`. It shows on the run's **Extensions** tab, and its Markdown renders differently from the wiki's. The `<details>` folding our Markdown uses needs checking there.                                                                                                                                                       |
| SARIF to code scanning (`upload-sarif`)      | **GitHub Advanced Security for Azure DevOps**: `AdvancedSecurity-Publish@1` uploads SARIF 2.1 from other tools to the Code scanning alerts (`SarifsInputDirectory`, `Category`). It's an add-on that has to be enabled for the repository, and billed (from memory, to verify). Without it, SARIF is only an artifact. Our categories (`pageslens/lint/`, …) map to `Category`. |
| The sticky pull request comment              | The Pull Request **Threads** REST API: create a thread with one comment, later update that comment (up to 150,000 characters; GitHub's cap is 65,536). Find our thread by the hidden marker, as today. Authenticate with `System.AccessToken`, mapped into the step's environment explicitly.                                                                                   |
| `pull-requests: write`                       | The build service identity (`<Project> Build Service (<org>)`, or the collection one when job scope isn't limited) needs **Contribute to pull requests** on the repository. It isn't granted by default for threads: a 403 (`TF401027`) is the usual first error. This is a one-time setting the user makes, which the docs must say.                                           |
| Fails the job after all steps                | A task sets its result (failed, succeeded with issues); the same "run everything, fail at the end" shape works.                                                                                                                                                                                                                                                                 |
| Outputs (`wider`, `lint-errors`, …)          | `##vso[task.setvariable variable=wider;isOutput=true]3` (a task can restrict which variables it sets in `task.json` `restrictions`).                                                                                                                                                                                                                                            |
| Fork pull requests get a read-only token     | Azure Repos forks are rare; `System.PullRequest.IsFork` tells. For GitHub repositories on Azure Pipelines, fork builds can be gated on a team member's comment (sprint 275 made this per source). Comment on the GitHub pull request? Out of scope: that's the Action's job.                                                                                                    |
| (none)                                       | **Pull request status** (optional): a pass/fail status with a link, which a status branch policy can require. The build validation policy already blocks on a failed run, so this only adds a named "pageslens" check. Same permission as comments.                                                                                                                             |
| (none)                                       | **Tests tab**: `PublishTestResults@2` reads JUnit XML. Policy statements as test cases would show pass and fail there, with history. Needs a `--format junit` for `test` (roadmap candidate).                                                                                                                                                                                   |

## Three ways to ship it

### A. Documented script steps

`npx pageslens@0 …` in script steps, the Markdown into the summary with `##vso[task.uploadsummary]`, SARIF to Advanced Security where it's enabled. A page next to [docs/alm.md](../../docs/alm.md).

- Cost: a page. Works on Azure DevOps Services and Server alike.
- Gets: lint, test, align and diff in the run, failing the run, the summary, Advanced Security alerts.
- Doesn't get: the pull request comment, unless the page includes a script that calls the Threads API. That's the part users would copy and get wrong (the marker, update versus create, the permission).

### B. A YAML template

A `templates/pageslens.yml` in this repository, used through `resources.repositories` and `- template: pageslens.yml@pageslens`.

- A template is YAML only: it can't carry the comment code. The code would have to come from somewhere at run time, such as a second checkout of this repository, or the npm package (a subcommand such as `pageslens azure-devops comment`, or a second bin).
- A template from a GitHub repository needs a GitHub service connection in the user's project, even for a public repository (to verify). Users who can't add service connections can't use it.
- Version pinning by `ref:` (a tag or commit) is close to how the Action pins.

### C. A Marketplace extension with a task

A `PagesLens@0` task, published in an extension on the Visual Studio Marketplace. This is the parity option: one step, inputs like the Action's, discoverable in the task picker.

What it takes:

- **A publisher** on the Marketplace, verified to make the extension public. The listing needs an `overview.md`, an icon (128×128 or larger), and no brand names in the extension's name. Microsoft scans each upload, and may ask for a demo before a public listing.
- **`vss-extension.json`** (the extension) and **`task.json`** (the task: a GUID `id`, `name`, `inputs`, `instanceNameFormat`, `execution`, and `restrictions` for logging commands and settable variables). Both versions must be bumped for a change to reach users: agents cache tasks by version.
- **A Node.js handler.** `Node20_1` is the documented one, and Node.js 20 support ends in April 2026, with removal in April 2027. The agent now bundles Node.js 24, and task authors are told to move to it. Node 6, 10 and 16 are removed on November 24, 2026. The exact `task.json` key for Node.js 24 isn't in the docs read here (to verify). Azure DevOps Server agents may lag: older servers may need a `Node10` fallback entry.
- **Node.js for the CLI.** pageslens needs `^22.23.4 || ^24.22.1 || >=26.12.1`. The agent's bundled Node.js 24 runs the task, but it may lag those releases, as the GitHub runner's does (0004 chose a composite action for that reason). The task could run the CLI with the agent's Node.js, or require `UseNode@1` before it, or install its own. That decides whether the task is self-contained.
- **The task's code.** The Action's rule (Node built-ins only, erasable TypeScript, no build) would make the task code small, but a task is shipped as files in the `.vsix`, so a build step is fine there. The Microsoft task library (`azure-pipelines-task-lib`) is optional: inputs come as `INPUT_*` environment variables and logging commands are text on stdout, as in the Action.
- **Packaging and publishing.** `tfx extension create` and `tfx extension publish`, with a Marketplace PAT or a Microsoft Entra token. Trusted Publishing (OIDC) is documented for GitHub Actions, but its instructions name `vsce` and `VsixPublisher`, not `tfx` (to verify). Microsoft recommends two extensions, a private `-dev` one for testing and the public one.
- **Updates reach everyone.** An updated extension is installed in every organization that has it. Users pin only the task's major version (`PagesLens@0`), not an exact pageslens version, which is the opposite of the Action's "the tag runs exactly that version". The task could keep the exact pin by installing the pageslens version it was built with.
- **Trust.** Organizations review an extension's scopes before installing, and some don't allow Marketplace extensions at all. A task that reads only the files and posts one comment with the job's own token asks for little, but that has to be clear on the listing.

## Recommendation

In this order:

1. **Option A first**, as a docs page (`docs/azure-devops.md`): the branch policy, `fetchDepth: 0`, the scripts, the summary, Advanced Security when it's there, and the permission a comment would need. Cheap, and it shows whether anyone uses pageslens on Azure DevOps before we build for it.
2. **Make the comment reusable**, whatever comes next: the Markdown, the marker and "update or create" are the hard part. If it lives in the npm package (for example `pageslens comment --azure-devops`), options A, B and C all call it, and the Action's own comment step stays as it is.
3. **Option C as spec 0011** once there's an Azure DevOps organization to test in and a Marketplace publisher. Option B isn't worth it alone: the service connection requirement removes its one advantage, no install.
4. **`--format junit` for `test`** is worth doing with any of them: it's what Azure DevOps users look at.

## Open questions for Oleksandr

1. **Which repositories?** Azure Repos only, or GitHub repositories built by Azure Pipelines too? The second already has the Action, and its comment would go to GitHub.
2. **Azure DevOps Server?** Supporting on-premises servers means older agents and Node.js handlers, and extensions installed by upload. Recommended: Services only at first.
3. **A Marketplace publisher**: under which name, and is a verified, public listing wanted, or a private extension shared with chosen organizations first?
4. **Version pinning** for a task: exact (the task installs the pageslens version it was built with, as the Action does) or the latest `0.x` (`npx pageslens@0`)? Recommended: exact, as for the Action.
5. **Where the code lives**: in this repository (`azure-devops/` next to `action/`, released with the same version), or a separate repository? Recommended: this repository, one version for everything.
6. **Advanced Security**: assume most users don't have it, and make SARIF optional (on when the task finds it enabled, or by an input)?
7. **A test organization**: is there one we can use, with a project that has a Power Pages repository?

## Decisions

Oleksandr answered the questions above on 2026-10-31:

1. **Azure Repos first.** GitHub repositories built by Azure Pipelines come much later, if at all.
2. **Azure DevOps Services only.** No Azure DevOps Server for now.
3. **No Marketplace extension for now.** Option C is postponed.
4. **Exact version pinning**, as for the Action: the docs pin `pageslens@<x.y.z>`.
5. **Same repository**, when there's code to ship.
6. **SARIF is optional**: assume most users don't have Advanced Security.
7. **Option A, tested in a test organization.** The scripts in [docs/azure-devops.md](../../docs/azure-devops.md) are checked there before anything else is built.

So the next step is option A: the docs page, with the pull request comment as a PowerShell step that calls the Threads API. Moving the comment into the npm package (recommendation 2) waits until the scripts have run in the test organization.

## To verify

In the test organization, with [docs/azure-devops.md](../../docs/azure-devops.md):

- That `origin/<target branch>` exists after a pull request run's checkout with `fetchDepth: 0`, so `diff --merge-base` finds the merge base.
- The comment step: the Threads API calls with `System.AccessToken`, the hidden marker staying hidden in a pull request comment, a thread posted as `closed` not blocking a "comment resolution" policy, and the edit on a second run.
- `AdvancedSecurity-Publish@1` with our SARIF files and their categories.

From the docs:

- The `task.json` execution key for Node.js 24, and the Node.js 24 version the hosted agents bundle.
- That a template from a public GitHub repository needs a GitHub service connection.
- Trusted Publishing (OIDC) with `tfx extension publish` from GitHub Actions.
- How the Extensions tab renders our Markdown, `<details>` included.
- That Advanced Security for Azure DevOps is billed per committer, and whether `AdvancedSecurity-Publish@1` works on a repository without it (it shouldn't).
- That the build service needs **Contribute to pull requests** granted for threads and statuses, on both the project and the collection identity.

## Sources (Microsoft Learn)

- Add a custom pipelines task extension; Package and publish extensions; Extension manifest reference; Publish from the command line; Upload pipeline tasks
- Node.js runners in Azure Pipelines Agent
- Logging commands (`task.uploadsummary`, `task.setvariable`)
- Use predefined variables (`System.PullRequest.*`, `System.AccessToken`, `Build.Reason`)
- `steps.checkout` (shallow fetch, sync tags); Build Azure Repos Git repositories (build validation)
- Access repositories, artifacts, and other resources (job access tokens, scoped build identities)
- Pull request status; Available pull request status checks; Git REST client (`createThread`, `updateComment`)
- Integrate non-Microsoft scanning tools; `AdvancedSecurity-Publish@1`
- `PublishTestResults@2`
- YAML templates (templates in other repositories)
- Azure DevOps release notes, sprints 245 (third-party SARIF) and 275 (fork comment requirement)
