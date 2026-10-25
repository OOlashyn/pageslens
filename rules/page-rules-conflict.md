# page-rules-conflict

**Default: error**

A web page has more than one active Restrict Read rule.

Classic sites only (`pac pages download`). On a code site, the browser routes pages, so page access rules aren't checked.

## Why it matters

The Portal Management app reports this as an error: "Multiple, conflicting access control rules applied to this page". Which rule wins isn't documented. pageslens reads the page as open to the roles of any of them, the reading that gives more access.

## How to fix

Merge the rules into one Restrict Read rule with all the intended roles, and deactivate the others.
