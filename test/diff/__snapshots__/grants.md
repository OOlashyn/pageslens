<!-- pageslens:diff site=test/fixtures/diff/grants/head/.powerpages-site -->
### Access changes

**8 wider, 4 narrower, 7 neutral** in `test/fixtures/diff/grants/base/.powerpages-site` → `test/fixtures/diff/grants/head/.powerpages-site`

#### Wider
- **Authenticated Users** gained **read, write** on `contact` (global scope) from "Contact - Authenticated Users Global Write" (Web API enabled) (also reported by lint: global-write-authenticated)
- **Customers**: **write** on `incident` changed from contact scope to global scope in "Incident - Customers"
- **Customers**: **read** on `dwcrm_order` changed from contact scope to account scope in "Order - Customers"
- **Customers**: **read** on `contact` (contact scope) may reach other rows, as the contact relationship changed from "contact\_customer\_contacts" to "contact\_parent\_contacts" in "Contact - Customers" (Web API enabled)
- **Customers** gained **read** on `annotation` (parent scope) from "Case Note - Customers", under "Case - Customers" (the chain under "Case - Customers" is now complete)
- **New Role** gained **read** on `dwcrm_survey` (global scope) from "Survey - New Role"
- **Partner** gained **read** on `dwcrm_case` (contact scope) from "Case - Customers" (the role was added to the permission)
- **Partner** gained **read** on `task` (parent scope) from "Case Task - Inherited", under "Case - Customers" (inherits roles from "Case - Customers") (the parent permission now has the role)

#### Narrower
- **Anonymous Users** lost **read** on `knowledgearticle` (global scope) from "Articles - Anonymous Read" (removed)
- **Customers** lost **write** on `dwcrm_ticket` (global scope) from "Ticket - Customers" (the privilege was turned off)
- **Customers**: **read** on `account` changed from global scope to account scope in "Account - Customers"
- **Old Role** lost **create** on `feedback` (global scope) from "Feedback - Old Role" (the role was removed)

<details><summary>7 neutral changes</summary>

- **Authenticated Users** has **read** on `product` (global scope) from "Product - Authenticated Read" instead of "Product - Read" (same access)
- **Customers** gained **read** on `dwcrm_invoice` (contact scope) from "Invoice - Customers Contact" (already has it at global scope)
- Role "Customer" renamed to "Customers"
- Role "New Role" added
- Role "Old Role" removed
- Role "Partner" recreated with a new id
- "Contact - Self" renamed to "Contact - Own record" (same access)

</details>

<details><summary>Where these come from</summary>

| Change | File |
|---|---|
| Authenticated Users read, write contact | `table-permissions/Contact-Authenticated-Users-Global-Write.tablepermission.yml` |
| Customers write incident | `table-permissions/Incident-Customers.tablepermission.yml` |
| Customers read dwcrm\_order | `table-permissions/Order-Customers.tablepermission.yml` |
| Customers read contact | `table-permissions/Contact-Customers.tablepermission.yml` |
| Customers read annotation | `table-permissions/Case-Note-Customers.tablepermission.yml` |
| New Role read dwcrm\_survey | `table-permissions/Survey-New-Role.tablepermission.yml` |
| Partner read dwcrm\_case | `table-permissions/Case-Customers.tablepermission.yml` |
| Partner read task | `table-permissions/Case-Task-Inherited.tablepermission.yml` |
| Anonymous Users read knowledgearticle | `table-permissions/Articles-Anonymous-Read.tablepermission.yml` (base) |
| Customers write dwcrm\_ticket | `table-permissions/Ticket-Customers.tablepermission.yml` (base) |
| Customers read account | `table-permissions/Account-Customers.tablepermission.yml` |
| Old Role create feedback | `table-permissions/Feedback-Old-Role.tablepermission.yml` (base) |
| Authenticated Users read product | `table-permissions/Product-Read.tablepermission.yml` (base) |
| Authenticated Users read product | `table-permissions/Product-Authenticated-Read.tablepermission.yml` |
| Customers read dwcrm\_invoice | `table-permissions/Invoice-Customers-Contact.tablepermission.yml` |
| Role "Customers" | `web-roles/Customers.webrole.yml` |
| Role "New Role" | `web-roles/New-Role.webrole.yml` |
| Role "Old Role" | `web-roles/Old-Role.webrole.yml` (base) |
| Role "Partner" | `web-roles/Partner.webrole.yml` |
| "Contact - Own record" | `table-permissions/Contact-Own-record.tablepermission.yml` |

</details>
