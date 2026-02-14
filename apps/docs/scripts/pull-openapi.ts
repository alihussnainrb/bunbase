import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const sourceUrl =
  process.env.OPENAPI_SOURCE_URL ?? 'http://localhost:3000/api/openapi.json'
const outputPath = resolve(
  process.cwd(),
  'content/openapi/basic-example.openapi.json',
)

const response = await fetch(sourceUrl)

if (!response.ok) {
  throw new Error(
    `Failed to fetch OpenAPI schema from ${sourceUrl} (${response.status})`,
  )
}

const schema = await response.json()

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(`${outputPath}`, `${JSON.stringify(schema, null, 2)}\n`, 'utf8')

console.log(`Updated OpenAPI snapshot at ${outputPath}`)
