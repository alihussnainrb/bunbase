import { join } from 'node:path'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'

export async function initCommand(name?: string): Promise<void> {
	const projectName = name ?? 'my-bunbase-app'
	const projectDir = join(process.cwd(), projectName)

	if (existsSync(projectDir)) {
		console.error(`Directory "${projectName}" already exists.`)
		process.exit(1)
	}

	console.log(`Creating new Bunbase project: ${projectName}`)

	// Create directory structure
	mkdirSync(projectDir, { recursive: true })
	mkdirSync(join(projectDir, 'src', 'actions'), { recursive: true })
	mkdirSync(join(projectDir, 'src', 'modules'), { recursive: true })

	// package.json
	writeFileSync(
		join(projectDir, 'package.json'),
		JSON.stringify(
			{
				name: projectName,
				version: '0.0.1',
				type: 'module',
				scripts: {
					dev: 'bunbase dev',
					build: 'bun build src/index.ts --outdir dist',
					test: 'bun test',
				},
				dependencies: {
					bunbase: 'latest',
				},
				devDependencies: {
					'@types/bun': 'latest',
					typescript: '^5.0.0',
				},
			},
			null,
			2,
		),
	)

	// bunbase.config.ts
	writeFileSync(
		join(projectDir, 'bunbase.config.ts'),
		`import { defineConfig } from 'bunbase'

export default defineConfig({
  port: 3000,
  actionsDir: 'src',
  openapi: {
    enabled: true,
    title: '${projectName} API',
    version: '1.0.0',
  },
  studio: {
    enabled: true,
  },
})
`,
	)

	// tsconfig.json
	writeFileSync(
		join(projectDir, 'tsconfig.json'),
		JSON.stringify(
			{
				compilerOptions: {
					target: 'ESNext',
					module: 'ESNext',
					moduleResolution: 'bundler',
					strict: true,
					esModuleInterop: true,
					skipLibCheck: true,
					forceConsistentCasingInFileNames: true,
					outDir: './dist',
					declaration: true,
					types: ['bun-types'],
				},
				include: ['src'],
			},
			null,
			2,
		),
	)

	// Example action
	writeFileSync(
		join(projectDir, 'src', 'actions', 'hello.ts'),
		`import { action, t, triggers } from 'bunbase'

export const hello = action({
  name: 'hello',
  description: 'A simple hello world action',
  input: t.Object({
    name: t.Optional(t.String()),
  }),
  output: t.Object({
    message: t.String(),
  }),
  triggers: [triggers.api('GET', '/hello')],
}, async (input) => {
  return {
    message: \`Hello, \${input.name ?? 'World'}!\`,
  }
})
`,
	)

	// Example module
	writeFileSync(
		join(projectDir, 'src', 'modules', '_module.ts'),
		`import { module } from 'bunbase'
import { getUsers } from './get-users'

export default module({
  name: 'users',
  apiPrefix: '/api/users',
  actions: [getUsers],
})
`,
	)

	writeFileSync(
		join(projectDir, 'src', 'modules', 'get-users.ts'),
		`import { action, t, triggers } from 'bunbase'

export const getUsers = action({
  name: 'users.getAll',
  description: 'Get all users',
  input: t.Object({
    limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
  }),
  output: t.Object({
    users: t.Array(t.Object({
      id: t.String(),
      name: t.String(),
    })),
  }),
  triggers: [triggers.api('GET', '/')],
}, async (input) => {
  return {
    users: [
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ],
  }
})
`,
	)

	console.log(`
Project created successfully!

  cd ${projectName}
  bun install
  bun run dev

Your API will be running at http://localhost:3000
OpenAPI docs at http://localhost:3000/api/docs
`)
}
