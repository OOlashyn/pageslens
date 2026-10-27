<!-- pageslens:align site=test/fixtures/align/content/site -->
### Download and solution

`test/fixtures/align/content/site` → `test/fixtures/align/content/solution`

**5 errors, 1 warning. 3 records match.**

#### ✗ Active on one side only
- web role **Partners**: active in the download, inactive in the solution `webrole.yml`

#### ✗ Content differs
- basic form **Edit**: settings differs `basic-forms/edit/Edit.basicform.yml`
- site setting **Search/Enabled**: value is "true" in the download, "false" in the solution `sitesetting.yml`
- web file **logo.png**: content differs `web-files/logo.png.webfile.yml`
- web template **Header**: source differs `web-templates/header/Header.webtemplate.yml`

<details><summary>⚠ Fields on one side only (1)</summary>

- web role **Staff**: futurefield is "x" in the solution only; the other side's format doesn't write it `webrole.yml`

</details>

_Access components differ: `pageslens diff test/fixtures/align/content/site test/fixtures/align/content/solution` shows what the solution changes about who can see what._
