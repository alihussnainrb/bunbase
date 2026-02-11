import { join } from 'node:path'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { INIT_SQL } from '../../db/init-sql.ts'

export async function initCommand(name: string): Promise<void> {
	const projectName = name
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
	mkdirSync(join(projectDir, 'migrations'), { recursive: true })

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
					'migrate': 'bunbase migrate',
					'migrate:new': 'bunbase migrate new',
					'migrate:status': 'bunbase migrate status',
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
  database: {
    url: process.env.DATABASE_URL,
    migrations: {
      directory: 'migrations',
    },
  },
  storage: {
    adapter: 'local',
    local: { directory: '.storage' },
  },
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

	// .env
	writeFileSync(
		join(projectDir, '.env'),
		`DATABASE_URL=postgresql://postgres:postgres@localhost:5432/${projectName.replace(/[^a-z0-9_]/g, '_')}
`,
	)

	// .gitignore
	writeFileSync(
		join(projectDir, '.gitignore'),
		`node_modules/
dist/
.storage/
.env
`,
	)

	// Initial migration
	writeFileSync(join(projectDir, 'migrations', '001_init.sql'), INIT_SQL)

	// Example standalone action
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

	// Example module with actions
	writeFileSync(
		join(projectDir, 'src', 'modules', '_module.ts'),
		`import { module } from 'bunbase'
import { getUsers } from './get-users'
import { createNote } from './create-note'

export default module({
  name: 'users',
  apiPrefix: '/api/users',
  actions: [getUsers, createNote],
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
}, async (input, ctx) => {
  // Example using ctx.db (when database is configured):
  // const users = await ctx.db.from('users').limit(input.limit ?? 10).exec()
  return {
    users: [
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ],
  }
})
`,
	)

	writeFileSync(
		join(projectDir, 'src', 'modules', 'create-note.ts'),
		`import { action, t, triggers } from 'bunbase'

export const createNote = action({
  name: 'users.createNote',
  description: 'Store a note in the KV store',
  input: t.Object({
    key: t.String(),
    content: t.String(),
    ttl: t.Optional(t.Number({ description: 'TTL in seconds' })),
  }),
  output: t.Object({
    success: t.Boolean(),
    key: t.String(),
  }),
  triggers: [triggers.api('POST', '/notes')],
}, async (input, ctx) => {
  await ctx.kv.set(\`note:\${input.key}\`, { content: input.content }, {
    ttl: input.ttl,
  })
  return { success: true, key: input.key }
})
`,
	)

	console.log(`
Project created successfully!

  cd ${projectName}
  bun install

Set up your database:
  # Update .env with your DATABASE_URL
  bunbase migrate        # Run initial migration

Start developing:
  bun run dev

Your API will be running at http://localhost:3000
  GET  /hello            → Hello world action
  GET  /api/users        → List users
  POST /api/users/notes  → Create a note (uses ctx.kv)

OpenAPI docs at http://localhost:3000/api/docs
`)
}
