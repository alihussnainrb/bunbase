import { join } from 'node:path'
import { loadConfig } from '../../config/loader.ts'
import { createSQLPool } from '../../db/pool.ts'
import { Migrator } from '../../db/migrator.ts'

export async function migrateCommand(subcommand?: string, name?: string): Promise<void> {
	const config = await loadConfig()
	const sql = createSQLPool({ url: config.database?.url })
	const migrationsDir = join(process.cwd(), config.database?.migrations?.directory ?? 'migrations')
	const migrator = new Migrator(sql, migrationsDir)

	try {
		switch (subcommand) {
			case 'new': {
				if (!name) {
					console.error('Usage: bunbase migrate new <name>')
					process.exit(1)
				}
				const fileName = await migrator.createNew(name)
				console.log(`Created migration: ${migrationsDir}/${fileName}`)
				break
			}
			case 'status': {
				const statuses = await migrator.status()
				if (statuses.length === 0) {
					console.log('No migrations found.')
				} else {
					console.log('Migration Status:')
					console.log('─'.repeat(60))
					for (const s of statuses) {
						const icon = s.status === 'applied' ? '✓' : '○'
						const date = s.appliedAt ? ` (${new Date(s.appliedAt).toLocaleString()})` : ''
						console.log(`  ${icon} ${s.name}${date}`)
					}
				}
				break
			}
			default: {
				// Run pending migrations
				console.log('Running pending migrations...')
				const result = await migrator.run()
				if (result.applied.length === 0) {
					console.log('No pending migrations.')
				} else {
					for (const applied of result.applied) {
						console.log(`  ✓ ${applied}`)
					}
					console.log(`\nApplied ${result.applied.length} migration(s).`)
				}
				break
			}
		}
	} finally {
		sql.close()
	}
}
