import { defineWorkspace } from 'bunup'

export default defineWorkspace([
	{
		name: 'bunbase',
		root: 'packages/bunbase',
		config: {
			target: 'bun',
			entry: './src/index.ts',
			format: 'esm',
			minify: true,
			sourcemap: true,
			clean: true,
		},
	},
	{
		name: 'studio',
		root: 'packages/studio',
		config: {
			target: 'bun',
			entry: './src/main.tsx',
			format: 'esm',
			minify: true,
			sourcemap: true,
			clean: true,
		},
	},
])
