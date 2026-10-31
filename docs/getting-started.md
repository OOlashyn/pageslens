# Getting started

pageslens reads a Power Pages site from the files in git: a site downloaded with the Power Platform CLI, or an unpacked solution that holds the site. It needs no Dataverse connection, and the same folder gives the same output every run.

Requires Node.js 22.23.4+, 24.22.1+ or 26.12.1+.

## Install

Run it without installing:

```bash
npx pageslens lint path/to/site
```

Or add it to the project, so everyone and CI run the same version:

```bash
npm install --save-dev pageslens
```

## The commands

```bash
npx pageslens lint path/to/site
```

```bash
npx pageslens test path/to/site
```

```bash
npx pageslens diff origin/main HEAD --site path/to/site
```

```bash
npx pageslens align path/to/site path/to/solution
```

```bash
npx pageslens docs path/to/site --out docs/site
```

- [`lint`](lint.md) finds known mistakes in table permissions, web roles, Web API settings and site settings.
- [`test`](policy.md) checks the site against your own requirements, written as sentences in a policy file.
- [`diff`](diff.md) shows what a change does to who can see and change what.
- [`align`](align.md) checks that a download and the solution that deploys it describe the same site.
- [`docs`](docs.md) writes an access matrix, the Web API surface and a diagram as Markdown.
- `explain <rule>` prints a lint rule's page: why it matters and how to fix it. `explain` alone lists the rules.

## The site folder

`path/to/site` is any of these:

- the `.powerpages-site` folder that `pac pages download-code-site` writes, or the folder that contains it;
- a classic site folder that `pac pages download` writes (the one with `website.yml` and `webrole.yml`);
- an unpacked solution (below).

pageslens tells the two download layouts apart by the keys in `website.yml`.

Records that are inactive in Dataverse (`statecode: 1` in the download) are left out everywhere, as Power Pages ignores them: an inactive table permission grants nothing, and an inactive role or setting counts for nothing. `docs` says how many were left out.

pageslens has been verified on **enhanced data model** sites, both a **code site** (`pac pages download-code-site`) and a **classic site** (`pac pages download`), and on unpacked solutions of both. `pac pages download` writes the same layout with `--modelVersion 1` and `2`, and a standard data model site should download in it too, but neither has been checked against a real site yet.

## Solutions

An unpacked solution is the folder with `Other/Solution.xml` that `pac solution unpack` writes, or the project `pac solution clone` writes (pageslens looks in its `src/`). Each site component is `powerpagecomponents/<guid>/powerpagecomponent.xml`, and pageslens reads them into the same records as a download of the same site, matched by GUID, so `lint`, `test`, `diff` and `docs` give the same results. Findings point at the component's file.

- A solution with more than one site isn't read yet, nor is the YAML source control format that Dataverse Git integration writes, nor a solution `.zip` (unpack it first).
- A component that isn't in the solution isn't checked: pageslens reads what deploys.
- To check that a download and a solution describe the same site, use [`align`](align.md).
- A site setting can take its value from an environment variable. pageslens reads the variable's value from the solution (the current value, or else the default). A download doesn't include the variable, so there the value is unknown: rules that need it skip the setting, `test` statements that need it fail and say why, and `diff` counts a move to a variable as wider. To check the values a stage gets, give its [deployment settings file](#deployment-settings).

## Deployment settings

The values of environment variables differ per stage, and the import takes each stage's values from a deployment settings file: the JSON `pac solution create-settings` writes and `pac solution import --settings-file` reads, usually kept in the repository as `deployment-settings/<stage>.json`. Give one to `lint`, `test`, `diff` or `align` with `--settings <file>` to check what that stage gets:

```
pageslens lint site --settings deployment-settings/prod.json
pageslens test site --settings deployment-settings/prod.json
```

- A setting backed by a variable takes the file's `Value` for it, matched by schema name, ignoring case, and messages name the file: `"true" from environment variable dwcrm_ContactApi in deployment-settings/prod.json`. This works on a download and on a solution alike.
- A variable the file doesn't have, or has with an empty `Value` (as `create-settings` writes every variable), keeps what it had: unknown in a download, the solution's value in a solution. So does a secret (`TypeId` 100000005): its value is in Azure Key Vault. pageslens doesn't guess what the import does then.
- Only `EnvironmentVariables` is read; `ConnectionReferences` and other keys are ignored, and so are variables no setting uses and `DefaultValue`.
- One stage per run: check several stages with several runs. `docs` doesn't take the file, so committed docs stay the same for every stage.
- In `diff`, the file is read on each side: from the folder, or at the same path in each commit, so a pull request that only changes a stage's file shows what it does to access. A side without the file reads it as empty.
- In `align`, a variable the file gives a value isn't reported as having none, and a variable the file gives no value is a warning (`variable-not-in-settings`) when the solution has a value: the stage may get dev's.

A file that can't be read, isn't JSON, or has no `EnvironmentVariables` list of entries with a `SchemaName` is exit code `2`.

## Next

- Run `lint` on your site and read the [rules](../rules/README.md) it reports.
- Write your requirements down as a [policy](policy.md).
- Run the checks on every pull request: [In CI](ci.md).
