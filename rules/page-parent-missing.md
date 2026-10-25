# page-parent-missing

**Default: error (warning when the parent page is inactive)**

A web page's parent page (`adx_parentpageid`) isn't in the site or is inactive, or the parent pages loop back to the page. Pages below it aren't reported again.

Classic sites only (`pac pages download`). On a code site, the browser routes pages, so page access rules aren't checked.

## Why it matters

Page access rules apply down the page tree. When a page's place in the tree is broken, the rules above it can't be followed, so who can read it is unknown. `pageslens docs` shows it as "unknown". Below an inactive page, the page can't be opened.

## How to fix

Set the page's parent to a page in the site, or activate the parent if it was deactivated by mistake.
