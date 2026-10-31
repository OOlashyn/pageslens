import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vite-plus/test';
import { ALIGN_DOCS } from '../../src/align/format/sarif.js';
import { CHECKS } from '../../src/align/types.js';
import { DOCS_SITE } from '../../src/docs-site.js';
import { RULE_DOCS_BASE } from '../../src/lint/engine.js';
import { RULES } from '../../src/lint/rules/index.js';
import { POLICY_DOCS } from '../../src/policy/format/sarif.js';
import {
  headingAnchors,
  rewriteLinks,
  SITE,
  sitePages,
  slugify,
  syncDocs,
} from '../../scripts/sync-docs.js';

// scripts/sync-docs.ts writes the docs site's pages from docs/ and rules/. Here it runs in memory,
// so a broken link in either folder fails `vp test`, not only the site's build.

describe('docs site sync', () => {
  it('turns every page in docs/ and rules/ into a site page, with every link resolved', () => {
    const { files, errors } = syncDocs('.');
    expect(errors).toEqual([]);
    expect(files.length).toBeGreaterThan(RULES.length);
    for (const file of files) expect(file.text, file.path).toMatch(/^---\ntitle: ".+"\n/);
  });

  it('has a page for each link in the output', () => {
    const slugs = new Set(sitePages('.').pages.map((page) => `${DOCS_SITE}/${page.slug}/`));
    expect(DOCS_SITE).toBe(SITE);
    for (const rule of RULES) expect(slugs, rule.id).toContain(`${RULE_DOCS_BASE}/${rule.id}/`);
    expect(slugs).toContain(POLICY_DOCS);
    expect(slugs).toContain(ALIGN_DOCS);
  });

  it('has a heading on the align page for each check, as the SARIF help links point at it', () => {
    const anchors = headingAnchors(readFileSync('docs/align.md', 'utf8'));
    for (const check of CHECKS) expect(anchors, check).toContain(check);
  });

  it('rewrites links outside code only', () => {
    const markdown = ['See [diff](diff.md) and `[not](a.md)`.', '```', '[not](b.md)', '```'].join(
      '\n',
    );
    expect(rewriteLinks(markdown, (href) => `/${href}/`)).toBe(
      ['See [diff](/diff.md/) and `[not](a.md)`.', '```', '[not](b.md)', '```'].join('\n'),
    );
  });

  it('makes heading anchors as GitHub does', () => {
    expect(slugify('`pageslens lint`')).toBe('pageslens-lint');
    expect(slugify("Review a pull request's access changes")).toBe(
      'review-a-pull-requests-access-changes',
    );
    expect(slugify('`site-mismatch`')).toBe('site-mismatch');
    const anchors = headingAnchors(
      ['# A', '## Output', '```yaml', '# not a heading', '```', '## Output'].join('\n'),
    );
    expect([...anchors]).toEqual(['a', 'output', 'output-1']);
  });
});
