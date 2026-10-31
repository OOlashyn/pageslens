# Access changes: `pageslens diff`

`pageslens lint` catches known mistakes and `pageslens test` checks your requirements. `pageslens diff` answers a third question for a pull request: **what does this change do to who can see and change what?**

```
pageslens diff <base> <head> [--site <path>] [--merge-base] [--format text|markdown|json] [--fail-on wider|any]
```

It compares effective access, not files. Both sides go through the same reading and access logic as `docs` and `test`, so a permission split in two with the same result, or a file that was renamed or moved, isn't an access change. The YAML diff is already in the pull request; `diff` shows what it means.

| Exit code | Meaning                                                                                                                         |
| --------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 0         | The comparison ran, whatever it found                                                                                           |
| 1         | Only with `--fail-on`: something is wider (`--fail-on wider`), or anything changed (`any`)                                      |
| 2         | An argument that's neither a folder nor a git commit, or both; an unknown ref; a site or deployment settings file it can't read |

A diff is information for a reviewer, so it doesn't fail by default. Requirements a build should fail on belong in the [policy](policy.md). `--fail-on wider` is for teams that want every widening to need an explicit override, such as a label the workflow checks.

## Base and head

Base comes first, like `git diff A B`: sentences read "head compared with base" ("gained", "lost"). Each side is a folder or a git ref:

| Form               | Example                                           | Compares                                                                                                                                           |
| ------------------ | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two folders        | `pageslens diff downloads/before downloads/after` | two downloads or solutions. Each is found like `lint`'s path: a `.powerpages-site` inside it, a folder with `website.yml`, or an unpacked solution |
| Two refs           | `pageslens diff origin/main HEAD --site site`     | the site folder `--site` (default `.`, relative to the current folder) at each commit                                                              |
| A ref and a folder | `pageslens diff origin/main site`                 | the committed site at `origin/main` with the working tree, so uncommitted edits show                                                               |

- An existing folder is a folder; anything else must name a commit. An argument that is both (a folder called `main` next to a branch called `main`) is an error: write `./main` for the folder or `refs/heads/main` for the ref.
- `--site` is only for two refs: with a folder, the folder is the site. The site folder as a third argument (`diff origin/main HEAD site`) still works, with a warning, and will be removed in a later release.
- Commits are read with git, without a checkout or worktree, exactly as committed.
- `--merge-base` compares head with the merge base of the two refs, the way a pull request's diff does, so commits added to the target branch since the branch was made don't show up reversed. It needs two refs. In CI, fetch enough history for the merge base (`fetch-depth: 0`).
- A side where the site folder doesn't exist (the change adds the site, or removes it) is read as an empty site, with a note. A side that exists but can't be read is an error, as for `lint`.
- A classic download can be compared with a code site, and a download with an unpacked solution: all of them read into the same records with the same GUIDs. The output says when the sides were read differently. A download and a solution of the same site give no changes, unless the solution is missing components; [`align`](align.md) lists every component missing from the solution or different in it.

## Matching records

- **Records match by GUID**, never by file name or folder. Renaming or moving a file is not a change.
- **A renamed record** (same GUID, new name) is a neutral change, shown once. Every other line uses the head name.
- **A role deleted and created again** with the same name gets a new GUID. When exactly one removed role and one added role share a name, they're treated as one role ("recreated with a new id"), and their grants are compared as one.
- **Deactivating a record** counts as removing it, and **activating** one as adding it: an inactive record takes part in nothing. The line says so: `(deactivated)`, `(activated)`, `Role "Partners" deactivated`.
- **The Anonymous Users and Authenticated Users roles** are matched by their flag as well, when both have a new GUID. Moving a flag to another role is its own change.

## Classification

Every change is **wider**, **narrower** or **neutral**:

- **Wider**: may give someone access they didn't have. This is the direction that needs a reviewer.
- **Narrower**: takes access away.
- **Neutral**: changes how access is set up, not what it is.

The rule is conservative: a change pageslens can't show to be narrower or neutral is wider.

### Grants

A grant is a privilege (`read`, `write`, `create`, `delete`, `append`, `appendto`) a role has on a table at a scope, from a table permission that takes effect. These are the grants `docs` shows in the access matrix, including child (Parent scope) permissions that take their parent's roles. A permission that takes no effect (no web role, or a broken parent chain) grants nothing, so fixing or breaking one shows up as grants gained or lost, with the cause named.

| Change                                                                                                                       | Class                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| A role gains a privilege on a table at a scope                                                                               | wider, unless the role already had it on that table at global scope (then neutral) |
| A role loses a privilege on a table at a scope                                                                               | narrower, unless the role still has it at global scope (then neutral)              |
| Same role, table, scope and privilege, but a different contact, account or parent relationship (or a different parent chain) | wider: it may reach other rows                                                     |
| Same access from a different permission (renamed, split, merged, replaced)                                                   | neutral                                                                            |

Global scope covers every other scope. The other scopes aren't ordered: contact, account, parent and self scope reach different rows, so none covers another. A scope change on one permission is shown as one line, "write on contact changed from contact scope to global scope", and classified by the rules above: to global is wider, from global is narrower, between two other scopes is wider.

A grant on a table where the Web API is enabled on head ends with "(Web API enabled)".

### Web API

| Change                                    | Class                                                       |
| ----------------------------------------- | ----------------------------------------------------------- |
| Web API enabled on a table                | wider; the line lists who can call it, and their privileges |
| Web API disabled on a table               | narrower                                                    |
| Fields added, or changed to `*`           | wider                                                       |
| Fields removed, or `*` replaced by a list | narrower                                                    |

Field changes count only on a table where the Web API is enabled on both sides. Field names don't depend on case.

### Web roles

| Change                                                                   | Class                                                                    |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Role added, removed, renamed, or recreated with a new id                 | neutral; its grants are reported as grants                               |
| A role becomes the Authenticated Users role, or the Anonymous Users role | wider: its grants now apply to every signed-in user, or to every visitor |
| A role stops being one                                                   | narrower                                                                 |

### Site settings

A short, fixed list, read with Power Pages defaults when a setting isn't there, as `test` reads them:

| Setting                                                                                                       | Wider when              |
| ------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `Authentication/Registration/Enabled`, `Authentication/Registration/OpenRegistrationEnabled` (default `true`) | turned on               |
| `Authentication/Registration/RequiresInvitation` (default `false`)                                            | turned off              |
| `Webapi/error/innererror` (default `false`)                                                                   | turned on               |
| `HTTP/Access-Control-Allow-Origin`                                                                            | an origin added, or `*` |

The opposite change is narrower. Setting names don't depend on case. Other settings aren't access changes to `diff`: git already shows them.

### Settings from environment variables

A site setting can take its value from an environment variable. A solution has the variable, so its value is read as the setting's (the current value, or else the default), and a change to it is a change to the setting. A download has only the setting's leftover value, which the site doesn't use, so the value is unknown:

| Change                                                                    | Class                                                |
| ------------------------------------------------------------------------- | ---------------------------------------------------- |
| A setting (or `Webapi/<table>/enabled` or `…/fields`) moves to a variable | wider: the line says the value isn't in the download |
| It moves back, to a value at the closed end (off, disabled, no origins)   | narrower                                             |
| It moves back, to any other value                                         | wider                                                |
| Both sides are downloads that take it from the same variable              | no change                                            |

With `--settings <file>`, a stage's deployment settings file gives the variables' values, and a value from it is a setting's value like any other. The file is read on each side: from disk for a folder, at the same path in the commit for a ref. So a pull request that only changes `deployment-settings/prod.json` (say `dwcrm_ContactApi` from `false` to `true`) shows as the Web API now enabled on `contact`, wider. A side without the file reads it as empty, and a file on neither side is exit code `2`. A variable the file doesn't give a value (a secret, an empty `Value`, or not in the file) stays unknown in a download, as above.

### Pages

Classic sites only, when both sides are classic: page access rules decide who opens a page there. Each root page is matched by GUID, and its readers (who can read it, as `docs` shows in `pages.md`) and publishers (the roles of the Grant Change rules above it) are compared. A change says who gained or lost: anyone, every signed-in user, or a role.

| Change                                                                     | Class                                                                                                                                           |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Someone can now read a page, or publish it                                 | wider                                                                                                                                           |
| Someone can no longer read a page, or publish it                           | narrower                                                                                                                                        |
| A new page someone can read                                                | wider (`new page`)                                                                                                                              |
| A new page nobody can read                                                 | neutral                                                                                                                                         |
| A page removed                                                             | narrower                                                                                                                                        |
| Who can read a page becomes unknown (a broken page tree), or known again   | wider                                                                                                                                           |
| A page moved (another parent or partial URL)                               | neutral; its readers are compared as well                                                                                                       |
| The same readers from other rules (a rule renamed, removed with no effect) | neutral                                                                                                                                         |
| A rule's scope changed                                                     | wider when a Restrict Read stops covering the web files directly under its page, or a Grant Change starts covering them; narrower the other way |

A rule changes its page and every page below it, so a change that a page shares with the pages below it is one line, on the topmost page: "Anyone can now read /internal/ (and 4 pages below it)". The JSON output lists every page (`pages`). Each line names the rules that changed on the way down to the page, and their files.

Not compared yet: Server Logic, cloud flows and website access.

### Change kinds

The JSON output's `kind` is one of a closed list:

| Kind                                                              | Class                                                                                                                        |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `grant-gained`                                                    | wider, or neutral when global scope already covers it. A scope change on one permission that widens access                   |
| `grant-lost`                                                      | narrower, or neutral when global scope still covers it. A scope change on one permission that narrows access                 |
| `grant-rows-changed`                                              | wider                                                                                                                        |
| `grant-source-changed`                                            | neutral: same access from another permission, a renamed permission, or a scope change that global scope covers on both sides |
| `webapi-enabled`, `webapi-fields-wider`                           | wider                                                                                                                        |
| `webapi-disabled`, `webapi-fields-narrower`                       | narrower                                                                                                                     |
| `role-added`, `role-removed`, `role-renamed`, `role-recreated`    | neutral                                                                                                                      |
| `role-audience-changed`                                           | wider or narrower                                                                                                            |
| `setting-wider`, `setting-narrower`                               | wider, narrower                                                                                                              |
| `page-read-gained`, `page-publish-gained`, `page-readers-unknown` | wider                                                                                                                        |
| `page-read-lost`, `page-publish-lost`, `page-removed`             | narrower                                                                                                                     |
| `page-added`, `page-moved`, `page-rules-changed`                  | neutral                                                                                                                      |
| `page-rule-scope-changed`                                         | wider or narrower                                                                                                            |

## Order and wording

Changes are grouped wider, then narrower, then neutral. Within a group, most exposed first: the Anonymous Users role, then the Authenticated Users role, then other roles by name, then changes with no role (settings, renamed permissions). Within a role, grants come first, by scope (global, account, contact, parent, self), table and privilege, then other changes by kind. A Web API change sorts with the most exposed role that can call the table.

Each change is one sentence naming the role, privileges, table, scope and permission, in the words `test` uses for evidence:

```
test: Authenticated Users has write on contact (global scope) from "Contact - Authenticated Users Global Write"
diff: Authenticated Users gained write on contact (global scope) from "Contact - Authenticated Users Global Write"
```

Privileges with the same role, table, scope and permission are joined (`gained read, write`). A parent-scope grant adds `, under "<top parent>"`, and `(inherits roles from "<parent>")` when its roles come from a parent. A gained or lost grant names the cause when there is one: `(removed)`, `(deactivated)`, `(activated)`, `(the privilege was turned off)`, `(the role was added to the permission)`, `(the chain under "Case" is now complete)`. A wider line whose records also trip a lint rule ends with `(also reported by lint: <rule>)`; the rules run at their default severities, without your `pageslens.config.yaml`.

## Output

### Text

The default, for a terminal. `+` wider, `-` narrower, `~` neutral, each with the files behind it (relative to the site folder; `(base)` marks a file only base has):

```
Access changes in site/.powerpages-site, origin/main (a1b2c3d) → HEAD (e4f5a6b): 2 wider, 1 narrower, 1 neutral

Wider
  + Authenticated Users gained read, write on contact (global scope) from "Contact - Authenticated Users Global Write" (Web API enabled) (also reported by lint: global-write-authenticated)
      table-permissions/Contact-Authenticated-Users-Global-Write.tablepermission.yml
  + Customers: write on incident changed from contact scope to global scope in "Incident - Customers"
      table-permissions/Incident-Customers.tablepermission.yml
Narrower
  - Anonymous Users lost read on knowledgearticle (global scope) from "Articles - Anonymous Read" (removed)
      table-permissions/Articles-Anonymous-Read.tablepermission.yml (base)
Neutral
  ~ Role "Customer" renamed to "Customers"
      web-roles/Customers.webrole.yml
```

### Markdown

`--format markdown` writes a pull request comment: the counts first, wider and narrower changes listed, neutral changes and the files behind each change folded.

- The first line is a hidden marker, `<!-- pageslens:diff site=<path> -->`, so a workflow can find its own comment and edit it instead of adding another. It names the site folder, so a repository with several sites gets one comment per site.
- Commit hashes are shown because they're inputs. There are no timestamps or versions: the same inputs give the same comment, so it only changes when access does.
- GitHub rejects comments over 65,536 characters. Output is capped at 60,000: over that, the files table goes first, then the neutral details, then the narrower details. Wider changes go last, from the end, with a line saying how many more there are. The counts line is always exact, and the JSON output has everything.

### JSON

`--format json` gives a versioned object for scripts and agents. `version` changes only when a field is removed or changes meaning.

```json
{
  "version": 1,
  "base": {
    "ref": "origin/main",
    "commit": "a1b2c3d…",
    "path": "site/.powerpages-site",
    "layout": "code",
    "format": "code-download",
    "site": { "id": "…", "name": "…" }
  },
  "head": {
    "ref": "HEAD",
    "commit": "e4f5a6b…",
    "path": "site/.powerpages-site",
    "layout": "code",
    "format": "code-download",
    "site": { "id": "…", "name": "…" }
  },
  "summary": { "wider": 2, "narrower": 1, "neutral": 1 },
  "changes": [
    {
      "class": "wider",
      "kind": "grant-gained",
      "message": "Authenticated Users gained read, write on contact (global scope) from \"Contact - Authenticated Users Global Write\" (Web API enabled) (also reported by lint: global-write-authenticated)",
      "role": { "id": "…", "name": "Authenticated Users", "audience": "authenticated" },
      "table": "contact",
      "scope": "global",
      "privileges": ["read", "write"],
      "webApiEnabled": true,
      "lint": ["global-write-authenticated"],
      "sources": [
        {
          "side": "head",
          "recordId": "…",
          "name": "Contact - Authenticated Users Global Write",
          "file": "table-permissions/…yml"
        }
      ]
    }
  ]
}
```

A side is a folder when it has no `ref`, and has no site when it has no `site` (and no `layout` or `format`). `layout` is `code` or `classic`, and `format` what was read: `code-download`, `classic-download` or `solution`; `mergeBase: true` marks a base read at the merge base. A change has the fields that apply to it: `role` (with `audience`: `anonymous`, `authenticated` or `role`), `table`, `scope`, `fromScope` (the base scope, for a scope change on one permission), `privileges`, `webApiEnabled` (grants), `fields` (Web API field changes), `setting`, `lint`, and `sources`, each with the `side` it's read from.

There's no SARIF output: a diff isn't a list of findings on lines. For new lint findings and failed policy statements in a pull request, upload `lint` and `test` SARIF to code scanning (see [In CI](../README.md#in-ci)).
