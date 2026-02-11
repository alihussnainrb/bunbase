import { defineConfig } from 'bunbase'

export default defineConfig({
	port: 3000,
	actionsDir: 'src',
	auth: {
		sessionSecret: 'dev-secret-change-me-in-production',
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
