import { SQL } from 'bun'

// Connect to postgres database to create testdb
const sql = new SQL('postgresql://postgres:123456@localhost:5432/postgres')

try {
	await sql`CREATE DATABASE testdb`
	console.log('✓ Database "testdb" created successfully')
} catch (err: any) {
	if (err.message?.includes('already exists')) {
		console.log('✓ Database "testdb" already exists')
	} else {
		console.error('Error creating database:', err.message)
		process.exit(1)
	}
} finally {
	sql.close()
}
