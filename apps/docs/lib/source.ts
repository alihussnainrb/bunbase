import { openapi } from '@/lib/openapi'
import { docs } from 'fumadocs-mdx:collections/server'
import { loader, multiple } from 'fumadocs-core/source'
import { lucideIconsPlugin } from 'fumadocs-core/source/lucide-icons'
import { openapiPlugin, openapiSource } from 'fumadocs-openapi/server'

const apiReference = await openapiSource(openapi, {
  baseDir: 'api-reference/endpoints',
  per: 'operation',
  groupBy: 'tag',
})

export const source = loader({
  baseUrl: '/docs',
  source: multiple({
    docs: docs.toFumadocsSource(),
    api: apiReference,
  }),
  plugins: [openapiPlugin(), lucideIconsPlugin()],
})
