import { resolve } from 'node:path'
import { createOpenAPI } from 'fumadocs-openapi/server'

export const OPENAPI_SNAPSHOT_PATH = resolve(
  process.cwd(),
  'content/openapi/basic-example.openapi.json',
)

export const openapi = createOpenAPI({
  input: [OPENAPI_SNAPSHOT_PATH],
})
