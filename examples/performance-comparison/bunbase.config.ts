import { defineConfig } from 'bunbase'

export default defineConfig({
	port: 3000,
	actionsDir: './src',
	persistence: {
		enabled: false, // Disable WriteBuffer for performance testing
	},
})
