import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vite-plus/test';
import {
  baseRef,
  commentAction,
  commentBody,
  COMMENT_MAX_LENGTH,
  findComment,
  findPolicy,
  headRef,
  isFork,
  type IssueComment,
  type PullRequest,
  sarifCounts,
} from '../../action/main.js';

const pr: PullRequest = {
  number: 7,
  base: { ref: 'main' },
  head: { repo: { full_name: 'owner/repo' } },
};

describe('action', () => {
  it('tells fork pull requests apart', () => {
    expect(isFork(pr, 'owner/repo')).toBe(false);
    expect(isFork(pr, 'other/repo')).toBe(true);
    // The head repository of a deleted fork is null
    expect(isFork({ ...pr, head: { repo: null } }, 'owner/repo')).toBe(true);
  });

  it('compares with origin/<base branch>, or the base input as given', () => {
    const remote = (branch: string) => branch === 'main' || branch === 'release';
    expect(baseRef('', pr, remote)).toBe('origin/main');
    expect(baseRef('release', pr, remote)).toBe('origin/release');
    expect(baseRef('origin/release', pr, remote)).toBe('origin/release');
    expect(baseRef('a1b2c3d', pr, remote)).toBe('a1b2c3d');
  });

  it("compares with the pull request's head commit when the checkout has it", () => {
    const sha = 'a'.repeat(40);
    const withHead = { ...pr, head: { ...pr.head, sha } };
    expect(headRef(withHead, () => true)).toBe(sha);
    expect(headRef(withHead, () => false)).toBe('HEAD');
    expect(headRef(pr, () => true)).toBe('HEAD');
    expect(headRef({ ...pr, head: { sha: '--output=x' } }, () => true)).toBe('HEAD');
  });

  it('finds the nearest policy file, as test does', async () => {
    const temp = await mkdtemp(join(tmpdir(), 'pageslens-action-'));
    try {
      const site = join(temp, 'repo', 'site');
      await mkdir(site, { recursive: true });
      expect(findPolicy(site)).toBeUndefined();
      await writeFile(join(temp, 'repo', 'pageslens.policy.yaml'), 'access: []\n');
      expect(findPolicy(site)).toBe(join(temp, 'repo', 'pageslens.policy.yaml'));
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it('counts lint errors and failed statements from SARIF', () => {
    const sarif = {
      runs: [
        {
          results: [
            { ruleId: 'policy/a', level: 'error' },
            { ruleId: 'policy/a', level: 'error' },
            { ruleId: 'global-write', level: 'warning' },
          ],
        },
        {},
      ],
    };
    expect(sarifCounts(sarif)).toEqual({ errors: 2, warnings: 1, rules: 2 });
  });

  it("finds only a bot's comment with this site's marker", () => {
    const marker = '<!-- pageslens:diff site=site -->';
    const bot = { type: 'Bot' };
    const comments: IssueComment[] = [
      { id: 1, html_url: '', user: { type: 'User' }, body: `${marker}\nfrom a person` },
      { id: 2, html_url: '', user: bot, body: '<!-- pageslens:diff site=other -->\n' },
      { id: 3, html_url: '', user: bot, body: `quoted:\n${marker}` },
      { id: 4, html_url: '', user: bot, body: `${marker}\n\n### Access changes` },
    ];
    expect(findComment(comments, marker)?.id).toBe(4);
    expect(findComment(comments.slice(0, 3), marker)).toBeUndefined();
  });

  it('updates an earlier comment, but creates one only for changes', () => {
    const existing = { id: 1, html_url: '' };
    expect(commentAction(existing, true)).toBe('update');
    expect(commentAction(existing, false)).toBe('update');
    expect(commentAction(undefined, true)).toBe('create');
    expect(commentAction(undefined, false)).toBe('none');
  });

  it("puts the alignment above the access changes, under the diff's marker", () => {
    const diff = '<!-- pageslens:diff site=site -->\n### Access changes\n\nNo access changes.\n';
    const align =
      '<!-- pageslens:align site=site -->\n### Download and solution\n\n**No differences.**\n';
    expect(commentBody(undefined, undefined)).toBeUndefined();
    expect(commentBody(diff, undefined)).toBe(diff);
    expect(commentBody(undefined, align)).toBe(align);
    expect(commentBody(diff, align)).toBe(
      '<!-- pageslens:diff site=site -->\n### Download and solution\n\n**No differences.**\n\n### Access changes\n\nNo access changes.\n',
    );
    const long = commentBody(`${diff}${'x'.repeat(COMMENT_MAX_LENGTH)}`, align)!;
    expect(long.length).toBeLessThanOrEqual(COMMENT_MAX_LENGTH);
    expect(long).toMatch(/^<!-- pageslens:diff site=site -->\n### Download and solution/);
    expect(long).toContain('Too long to add to this comment');
  });
});
