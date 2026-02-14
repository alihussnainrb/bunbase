import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared'

export const gitConfig = {
  user: 'alihussnainrb',
  repo: 'bunbase',
  branch: 'main',
}

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: 'Bunbase',
      url: '/docs',
    },
    links: [
      {
        type: 'main',
        text: 'Documentation',
        url: '/docs',
      },
      {
        type: 'main',
        text: 'API Reference',
        url: '/docs/api-reference',
      },
      {
        type: 'menu',
        text: 'Versions',
        items: [
          {
            type: 'main',
            text: 'Latest (main)',
            description: 'Current docs from the main branch',
            url: 'https://docs.bunbase.dev',
            external: true,
          },
          {
            type: 'main',
            text: 'v1',
            description: 'Major v1 docs branch',
            url: 'https://v1.docs.bunbase.dev',
            external: true,
          },
        ],
      },
    ],
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  }
}
