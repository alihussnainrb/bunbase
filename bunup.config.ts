import { defineWorkspace } from 'bunup'

export default defineWorkspace([
	{
		name: 'bunbase',
		root: 'packages/bunbase',
		config: {
			target: 'bun',
			entry: ['./src/index.ts', './src/cli/index.ts'],
			format: 'esm',
			minify: true,
			sourcemap: true,
			clean: true,
			dts: true,
		},
	},
	{
		name: "@bunbase/react",
		root: 'packages/react',
		config: {
			target: 'bun',
			entry: ['./src/index.ts'],
			format: 'esm',
			minify: true,
			sourcemap: true,
			clean: true,
			dts: true,
		},
	}
	// Studio uses Vite for building, not bunup.
	// Build it separately with: cd packages/studio && bun run build
])
