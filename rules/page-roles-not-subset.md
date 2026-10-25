# page-roles-not-subset

**Default: warning**

A Restrict Read rule lists a web role that a Restrict Read rule on a page above doesn't let in. A Grant Change on the way down that lets the role in is taken into account.

Classic sites only (`pac pages download`). On a code site, the browser routes pages, so page access rules aren't checked.

## Why it matters

A rule affects its page and every page below it, so a user has to pass every Restrict Read rule on the way down. Microsoft's docs say a child page restricted to a role that the parent doesn't allow "won't be available to those roles". The role is listed, but can't reach the page. (pageslens assumes nested rules narrow access like this; it's still to be checked in an environment.)

## How to fix

Add the role to the rule above, move the page out of the restricted branch, or take the role off the rule if it isn't meant to read the page.
