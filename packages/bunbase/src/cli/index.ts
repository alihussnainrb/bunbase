import { Command } from 'commander'
import { devCommand } from './commands/dev.ts'
import { generateCommand } from './commands/generate.ts'
import { initCommand } from './commands/init.ts'
import { migrateCommand } from './commands/migrate.ts'
import { typegenCommand } from './commands/typegen.ts'

const version = '0.0.9'

export const program: Command = new Command()

program
	.name('bunbase')
	.description('Bun-native backend framework')
	.version(version)

program
	.command('dev')
	.description('Start the development server')
	.action(async () => {
		await devCommand()
	})

program
	.command('init <name>')
	.description('Scaffold a new Bunbase project')
	.action(async (name: string) => {
		await initCommand(name)
	})

program
	.command('generate <type> <name>')
	.alias('g')
	.description('Generate an action or module scaffold')
	.action(async (type: string, name: string) => {
		await generateCommand(type, name)
	})

const migrate = program
	.command('migrate [subcommand] [name]')
	.description('Run database migrations')
	.action(async (subcommand?: string, name?: string) => {
		await migrateCommand(subcommand, name)
	})

migrate
	.command('new <name>')
	.description('Create a new migration file')
	.action(async (name: string) => {
		await migrateCommand('new', name)
	})

migrate
	.command('status')
	.description('Show migration status')
	.action(async () => {
		await migrateCommand('status')
	})

const typegen = program
	.command('typegen')
	.description('Generate TypeScript types (use typegen:db or typegen:react)')

typegen
	.command('db')
	.description('Generate TypeScript types from database schema')
	.option('--schema <schema>', 'PostgreSQL schema to introspect', 'public')
	.option('--output <path>', 'Output file path', '.bunbase/database.d.ts')
	.action(async (opts: { schema?: string; output?: string }) => {
		await typegenCommand('db', opts)
	})

typegen
	.command('react')
	.description('Generate TypeScript types from Bunbase backend API')
	.requiredOption('--url <url>', 'Backend URL (e.g., http://localhost:3000)')
	.option('--output <path>', 'Output file path', '.bunbase/api.d.ts')
	.action(async (opts: { url: string; output?: string }) => {
		await typegenCommand('react', opts)
	})

// Parse CLI arguments when run directly (bin entry)
program.parse(process.argv)
