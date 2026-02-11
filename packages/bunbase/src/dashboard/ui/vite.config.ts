import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [react()],
	build: {
		outDir: 'dist',
		emptyOutDir: true,
	},
	server: {
		port: 3001,
		proxy: {
			'/_admin/api': {
				target: 'http://localhost:3000',
				changeOrigin: true,
			},
		},
	},
})
