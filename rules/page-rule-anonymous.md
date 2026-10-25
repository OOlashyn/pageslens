# page-rule-anonymous

**Default: warning**

A page access rule lists the Anonymous Users role.

Classic sites only (`pac pages download`). On a code site, the browser routes pages, so page access rules aren't checked.

## Why it matters

Microsoft says the Anonymous Users role shouldn't be assigned to web pages, and the Portal Management app shows an alert for it. What the rule then does isn't documented. pageslens reads it as "anyone": the reading that gives more access, until it's checked in an environment.

## How to fix

To keep a page public, don't restrict it. To restrict it, list the roles that should read it instead.
