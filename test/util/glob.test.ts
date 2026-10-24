import { describe, expect, it } from 'vite-plus/test';
import { globToRegExp } from '../../src/util/glob.js';

const matches = (glob: string, path: string) => globToRegExp(glob).test(path);

describe('globToRegExp', () => {
  it('matches * within one folder only', () => {
    expect(matches('web-roles/*.webrole.yml', 'web-roles/Admin.webrole.yml')).toBe(true);
    expect(matches('*.yml', 'web-roles/Admin.webrole.yml')).toBe(false);
  });

  it('matches ** across folders, including none', () => {
    expect(matches('**/*.yml', 'web-pages/home/Home.webpage.yml')).toBe(true);
    expect(matches('**/*.yml', 'webrole.yml')).toBe(true);
    expect(matches('web-pages/**', 'web-pages/home/Home.webpage.yml')).toBe(true);
  });

  it('matches ? as one character and the rest literally', () => {
    expect(matches('r?.yml', 'r1.yml')).toBe(true);
    expect(matches('r?.yml', 'r12.yml')).toBe(false);
    expect(matches('a.yml', 'axyml')).toBe(false);
    expect(matches('Feedback (1).yml', 'Feedback (1).yml')).toBe(true);
  });
});
