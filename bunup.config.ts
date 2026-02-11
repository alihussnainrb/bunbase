// import { defineConfig } from 'bunup'

// export default defineConfig({
//     target: 'bun',
//     entry: ['./src/index.ts'],
//     format: 'esm',
//     minify: true,
//     sourcemap: true,
//     clean: true,
// })

import { defineWorkspace } from 'bunup';

export default defineWorkspace([
    {
        name: "bunbase",
        root: "packages/bunbase",
        config: {
            target: "bun",
            entry: "./src/index.ts",
            format: "esm",
            minify: true,
            sourcemap: true,
            clean: true
        }
    }
])