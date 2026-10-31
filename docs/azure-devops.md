# Azure Pipelines

How to run pageslens in Azure Pipelines for a repository in Azure Repos, on Azure DevOps Services. There's no pageslens task to install: the pipeline runs the CLI in script steps, and does what the [GitHub Action](ci.md#github-action) does: `lint`, `test`, `align` and `diff`, the access changes on the run's summary and as one pull request comment, and optionally SARIF for GitHub Advanced Security for Azure DevOps.

The examples use the layout in [alm.md](alm.md): the site at the repository root (`.powerpages-site/`), the solution in `solutions/Portal`, and each stage's deployment settings in `deployment-settings/<stage>.json`. Change the paths to yours, and drop `--settings` if you don't use deployment settings files.

## Set up once

1. **Pull request runs.** For Azure Repos, a YAML `pr:` trigger is ignored. Add a **build validation** branch policy to the target branch (Repos › Branches › the branch's **Branch policies**), with this pipeline, set to automatic and required.
2. **Permission to comment.** The comment step posts with the pipeline's own token. Give the pipeline's build service identity **Contribute to pull requests** on the repository (Project settings › Repositories › your repository › Security). The identity is `<project> Build Service (<organization>)` when job authorization scope is limited to the project, which is the recommended setting, and `Project Collection Build Service (<organization>)` otherwise. Without it, the comment step fails with a 403 and everything else still runs.
3. **Advanced Security** (optional). To see findings and failed policy statements as code scanning alerts, Advanced Security must be enabled for the repository. Then set the pipeline's `advancedSecurity` parameter to `true`.

## The pipeline

```yaml
# azure-pipelines.yml
trigger:
  branches:
    include: [main]

parameters:
  - name: advancedSecurity
    displayName: Upload SARIF to Advanced Security
    type: boolean
    default: false

variables:
  pageslensVersion: 0.11.0 # an exact version, so every run checks the same way
  settings: deployment-settings/prod.json

pool:
  vmImage: ubuntu-latest

steps:
  - checkout: self
    fetchDepth: 0 # the merge base needs the history of both branches

  - task: UseNode@1
    inputs:
      version: 24.x

  - script: npm install --global "pageslens@$(pageslensVersion)"
    displayName: Install pageslens

  - script: pageslens lint . --settings "$(settings)"
    displayName: Lint

  - script: pageslens test . --settings "$(settings)"
    displayName: Policy tests
    condition: succeededOrFailed()

  - script: pageslens align . solutions/Portal --settings "$(settings)"
    displayName: Download and solution
    condition: succeededOrFailed()

  - script: |
      set -e
      target="${SYSTEM_PULLREQUEST_TARGETBRANCH#refs/heads/}"
      out="$(Agent.TempDirectory)/pageslens"
      mkdir -p "$out"
      pageslens diff --merge-base "origin/$target" HEAD --settings "$(settings)" --format markdown > "$out/diff.md"
      pageslens diff --merge-base "origin/$target" HEAD --settings "$(settings)" --format json > "$out/diff.json"
      echo "##vso[task.uploadsummary]$out/diff.md"
    displayName: Access changes
    condition: and(succeededOrFailed(), eq(variables['Build.Reason'], 'PullRequest'))

  - pwsh: |
      $out = Join-Path $env:AGENT_TEMPDIRECTORY 'pageslens'
      $diff = Get-Content -Raw (Join-Path $out 'diff.md')
      $summary = (Get-Content -Raw (Join-Path $out 'diff.json') | ConvertFrom-Json).summary
      $marker = ($diff -split "`n")[0].Trim()
      $pr = "$($env:SYSTEM_COLLECTIONURI)$($env:SYSTEM_TEAMPROJECTID)/_apis/git/repositories/$($env:BUILD_REPOSITORY_ID)/pullRequests/$($env:SYSTEM_PULLREQUEST_PULLREQUESTID)"
      $headers = @{ Authorization = "Bearer $env:SYSTEM_ACCESSTOKEN" }
      $json = 'application/json; charset=utf-8'

      # The comment from an earlier run, found by the hidden marker on its first line
      $threads = (Invoke-RestMethod -Uri "$pr/threads?api-version=7.1" -Headers $headers).value
      $mine = $threads | Where-Object { $_.comments.Count -gt 0 -and "$($_.comments[0].content)".StartsWith($marker) } | Select-Object -First 1

      if ($mine) {
        $body = @{ content = $diff } | ConvertTo-Json
        Invoke-RestMethod -Method Patch -Uri "$pr/threads/$($mine.id)/comments/$($mine.comments[0].id)?api-version=7.1" -Headers $headers -ContentType $json -Body $body | Out-Null
        Write-Host 'Updated the access-changes comment.'
      } elseif ($summary.wider + $summary.narrower + $summary.neutral -gt 0) {
        # Posted as closed, so a "comment resolution" policy doesn't wait on it
        $body = @{ comments = @(@{ parentCommentId = 0; content = $diff; commentType = 'text' }); status = 'closed' } | ConvertTo-Json -Depth 4
        Invoke-RestMethod -Method Post -Uri "$pr/threads?api-version=7.1" -Headers $headers -ContentType $json -Body $body | Out-Null
        Write-Host 'Posted the access-changes comment.'
      } else {
        Write-Host 'No access changes and no earlier comment: nothing to post.'
      }
    displayName: Comment on the pull request
    condition: and(succeededOrFailed(), eq(variables['Build.Reason'], 'PullRequest'))
    env:
      SYSTEM_ACCESSTOKEN: $(System.AccessToken)

  - ${{ if parameters.advancedSecurity }}:
      - script: |
          out="$(Agent.TempDirectory)/pageslens-sarif"
          mkdir -p "$out"
          # The steps above already failed the run on findings; these only write the files
          pageslens lint . --settings "$(settings)" --format sarif > "$out/lint.sarif" || true
          pageslens test . --settings "$(settings)" --format sarif > "$out/test.sarif" || true
          pageslens align . solutions/Portal --settings "$(settings)" --format sarif > "$out/align.sarif" || true
        displayName: Write SARIF
        condition: succeededOrFailed()
      - task: AdvancedSecurity-Publish@1
        displayName: Publish to Advanced Security
        condition: succeededOrFailed()
        inputs:
          SarifsInputDirectory: $(Agent.TempDirectory)/pageslens-sarif
```

What it does:

- **On a pull request** (started by the branch policy): `lint`, `test` and `align` on the merged result, then `diff --merge-base` between the target branch and the pull request. The access changes go to the run's **Extensions** tab and into one pull request comment, which later runs edit. With no access changes, it doesn't add a comment; it edits an earlier one to say so.
- **On a push** to `main`: `lint`, `test` and `align` only, so the target branch's results are known too.
- **The run fails** when lint finds errors, a policy statement fails, or `align` finds errors. `condition: succeededOrFailed()` lets the later steps run anyway, so the summary and the comment are there either way. Add `--fail-on wider` to the `diff` line to fail on access widening too.
- **Exit code 2** means a step couldn't run: a path or settings file that isn't there, or no `pageslens.policy.yaml` for `test`. Remove the `test` step if you don't have a policy file.

## Each stage

Settings differ per stage, so check each stage with its own job. Comment from one stage only: two jobs would edit the same comment in turn.

```yaml
jobs:
  - job: pageslens
    strategy:
      matrix:
        test:
          stage: test
        prod:
          stage: prod
    variables:
      settings: deployment-settings/$(stage).json
    steps:
      # the steps above, with this condition on the comment step:
      # condition: and(succeededOrFailed(), eq(variables['Build.Reason'], 'PullRequest'), eq(variables['stage'], 'prod'))
```

## Without a pull request comment

Leave out the comment step and the permission in "Set up once": the access changes are still on each run's Extensions tab.
