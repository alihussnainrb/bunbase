import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export async function generateCommand(
	type: string,
	name: string,
): Promise<void> {
	if (!type || !name) {
		console.error('Usage: bunbase generate <action|module> <name>')
		process.exit(1)
	}

	switch (type) {
		case 'action':
			return generateAction(name)
		case 'module':
			return generateModule(name)
		default:
			console.error(
				`Unknown generator type: "${type}". Use "action" or "module".`,
			)
			process.exit(1)
	}
}

function generateAction(name: string): void {
	const fileName = `${toKebabCase(name)}.ts`
	const dir = join(process.cwd(), 'src', 'actions')

	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true })
	}

	const filePath = join(dir, fileName)
	if (existsSync(filePath)) {
		console.error(`File already exists: ${filePath}`)
		process.exit(1)
	}

	const camelName = toCamelCase(name)
	const content = `import { action, t, triggers } from 'bunbase'

export const ${camelName} = action({
  name: '${name}',
  description: 'TODO: Add description',
  input: t.Object({
    // Define input schema
  }),
  output: t.Object({
    // Define output schema
    success: t.Boolean(),
  }),
  triggers: [triggers.api('POST', '/${toKebabCase(name)}')],
}, async (input, ctx) => {
  // TODO: Implement handler
  return { success: true }
})
`

	writeFileSync(filePath, content)
	console.log(`Created action: ${filePath}`)
}

function generateModule(name: string): void {
	const dirName = toKebabCase(name)
	const dir = join(process.cwd(), 'src', 'modules', dirName)

	if (existsSync(dir)) {
		console.error(`Directory already exists: ${dir}`)
		process.exit(1)
	}

	mkdirSync(dir, { recursive: true })

	// Create _module.ts
	const moduleContent = `import { module } from 'bunbase'
// import { yourAction } from './your-action'

export default module({
  name: '${name}',
  apiPrefix: '/api/${dirName}',
  // guards: [],
  actions: [
    // yourAction,
  ],
})
`

	writeFileSync(join(dir, '_module.ts'), moduleContent)
	console.log(`Created module: ${dir}/_module.ts`)
	console.log(`Add actions to ${dir}/ and register them in _module.ts`)
}

function toKebabCase(str: string): string {
	return str
		.replace(/([a-z])([A-Z])/g, '$1-$2')
		.replace(/[\s_.]+/g, '-')
		.toLowerCase()
}

function toCamelCase(str: string): string {
	return str
		.replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
		.replace(/^(.)/, (c) => c.toLowerCase())
}
