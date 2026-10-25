# page-rule-anonymous

**Default: error**

A page access rule lists the Anonymous Users role.

Classic sites only (`pac pages download`). On a code site, the browser routes pages, so page access rules aren't checked.

## Why it matters

Microsoft says the Anonymous Users role shouldn't be assigned to web pages. The design studio won't create such a rule, and shows a warning when one was made in the Power Pages Management app.

Checked on a classic site: on a page whose Restrict Read rule lists only the Anonymous Users role, anonymous visitors and signed-in users were both refused ("Access Restricted"). The role lets nobody in, so the page is closed to everyone but Grant Change roles. That's rarely what was meant: the rule was usually meant to keep the page public.

## How to fix

To keep a page public, don't restrict it: deactivate or delete the rule. To restrict it, list the roles that should read it instead.
