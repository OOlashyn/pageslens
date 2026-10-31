# Generated docs: `pageslens docs`

`pageslens docs` writes what a site gives to whom as plain Markdown, to commit next to the site and review in pull requests.

```
pageslens docs [path] --out <dir>
```

Writes three pages into `<dir>`, four for a classic site (other files there are left alone):

| Page               | Contents                                                                                                                                                                                       |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.md`         | Counts, links, and a Mermaid diagram: roles → table permissions → tables, with parent chains                                                                                                   |
| `access-matrix.md` | Role × table matrix with privileges and scope, grants by role (including parent chains), and permissions that grant nothing                                                                    |
| `webapi.md`        | Tables reachable through `/_api`, their fields, and which roles can call them                                                                                                                  |
| `pages.md`         | Classic sites only: who can read each page, from the page access rules (Restrict Read down the page tree, Grant Change overrides), every rule with its scope, and the inactive pages and rules |

The output has no timestamps and a fixed order, so regenerating it for an unchanged site gives an empty diff. Commit it next to the site to review access changes in pull requests.

`docs` doesn't take `--settings`, so committed docs stay the same for every stage. To have an agent add narrative docs next to the generated pages, see [Using pageslens with an agent](agents.md#write-narrative-docs).
