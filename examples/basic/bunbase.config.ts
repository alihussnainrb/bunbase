import { defineConfig } from 'bunbase'

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
	auth: {
		sessionSecret: process.env.SESSION_SECRET ?? 'dev-secret-change-me-in-production',
	},
	openapi: {
		enabled: true,
		path: '/api/openapi.json',
		title: 'Bunbase Basic Example',
		version: '0.1.0',
	},
	studio: {
		enabled: true,
	},
	persistence: {
		enabled: true,
	},
})
