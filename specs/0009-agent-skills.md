# 0009: Agent support: CLI first, one skill

**Status:** done. Parts 1 and 2 shipped in 0.10.0 (see "As built"); part 4 ran on 2026-10-27 (see "Comparison results"); part 3, the skill, was closed by decision 15. Draft 3.

pageslens gives facts: findings, failed requirements and access changes, the same every run. What it can't give is judgement: why a finding matters on this site, which fix fits, whether a wider grant in a pull request was meant. The original plan ([mvp-spec.md](research/mvp-spec.md), "Agent skills") puts that in three agent skills. This spec asks a narrower question first: **what does an agent need that the CLI doesn't already give it?** Whatever that is goes into the CLI and the README where it can, so every agent gets it with or without a plugin. One thin skill carries the rest, and ships only if a comparison shows it does better than the CLI alone.

It's the last piece of the M3 plan (the solution adapter and `align` shipped in 0.8.0 and 0.9.0).

## What we know

### The plan so far

From [mvp-spec.md](research/mvp-spec.md) and [alm-story.md](research/alm-story.md):

- **site-review**: run `lint --format json` and `test`, explain the findings in context, and propose fixes as edits to the YAML. Never patch live records.
- **pr-access-review**: run `diff` between the pull request and the base branch and write the review. [0003](0003-diff.md) says this skill reads the diff JSON's closed list of change kinds.
- **site-docs**: run `pageslens docs`, then write what the tool can't infer (what each role is for, the business purpose of each page), marked as written by the agent.
- They ship "in a plugin marketplace repo or a `plugin/` folder in the tool's repo".
- The research also names `capture` and `fix-alignment` (for `align`). Both run `pac` against an environment, so they aren't offline.

### What the CLI already gives an agent

pageslens was built to be read by scripts and agents. Every `--format json` object has `version: 1`, which changes only when a field is removed or changes meaning (README, [docs/diff.md](../docs/diff.md)). The output is deterministic, and `--help` lists every command and flag.

| Command | Top-level fields                                                     | What an agent uses                                                                                       |
| ------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `lint`  | `version`, `site`, `summary`, `ignored`, `findings`, `unusedIgnores` | Each finding's `ruleId`, `severity`, `message`, `file` (relative to the site folder), `recordId`, `docs` |
| `test`  | `version`, `site`, `policy`, `summary`, `results`                    | Failed statements and the grants or settings that break them, with their files                           |
| `diff`  | `version`, `base`, `head`, `summary`, `changes`                      | Each change's `class`, `kind`, `message`, `role`, `table`, `lint`, and `sources` with `side` and `file`  |
| `align` | as [docs/align.md](../docs/align.md)                                 | Findings with the file on each side                                                                      |
| `docs`  | no JSON: writes Markdown pages                                       | `index.md`, `access-matrix.md`, `webapi.md`, `pages.md`                                                  |

An agent told "run `npx pageslens lint --format json` and fix what it finds" can already do most of site-review, and with `diff` and git most of pr-access-review. Gaps it hits:

- A finding's `docs` is a GitHub URL. The rule pages (`rules/*.md`) aren't in the npm package (`files` is `dist` and the config schema), so an agent without web access can't read why a rule matters or how to fix it.
- Values backed by an environment variable are `unknown` in a download. The JSON says so, but nothing tells the agent not to guess.
- Nothing tells an agent the working rules: don't argue with the CLI's classification, check a fix by running `lint` again, don't edit the solution folder, find records by GUID.
- `docs` has no JSON, and nothing says where an agent's own prose about the site should go.

### What a skill adds, and what it costs

A skill adds three things over the CLI:

- **Discovery.** The agent knows pageslens exists and when to reach for it. For people who already use Microsoft's `power-pages` plugin, a plugin beside it is how they'd find pageslens.
- **Working rules.** The list above. They're short, and fit in a README section as well as in a skill.
- **Conventions.** Where the narrative docs go and how they're anchored to records. Also short, and also fit in the README.

Only discovery needs a skill. Its costs: a plugin to keep in step with each release, two hosts' manifests and front matter, and output that can't be tested in CI. Three skills would repeat the same preamble (finding the site, running pageslens, the version check, the working rules) three times.

### How Microsoft packages its Power Pages skills

Microsoft's `power-platform-skills` repo (plugin `power-pages`, version 2.7.2, checked 2026-10-27) is the closest example and the one most pageslens users will have installed:

- One repo is both the marketplace and the plugin: `/plugin marketplace add microsoft/power-platform-skills`, then install `power-pages`.
- It ships two identical manifests, `.claude-plugin/plugin.json` (Claude Code) and `.plugin/plugin.json`, and its README shows GitHub Copilot CLI loading the same folder (`copilot --plugin-dir ...`). Scripts read `CLAUDE_PLUGIN_ROOT` or `PLUGIN_ROOT`, whichever the host sets.
- Each skill is a `skills/<name>/SKILL.md` with YAML front matter (`name`, `description`, and Claude Code extras such as `allowed-tools`, `argument-hint`, `model`) and a numbered workflow in Markdown.
- Its skills work on the local `.powerpages-site/` folder too, but most also call Dataverse and `pac`. `audit-permissions` is the nearest to site-review: it reads the site and queries Dataverse for relationships, then writes an HTML report.

`SKILL.md` with `name` and `description` is the Agent Skills format, which Claude Code, GitHub Copilot and other agents read ([agentskills.io](https://agentskills.io)). To check before building the skill: which front matter fields each host honours, and how each host installs from a repo.

## Design rules

- **The CLI decides, the agent explains.** Whether something is a finding, whether a change is wider, whether a statement passes: that's the JSON. The agent never overrules it ("this isn't really wider"); it can say why a change may be intended and what to check.
- **CLI first.** Anything an agent needs that can be a command, an output field or a README section goes there, not into the skill. The skill holds only what can't: discovery, and pointing at the rest.
- **Facts from the JSON, not the text output.** The text and Markdown formats can change wording in any release; the JSON can't without a version bump.
- **Offline, read-mostly.** An agent following pageslens's guidance reads the site, the git history and the CLI output. The only writes are edits to site files in the working tree, on the user's yes, and the narrative file. Nothing is uploaded, posted, committed or pushed.
- **GUIDs are the identity** (AGENTS.md). Records are found by `recordId`, not by file name, and no record's own id is changed. Pointing a record at another one is a fix, said with what it does to access (changed after the comparison).
- **Every fix is checked by the CLI.** After an edit, `lint` (and `test`) run again. A fix that adds an error or a warning is undone, and `diff` shows what it does to access (changed after the comparison).
- **Plain English in short sentences**, as the rest of the docs.

## Design

Three parts, built in this order. Part 1 is useful on its own; part 3 waits for the comparison in part 4.

### 1. `pageslens explain`

```
pageslens explain [rule]
```

- `explain <rule>` prints the rule's page (`rules/<id>.md`) as Markdown: why it matters and how to fix it. The pages are bundled into `dist` at build, so the page always matches the version that gave the finding, and it works offline and through `npx`, where the package's folder isn't known.
- `explain` alone lists every rule with its default severity and the first sentence of its page, sorted by id.
- An unknown rule is exit 2, with the closest rule id when there is one.
- Lint rules only in this version. `align`'s checks are documented together in [docs/align.md](../docs/align.md) (open question 3).
- JSON output doesn't change: a finding's `docs` stays the URL. The text output of `lint` ends with one line pointing at `explain` when there are findings (open question 4).

It follows "Changing a lint rule" in AGENTS.md: a test checks that every registered rule has a page `explain` can print.

### 2. "Using pageslens with an agent" in the README

A README section that any agent can be pointed at, and that people can paste into their own `AGENTS.md` or `CLAUDE.md`:

- **Running it.** `npx pageslens` when the project has it in its dependencies (the version CI runs), else `npx -y pageslens@<x.y.z>`. Read `--format json` and check `version`.
- **The working rules** from "Design rules" above, as a short list, plus: a value marked `unknown` comes from an environment variable and can't be known offline, so say so instead of guessing.
- **Three recipes**, a few lines each:
  - _Review a site_: `lint` and `test` as JSON (and `align` when a solution folder is given), group findings by rule, `explain` each rule, propose fixes one rule at a time, apply on a yes per rule, run `lint` again. Never edit the solution folder; `pageslens.config.yaml` only for an ignore with a `reason`.
  - _Review a pull request's access changes_: `diff <base> HEAD --site <path> --merge-base --format json`; for each wider change, open the `sources` on both sides and the commits that touched them, and say what a reviewer should check. Narrower and neutral changes get one line each. Write the review in the chat; don't post it. `--site` needs 0.10.0 or later.
  - _Write narrative docs_: run `docs`, then write `about.md` next to the generated pages. It starts with a line saying an agent wrote it and a person should check it, and each entry names its record and GUID in an HTML comment, so a re-run finds new, renamed and removed records and keeps what a person wrote. The generated pages aren't touched.

The section is the single place these rules are written. The skill points at it instead of copying it (open question 2).

### 3. One skill, `pageslens`

Not built: closed by decision 15 after the comparison. Kept as the design to start from if a plugin is wanted later. A `plugin/` folder in this repo, and the repo is its own marketplace:

```
.claude-plugin/marketplace.json      lists one plugin, source ./plugin
plugin/
  .claude-plugin/plugin.json         name pageslens, version = package.json
  .plugin/plugin.json                the same, for GitHub Copilot
  skills/pageslens/SKILL.md
```

- **One skill**, named `pageslens` (open question 1). Its `description` is what makes an agent reach for it: reviewing a Power Pages site's access configuration, its table permissions, Web API settings or web roles; reviewing a pull request that changes them; documenting who can do what. Offline, from the files in git.
- **Its body** says how to run pageslens (the fallback version is the plugin's own, written in at release) and holds the working rules and the three recipes, in the same words as the README section (open question 2). Front matter is `name` and `description` only, plus fields the other host ignores.
- Install in Claude Code: `/plugin marketplace add OOlashyn/pageslens`, then `/plugin install pageslens@pageslens`. `plugin/` isn't in the npm package.
- The plugin manifests carry the same version as `package.json`; a test fails when they differ. The marketplace installs from `main`, and the skill's fallback is its own version, which changes only on a release.

### 4. The comparison

Before part 3 is built, run the same tasks twice on the fixtures with one agent: once with only the README section (part 2) in the project's `AGENTS.md`, and once with nothing but a request that names pageslens. Then, when part 3 is built, once with the skill installed and nothing else.

| Task                                           | Fixture                                          | What's checked                                                                                 |
| ---------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| "Review this site's access and fix the errors" | `broken`, `ecoflux`                              | every error explained; fixes leave `lint` clean of them and add none; no edit outside the site |
| "Review the access changes on this branch"     | a `test/fixtures/diff/` case in a temporary repo | every wider change named; no change reclassified; nothing posted                               |
| "Document what each web role is for"           | `registration`                                   | `about.md` written with GUID anchors; generated pages untouched; a re-run keeps a hand edit    |
| A site with a variable-backed setting          | `registration` (one `source: 1` setting)         | the value is called unknown, not guessed                                                       |

The results go in this spec. The skill ships when, with the README section already in place, it still does visibly better on a check (most likely: being used at all, unprompted). If the README section alone does as well, the plugin isn't built and the README is pageslens's agent support. A regression found later becomes an eval case.

## Comparison results (2026-10-27)

Part 4, run with pageslens 0.10.0 from npm. Each task ran twice, each time in a fresh agent (Claude Opus 5.5 as a Claude Code subagent) in its own git copy of the fixture: once with only the request, and once with the README section as the project's `AGENTS.md`. The `#` comments that label the fixtures' expected results were removed first. The agents couldn't ask questions, so "fix the errors" counted as the user's yes. Every request named pageslens. One run per cell, so this shows behaviour, not rates.

| Task                                                            | Without guidance                                                                                                                                                                                                                                   | With the README section                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Review and fix `broken` (8 errors)                              | Every error explained. Fixed 5 (8 to 3 errors), edits in the site only. One fix re-parented a permission and widened access; it said so, and checked its edits with `diff` on its own. Clearing a role's flag left an expected `role-unused` info. | Every error explained. Fixed 1 (8 to 7), the secret. Undid the role-flag fix because it added the info finding ("undo a fix that adds a finding"), and wouldn't re-parent a permission ("don't change a GUID that links records"). Both rules were read literally; the rest became proposals. |
| Review and fix `ecoflux` (4 errors)                             | Explained; no edits: the fix needs relationship names the download doesn't have, and it said changing the scope would widen access.                                                                                                                | The same, with the record GUIDs and a proposal per table.                                                                                                                                                                                                                                     |
| Review the `grants` branch (8 wider)                            | All 8 wider changes named with what to check; nothing reclassified (role re-creations kept as neutral, with the deployment risk explained); nothing posted.                                                                                        | The same. Used `--format json`.                                                                                                                                                                                                                                                               |
| Document the roles of `registration`, then re-run after changes | `about.md` with the agent line and a GUID comment per role; generated pages untouched. It found the recipe in the README inside the npm package. The re-run kept the hand note word for word and picked up the renamed and the new role.           | The same, first run and re-run.                                                                                                                                                                                                                                                               |
| Is `CardsPerPage` 18? (variable-backed)                         | Unknown, not 18: it wrote a one-line policy, and `test` said the value comes from an environment variable a download doesn't include.                                                                                                              | The same, and it cited the working rule.                                                                                                                                                                                                                                                      |

What it shows:

- **The CLI and the package README already carry what an agent needs.** Without `AGENTS.md`, the agents used `--site` and `--merge-base`, didn't reclassify, said unknown values were unknown, and wrote `about.md` the README's way: `npx` puts the README next to the package, and the CLI's messages say enough. On no check did the README section in `AGENTS.md` do better.
- **Two working rules made the guided run worse**, both read literally. "Undo a fix that adds a finding" undid a correct fix whose expected result is an info finding, and "don't change a GUID that links records" ruled out re-parenting, the usual fix for `parent-chain-broken`. Both are reworded in the README: undo a fix that adds an error or a warning; pointing a record at another one is a fix, said with what it does to access.
- **The unguided run widened access** to fix an error, without asking. It said so, but the README didn't cover it. The review recipe now asks for a separate yes for a fix that `diff` shows as wider, and the rules say to check edits with `diff HEAD <site>`, as that run did on its own.
- **Not tested: discovery.** Every request named pageslens. Whether an agent reaches for it unprompted, the one thing a skill adds, depends on the project's `AGENTS.md` mentioning it, or a skill being installed (question 15).

By part 4's own rule, the README section does as well as anything a skill would add on these checks, so the skill isn't built unless question 15 says otherwise.

## How it fits

- **The GitHub Action** stays the CI path: deterministic, no agent. The pull request recipe is for a reviewer at their desk, and reads the same `diff` JSON.
- **Microsoft's skills** do the environment side: create, deploy, audit against Dataverse. pageslens checks and explains what's in git. The README can say to use both.
- **`explain`** is useful to people too: the rule pages from the terminal, for the version installed.

## As built

Parts 1 and 2, shipped in 0.10.0. Interpretations made while building:

- **The rule pages are read from the package, not bundled into `dist`.** `rules/` is added to the package's `files`, and `src/explain.ts` reads `../rules/<id>.md` from its own URL, which is the package root both as source and as `dist/bin.mjs`. It gives what the design asked for (offline, through `npx`, the page of the version that gave the finding) without a text loader in the build. A test checks that every rule's page prints and starts with `# <id>`, and that `rules` stays in `files`.
- **`explain` alone lists each rule's `description`** (the one line SARIF also uses), not the first sentence of its page. They say the same thing, and the description is already one line.
- An unknown rule's error suggests the closest id within two edits, as unknown roles and pages in a policy do, and says to run `explain` for the list.
- The lint text output's last line is "Run pageslens explain <rule> for why it matters and how to fix it.", only when there are findings.
- The README's quick start still had `diff origin/main HEAD path/to/site`; it now uses `--site`.

## Decisions (Oleksandr, 2026-10-27)

Draft 2's recommendations were accepted, then the scope was reworked the same day to CLI first and one skill. What stands:

1. ~~Three skills.~~ Replaced: `explain` and the README section first, one `pageslens` skill if the comparison shows it helps. `fix-alignment` still waits for `align --fix`.
2. Claude Code and GitHub Copilot, from the same `SKILL.md` with both manifests. Each host's front matter and install steps are checked before the plugin's README is written; if Copilot's differ, Claude Code ships first.
3. The project's pageslens when it has one, else `pageslens@<plugin version>` (or the release the README names).
4. A `pageslens explain <rule>` command prints the rule page bundled into the package.
5. The review recipe runs `align` only when a solution folder is given.
6. Fixes are applied on a yes per rule.
7. The pull request review is written in the chat only.
8. The narrative docs are one separate file, `about.md`, next to the generated pages.
9. Hand checks on the fixtures (now the comparison in part 4); an eval suite after a regression.
10. Listed in this repo's marketplace first; a public directory after one release that people have used.

Draft 3's questions, answered the same day (every recommendation accepted):

11. The skill is named `pageslens`.
12. The skill's body is a copy of the README section, made at release; a test checks they match.
13. `explain` covers lint rules only for now.
14. `lint`'s text output ends with one line pointing at `explain` when there are findings. JSON and SARIF don't change.

## Open questions for Oleksandr (answered, see Decisions 11 to 14)

1. **The skill's name.** `pageslens`; or a task name such as `power-pages-review`. Recommended: `pageslens`. It's one skill for the tool, it shows as `/pageslens:pageslens` in Claude Code, and the `description`, not the name, decides when an agent uses it.
2. **The skill's body.** Copy the README section into `SKILL.md` at release (a test checks they match); or keep only a pointer to the README on GitHub. Recommended: copy it, checked by a test. A skill has to work offline and without the repo checked out, and a pointer to `main` can be ahead of the version the skill runs.
3. **`explain` for `align` checks.** Lint rules only; or `align`'s checks too, from sections of `docs/align.md`. Recommended: lint rules only for now. `align` findings already say what's missing and where, and its checks share one page; add them if agents are seen to need it.
4. **The pointer at the end of `lint`'s text output.** One line, "Run `pageslens explain <rule>` for why it matters and how to fix it.", when there are findings; or nothing. Recommended: the line, in text output only. It's how a person, or an agent reading text output, finds `explain`. It changes the text snapshots, not the JSON or SARIF.

## Decision after the comparison (Oleksandr, 2026-10-27)

15. Part 3 is closed: no skill or plugin for now. The README's agent section gets one line to paste into `AGENTS.md`, so agents know pageslens is there. A plugin is revisited if people ask for one.

## Open question after the comparison (answered, see decision 15)

15. **Build the skill for discovery, or close part 3?** The comparison found nothing the skill would add once an agent knows to use pageslens. What's left is getting there: a project's `AGENTS.md` that mentions pageslens does it for that project; an installed skill does it for every project of the person who installed it, at the cost of a plugin to keep in step with each release. Recommended: close part 3 for now. Add one line to the README's agent section saying what to paste into `AGENTS.md` so agents know pageslens is there, and revisit a plugin if people ask for one.

## Sources

- [mvp-spec.md](research/mvp-spec.md), "Agent skills (milestone 3)", and [alm-story.md](research/alm-story.md), "Where agent skills help".
- [0003-diff.md](0003-diff.md): the change kinds a pull request review reads, and `--site` (as built, 0.10.0). [0004-github-action.md](0004-github-action.md): exact-version pinning.
- Microsoft's [power-platform-skills](https://github.com/microsoft/power-platform-skills) repo, plugin `power-pages` 2.7.2: manifests, `SKILL.md` front matter, the `audit-permissions` workflow, Copilot CLI install (read 2026-10-27).
- [Agent Skills](https://agentskills.io): the `SKILL.md` format.
- [Claude Code plugins](https://code.claude.com/docs/en/plugins) and [plugin marketplaces](https://code.claude.com/docs/en/plugin-marketplaces).
