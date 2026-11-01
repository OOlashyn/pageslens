// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// Pages other than the home page come from README.md, docs/ and rules/: scripts/sync-docs.ts writes
// them into src/content/docs/ before each build, at the slugs it lists in PAGES.
export default defineConfig({
  site: 'https://pageslens.olashyn.dev',
  integrations: [
    starlight({
      title: 'pageslens',
      description:
        'Offline lint, policy tests, access diffs and docs for Power Pages site configuration in source control.',
      logo: {
        light: './src/assets/lockup-light.svg',
        dark: './src/assets/lockup-dark.svg',
        replacesTitle: true,
      },
      customCss: ['@fontsource/manrope/latin-700.css', './src/styles/custom.css'],
      // src/pages/404.astro instead: Starlight's own route looks for a docs entry "404" and warns without one.
      disable404Route: true,
      favicon: '/favicon.svg',
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/OOlashyn/pageslens' }],
      editLink: { baseUrl: 'https://github.com/OOlashyn/pageslens/edit/main/site/' },
      sidebar: [
        { label: 'Start', items: [{ label: 'Introduction', link: '/' }, 'getting-started'] },
        {
          label: 'Commands',
          items: ['commands/lint', 'commands/test', 'commands/diff', 'commands/align', 'commands/docs'],
        },
        {
          label: 'Rules',
          items: [{ label: 'All rules', slug: 'rules' }, { autogenerate: { directory: 'rules' } }],
        },
        {
          label: 'Guides',
          items: ['guides/ci', 'guides/alm', 'guides/azure-devops', 'guides/agents'],
        },
      ],
    }),
  ],
});
