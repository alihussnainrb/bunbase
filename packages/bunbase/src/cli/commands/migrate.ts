import { join } from 'node:path'
import { loadConfig } from '../../config/loader.ts'
import { Migrator } from '../../db/migrator.ts'
import { createSQLPool } from '../../db/pool.ts'

export async function migrateCommand(
	subcommand?: string,
	name?: string,
): Promise<void> {
	const config = await loadConfig()
	const sql = createSQLPool({ url: config.database?.url })
	const migrationsDir = join(
		process.cwd(),
		config.database?.migrations?.directory ?? 'bunbase/migrations',
	)
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
						const date = s.appliedAt
							? ` (${new Date(s.appliedAt).toLocaleString()})`
							: ''
						console.log(`  ${icon} ${s.name}${date}`)
					}
				}
				break
			}
			case 'rollback': {
				const steps = name ? parseInt(name, 10) : 1
				if (Number.isNaN(steps) || steps < 1) {
					console.error('Invalid number of steps. Usage: bunbase migrate rollback [steps]')
					process.exit(1)
				}
				console.log(`Rolling back ${steps} migration(s)...`)
				const result = await migrator.rollback(steps)
				if (result.rolled_back.length === 0) {
					console.log('No migrations to rollback.')
				} else {
					for (const rolled of result.rolled_back) {
						console.log(`  ✓ Rolled back: ${rolled}`)
					}
					console.log(`\nRolled back ${result.rolled_back.length} migration(s).`)
				}
				break
			}
			case 'reset': {
				console.log('⚠️  WARNING: This will DROP ALL TABLES and re-run migrations!')
				console.log('This action cannot be undone.')
				console.log('\nTo confirm, run: bunbase migrate reset --confirm')
				if (name !== '--confirm') {
					process.exit(0)
				}
				console.log('\nResetting database...')
				await migrator.reset()
				console.log('✓ Database reset complete.')
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
