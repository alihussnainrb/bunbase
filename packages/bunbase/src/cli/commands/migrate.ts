import { join } from 'node:path'
import { loadConfig } from '../../config/loader.ts'
import { Migrator } from '../../db/migrator.ts'
import { createSQLPool } from '../../db/pool.ts'

export async function migrateCommand(
	subcommand?: string,
	name?: string,
	options?: { dryRun?: boolean },
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
			default: {
				// Run pending migrations (or preview with --dry-run)
				const isDryRun = options?.dryRun ?? false

				if (isDryRun) {
					console.log('Preview: Pending migrations (dry-run mode)')
					console.log('─'.repeat(60))
				} else {
					console.log('Running pending migrations...')
				}

				const result = await migrator.run({ dryRun: isDryRun })

				if (isDryRun && result.preview) {
					// Dry-run mode: show preview
					if (result.preview.length === 0) {
						console.log('No pending migrations.')
					} else {
						for (const p of result.preview) {
							console.log(`\n📄 ${p.file}`)
							console.log('─'.repeat(60))
							if (p.operations.length > 0) {
								console.log('Operations:')
								for (const op of p.operations) {
									console.log(`  • ${op}`)
								}
							} else {
								console.log('  (No recognized SQL operations)')
							}
							console.log('\nSQL:')
							console.log(p.sql.trim())
						}
						console.log('\n─'.repeat(60))
						console.log(
							`\n${result.preview.length} migration(s) ready to apply.`,
						)
						console.log('Run without --dry-run to execute.')
					}
				} else {
					// Normal mode: apply migrations
					if (result.applied.length === 0) {
						console.log('No pending migrations.')
					} else {
						for (const applied of result.applied) {
							console.log(`  ✓ ${applied}`)
						}
						console.log(`\nApplied ${result.applied.length} migration(s).`)
					}
				}
				break
			}
		}
	} finally {
		sql.close()
	}
}
