# grant-change-overrides-read

**Default: warning**

A Grant Change rule on a page, or on a page above it, lists a web role that the page's Restrict Read rule doesn't list.

Classic sites only (`pac pages download`). On a code site, the browser routes pages, so page access rules aren't checked.

## Why it matters

Grant Change lets its roles publish changes to the page and the pages below it, and "also grant[s] read access that overrides restrict read rules". So the role can read the restricted page anyway. A Grant Change rule on the home page does this for the whole site: Microsoft's troubleshooting lists it as "Restrict read rule doesn't work for admins".

## How to fix

If the role is meant to read the page, add it to the Restrict Read rule so the intent is written down. If not, move the Grant Change rule lower in the tree, or take the role off it.
