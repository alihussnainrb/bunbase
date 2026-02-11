import { Command } from 'commander'
import { devCommand } from './commands/dev.ts'
import { initCommand } from './commands/init.ts'
import { generateCommand } from './commands/generate.ts'

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
	.command('init [name]')
	.description('Scaffold a new Bunbase project')
	.action(async (name?: string) => {
		await initCommand(name)
	})

program
	.command('generate <type> <name>')
	.alias('g')
	.description('Generate an action or module scaffold')
	.action(async (type: string, name: string) => {
		await generateCommand(type, name)
	})

// Export program to be called by bin entry
