import { defineConfig } from 'bunup'

export default defineConfig({
    target: 'bun',
    entry: ['./src/index.ts'],
    format: 'esm',
    minify: true,
    sourcemap: true,
    clean: true,
})