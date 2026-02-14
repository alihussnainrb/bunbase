import { join } from 'node:path'
import { loadConfig } from '../../config/loader.ts'
import { Seeder } from '../../db/seeder.ts'
import { createSQLPool } from '../../db/pool.ts'

export async function seedCommand(
	subcommand?: string,
	name?: string,
): Promise<void> {
	const config = await loadConfig()
	const sql = createSQLPool({ url: config.database?.url })
	const seedsDir = join(
		process.cwd(),
		config.database?.seeds?.directory ?? 'bunbase/seeds',
	)
	const seeder = new Seeder(sql, seedsDir)

	try {
		switch (subcommand) {
			case 'new': {
				if (!name) {
					console.error('Usage: bunbase seed new <name> [--sql]')
					process.exit(1)
				}
				// Check if --sql flag is present
				const type = process.argv.includes('--sql') ? 'sql' : 'ts'
				const fileName = await seeder.createNew(name, type)
				console.log(`Created seed: ${seedsDir}/${fileName}`)
				break
			}
			case 'status': {
				const statuses = await seeder.status()
				if (statuses.length === 0) {
					console.log('No seeds found.')
				} else {
					console.log('Seed Status:')
					console.log('─'.repeat(60))
					for (const s of statuses) {
						const icon = s.status === 'seeded' ? '✓' : '○'
						const date = s.seededAt
							? ` (${new Date(s.seededAt).toLocaleString()})`
							: ''
						console.log(`  ${icon} ${s.name}${date}`)
					}
				}
				break
			}
			case 'clear': {
				await seeder.clear()
				console.log('✓ Seed tracking cleared.')
				break
			}
			case 'fresh': {
				console.log('Running all seeds (fresh mode)...')
				const result = await seeder.run({ trackSeeds: true, fresh: true })
				if (result.seeded.length === 0) {
					console.log('No seeds to run.')
				} else {
					for (const seeded of result.seeded) {
						console.log(`  ✓ ${seeded}`)
					}
					console.log(`\nSeeded ${result.seeded.length} file(s).`)
				}
				break
			}
			default: {
				// Run seeds
				console.log('Running seeds...')
				const result = await seeder.run()
				if (result.seeded.length === 0) {
					console.log('No seeds to run.')
				} else {
					for (const seeded of result.seeded) {
						console.log(`  ✓ ${seeded}`)
					}
					console.log(`\nSeeded ${result.seeded.length} file(s).`)
				}
				break
			}
		}
	} finally {
		sql.close()
	}
}
