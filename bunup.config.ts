import { defineWorkspace } from 'bunup'

export default defineWorkspace([
	{
		name: 'bunbase',
		root: 'packages/bunbase',
		config: {
			target: 'bun',
			entry: [
				'./src/index.ts',
				'./src/cli/index.ts',
				'./src/db/client.ts',
				'./src/db/types.ts',
				'./src/logger/index.ts',
			],
			format: 'esm',
			minify: true,
			sourcemap: true,
			clean: true,
			dts: true,
		},
	},
	// Studio uses Vite for building, not bunup.
	// Build it separately with: cd packages/studio && bun run build
])
