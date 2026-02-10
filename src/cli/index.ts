import { Command } from 'commander'
import { devCommand } from './commands/dev.ts'

const version = '0.0.1'

export const program: Command = new Command()

program
    .name('bunbase')
    .description('Bun-native backend framework')
    .version(version)

program.command('dev')
    .description('Start the development server')
    .action(async () => {
        await devCommand()
    })

// program.parse()
// We export program to be called by bin entry
