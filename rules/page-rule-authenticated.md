# page-rule-authenticated

**Default: warning**

A Restrict Read rule lists the Authenticated Users role together with other roles.

Classic sites only (`pac pages download`). On a code site, the browser routes pages, so page access rules aren't checked.

## Why it matters

Every signed-in user has the Authenticated Users role, so every signed-in user passes the rule. The other roles add nothing, and the page is open to anyone who signs in, which is rarely what listing an admin role meant. A rule with only the Authenticated Users role is fine: that's "signed-in users only".

## How to fix

Take Authenticated Users off the rule to restrict the page to the other roles, or take the other roles off to say "signed-in users only".
