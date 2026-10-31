# Using pageslens with an agent

pageslens gives the facts; a coding agent can explain them and propose fixes. Point your agent at this page, or paste it into your `AGENTS.md` or `CLAUDE.md`. So that an agent knows pageslens is there at all, one line in `AGENTS.md` is enough:

```markdown
The Power Pages site is in `site/`. Check it with pageslens (`npx pageslens`): see https://pageslens.olashyn.dev/guides/agents/
```

## Running pageslens

- Run `npx pageslens` when the project has `pageslens` in its dependencies, so the agent runs the version CI runs. Otherwise run `npx -y pageslens@<version>`, with the version CI uses.
- Read `--format json` (`lint`, `test`, `diff`, `align`), not the text output, and check that `version` is `1`.
- `pageslens explain <rule>` prints why a lint rule matters and how to fix it. `pageslens explain` lists the rules.

## Working rules

- pageslens decides. Whether something is a finding, whether a change is wider, whether a statement passes: that's in its output, so don't reclassify it. Say why a change may be intended and what a reviewer should check.
- Work offline, from the files in git. Don't connect to Dataverse, run `pac`, upload, post, commit or push.
- Find records by GUID (`recordId`), not by file name. Don't change a record's own id. Pointing a record at another one (a permission's parent, its web roles) is a fix like any other: say what it does to access.
- A value marked `unknown` comes from an environment variable, which a download doesn't have. Say it can't be known offline; don't guess. If the repository has deployment settings files, run again with `--settings` for the stage in question.
- Check every fix: run `lint` (and `test`, with a policy file) again, and `diff HEAD <site>` to see what the edits do to access. Undo a fix that adds an error or a warning. A fix can leave an info finding behind as its expected result (a role nothing uses any more): say so.

## Review a site

1. Run `lint --format json`, `test --format json` when there's a `pageslens.policy.yaml`, and `align <site> <solution> --format json` when you're given a solution folder.
2. Group the findings by rule, errors first. Run `explain` for each rule and open the files the findings point at.
3. Explain each group in the site's terms: which role, which table, who could do what.
4. Propose fixes one rule at a time, as edits to the site's YAML. Where the fix is a choice (narrow the access, or keep it with an `ignore` entry and a `reason` in `pageslens.config.yaml`), offer both.
5. Apply a rule's fixes when the user says yes. A fix that `diff` shows as wider needs its own yes, even when the user asked for every error to be fixed. Then run `lint` again and show what's left. Don't edit the solution folder: fix the site in dev, then take both snapshots again.

## Review a pull request's access changes

1. Run `diff <base> HEAD --site <path> --merge-base --format json`, with the pull request's base branch as `<base>`.
2. If there are no changes, say so and stop.
3. For each wider change, open its `sources` on both sides (`git show <commit>:<file>`) and the commits that touched them. Say what the author likely meant and what a reviewer should check, and say when the change is also a lint finding (`lint`).
4. Give narrower and neutral changes one line each.
5. Write the review in the chat. Don't post it: the GitHub Action already posts the access changes.

## Write narrative docs

1. Run `docs <path> --out <dir>`.
2. Read the generated pages, the site's pages and templates, and the git log, to work out what each web role, table and page is for.
3. Write `about.md` in `<dir>`. Start it with a line saying an agent wrote it and a person should check it. Give each record's kind, GUID and name in an HTML comment (`<!-- webrole <guid> Asset Manager -->`), so a later run finds new, renamed and removed records and keeps what a person wrote.
4. Don't edit the generated pages: `docs` rewrites them on every run.
