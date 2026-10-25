# page-rule-no-role

**Default: error for Restrict Read, info for Grant Change**

A page access rule on a page has no web role, or only web roles that don't exist in the site or are inactive. A rule with no page is left to `page-rule-no-page`.

Classic sites only (`pac pages download`). On a code site, the browser routes pages, so page access rules aren't checked.

## Why it matters

A Restrict Read rule with no role lets nobody through, so its page and every page below it can only be read by Grant Change roles. A Grant Change rule with no role does nothing.

## How to fix

Add the intended web roles to the rule (`adx_webpageaccesscontrolrule_webrole`), or deactivate it.
