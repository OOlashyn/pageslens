<!-- pageslens:align site=test/fixtures/align/missing/site/.powerpages-site -->
### Download and solution

`test/fixtures/align/missing/site/.powerpages-site` → `test/fixtures/align/missing/solution`

**2 errors, 2 warnings. 2 records match.**

#### ✗ Missing from the solution: won't be in test or prod
- table permission **Course Admins - Courses** `table-permissions/Course-Admins-Courses.tablepermission.yml`
- web role **Course Admins** `web-roles/Course-Admins.webrole.yml`

<details><summary>⚠ Missing from the solution: won't be in test or prod (1)</summary>

- web page **Draft** (inactive) `web-pages/draft/Draft.webpage.yml`

</details>

<details><summary>⚠ In the solution, not in the download (1)</summary>

- web page **Old Promo** `powerpagecomponents/00000000-0000-0000-a155-000000000005/powerpagecomponent.xml`

</details>

_Access components differ: `pageslens diff test/fixtures/align/missing/site/.powerpages-site test/fixtures/align/missing/solution` shows what the solution changes about who can see what._
