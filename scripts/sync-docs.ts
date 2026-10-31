// Writes the documentation site's pages (site/src/content/docs/) from docs/ and rules/, so the
// Markdown on GitHub, `pageslens explain` and the site show the same text (spec 0012). Each page
// gets Starlight frontmatter (the title from its `#` line, which is removed, and a description from
// its first paragraph), and relative links become site URLs, or GitHub URLs for files that aren't
// pages. A link to a missing file or heading fails the sync, and so the site's build.
// Node.js runs this file directly (type stripping), so it uses only erasable TypeScript and no
// dependencies. `site/package.json` runs it before `astro dev` and `astro build`.

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SITE = 'https://pageslens.olashyn.dev';
const REPOSITORY = 'https://github.com/OOlashyn/pageslens';
const OUT = 'site/src/content/docs';
// Written by hand in OUT; the sync leaves them alone
const KEEP = new Set(['.gitignore', 'index.mdx']);

/** Where each file in docs/ goes. A file not listed fails the sync, so every page gets a place. */
const DOCS: Record<string, { slug: string; label?: string }> = {
  'docs/getting-started.md': { slug: 'getting-started' },
  'docs/lint.md': { slug: 'commands/lint', label: 'lint' },
  'docs/policy.md': { slug: 'commands/test', label: 'test' },
  'docs/diff.md': { slug: 'commands/diff', label: 'diff' },
  'docs/align.md': { slug: 'commands/align', label: 'align' },
  'docs/docs.md': { slug: 'commands/docs', label: 'docs' },
  'docs/ci.md': { slug: 'guides/ci' },
  'docs/alm.md': { slug: 'guides/alm', label: 'ALM workflow' },
  'docs/azure-devops.md': { slug: 'guides/azure-devops' },
  'docs/agents.md': { slug: 'guides/agents', label: 'With an agent' },
};

export interface Page {
  /** The source file, relative to the repository root, with forward slashes. */
  source: string;
  slug: string;
  label?: string;
}

export interface SyncResult {
  /** Each page's file under OUT and its text. */
  files: { path: string; text: string }[];
  errors: string[];
}

/** The site's pages: the files in docs/ (as DOCS places them), rules/README.md and each rule. */
export function sitePages(root: string): { pages: Page[]; errors: string[] } {
  const pages: Page[] = [];
  const errors: string[] = [];
  for (const name of markdownFiles(root, 'docs')) {
    const place = DOCS[`docs/${name}`];
    if (place) pages.push({ source: `docs/${name}`, ...place });
    else
      errors.push(`docs/${name} has no place on the site: add it to DOCS in scripts/sync-docs.ts`);
  }
  for (const source of Object.keys(DOCS)) {
    if (!pages.some((page) => page.source === source))
      errors.push(`${source} is in DOCS but missing`);
  }
  for (const name of markdownFiles(root, 'rules')) {
    const id = name.slice(0, -'.md'.length);
    pages.push(
      name === 'README.md'
        ? { source: 'rules/README.md', slug: 'rules' }
        : { source: `rules/${name}`, slug: `rules/${id}` },
    );
  }
  return { pages, errors };
}

/** Every page's text, with frontmatter and rewritten links, and every problem found. */
export function syncDocs(root: string): SyncResult {
  const { pages, errors } = sitePages(root);
  const bySource = new Map(pages.map((page) => [page.source, page]));
  const anchorCache = new Map<string, Set<string>>();
  const anchorsOf = (source: string): Set<string> => {
    let anchors = anchorCache.get(source);
    if (!anchors) {
      anchors = headingAnchors(read(root, source));
      anchorCache.set(source, anchors);
    }
    return anchors;
  };

  const files = pages.map((page) => {
    const text = read(root, page.source);
    const [first, ...rest] = text.split('\n');
    if (!first?.startsWith('# ')) errors.push(`${page.source}: the first line isn't a "# " title`);
    const title = plain(first?.slice(2) ?? page.slug);
    const body = rest.join('\n').replace(/^\n+/, '');

    const linked = rewriteLinks(body, (href) => {
      const [path = '', anchor] = href.split('#', 2);
      if (/^[a-z][a-z+.-]*:/i.test(href)) return href;
      if (path === '') {
        if (anchor && !anchorsOf(page.source).has(anchor)) {
          errors.push(`${page.source}: no heading for #${anchor}`);
        }
        return href;
      }
      const target = posix.normalize(posix.join(posix.dirname(page.source), path));
      if (target.startsWith('..') || !existsSync(resolve(root, target))) {
        errors.push(`${page.source}: broken link ${href}`);
        return href;
      }
      if (anchor && target.endsWith('.md') && !anchorsOf(target).has(anchor)) {
        errors.push(`${page.source}: no heading for #${anchor} in ${target}`);
      }
      const hash = anchor ? `#${anchor}` : '';
      const linkedPage = bySource.get(target);
      if (linkedPage) return `/${linkedPage.slug}/${hash}`;
      const kind = statSync(resolve(root, target)).isDirectory() ? 'tree' : 'blob';
      return `${REPOSITORY}/${kind}/main/${target}${hash}`;
    });

    const frontmatter = [
      '---',
      `title: ${JSON.stringify(title)}`,
      `description: ${JSON.stringify(description(body))}`,
      `editUrl: ${REPOSITORY}/edit/main/${page.source}`,
      ...(page.label ? ['sidebar:', `  label: ${JSON.stringify(page.label)}`] : []),
      '---',
      '',
    ];
    return { path: `${page.slug}.md`, text: `${frontmatter.join('\n')}${linked}` };
  });
  return { files, errors };
}

/** Runs `rewrite` on each Markdown link's target outside code blocks and inline code. */
export function rewriteLinks(markdown: string, rewrite: (href: string) => string): string {
  let fence = false;
  return markdown
    .split('\n')
    .map((line) => {
      if (/^\s*```/.test(line)) {
        fence = !fence;
        return line;
      }
      if (fence) return line;
      // Inline code spans are the odd parts when split on backtick runs
      return line
        .split(/(`+[^`]*`+)/)
        .map((part, i) =>
          i % 2 === 1
            ? part
            : part.replace(/\]\(([^)\s]+)\)/g, (_, href: string) => `](${rewrite(href)})`),
        )
        .join('');
    })
    .join('\n');
}

/** The anchors of a Markdown file's headings, as GitHub and Starlight make them. */
export function headingAnchors(markdown: string): Set<string> {
  const anchors = new Set<string>();
  const counts = new Map<string, number>();
  let fence = false;
  for (const line of markdown.split('\n')) {
    if (/^\s*```/.test(line)) fence = !fence;
    const heading = fence ? undefined : /^#{1,6} (.+)$/.exec(line)?.[1];
    if (!heading) continue;
    const base = slugify(plain(heading));
    const count = counts.get(base) ?? 0;
    counts.set(base, count + 1);
    anchors.add(count === 0 ? base : `${base}-${count}`);
  }
  return anchors;
}

/** GitHub's heading slugs (github-slugger): lower case, punctuation dropped, spaces to hyphens. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M} _-]/gu, '')
    .replace(/ /g, '-');
}

/** Markdown inline text as plain text: link text kept, code and emphasis marks dropped. */
function plain(markdown: string): string {
  return markdown
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The first paragraph of prose: not code, a table, a list, a quote or a line in bold only. */
function description(body: string): string {
  const paragraphs = body.split(/\n\s*\n/);
  for (const paragraph of paragraphs) {
    const text = paragraph.trim();
    if (text === '' || /^(```|\||#|>|- |\d+\. |<)/.test(text)) continue;
    if (/^\*\*[^*]+\*\*$/.test(text)) continue;
    return plain(text);
  }
  return '';
}

function markdownFiles(root: string, folder: string): string[] {
  return readdirSync(resolve(root, folder))
    .filter((name) => name.endsWith('.md'))
    .sort();
}

function read(root: string, source: string): string {
  return readFileSync(resolve(root, source), 'utf8').replace(/\r\n/g, '\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const { files, errors } = syncDocs(root);
  if (errors.length > 0) {
    for (const error of errors) console.error(`error: ${error}`);
    process.exitCode = 1;
  } else {
    const out = resolve(root, OUT);
    for (const name of readdirSync(out)) {
      if (!KEEP.has(name)) rmSync(resolve(out, name), { recursive: true });
    }
    for (const file of files) {
      const path = resolve(out, file.path);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, file.text);
    }
    console.log(`Wrote ${files.length} pages to ${OUT}`);
  }
}
