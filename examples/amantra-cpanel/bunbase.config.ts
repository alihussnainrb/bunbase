import { defineConfig } from 'bunbase'

export default defineConfig({
	port: 3002,
	actionsDir: './src',
	database: {
		url:
			process.env.DATABASE_URL ||
			'postgresql://postgres:postgres@localhost:5432/amantra_cpanel',
	},
	storage: {
		provider: 'local',
		local: {
			basePath: './storage',
		},
	},
	mailer: {
		provider: 'smtp',
		from: {
			name: 'AMANTRA Control Panel',
			email: 'noreply@amantra.com',
		},
		smtp: {
			host: process.env.SMTP_HOST || 'smtp.gmail.com',
			port: Number(process.env.SMTP_PORT) || 587,
			secure: false,
			auth: {
				user: process.env.SMTP_USER || '',
				pass: process.env.SMTP_PASS || '',
			},
		},
	},
	sessionSecret:
		process.env.SESSION_SECRET || 'amantra-cpanel-secret-change-in-production',
})
