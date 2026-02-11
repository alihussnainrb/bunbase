import { defineConfig } from 'bunbase'

export default defineConfig({
  port: 3000,
  actionsDir: 'src',
  database: {
    url: process.env.DATABASE_URL,
  },
  migrations: {
    directory: 'migrations',
  },
  storage: {
    adapter: 'local',
    local: { directory: '.storage' },
  },
  openapi: {
    enabled: true,
    title: 'my-saas-app API',
    version: '1.0.0',
  },
  studio: {
    enabled: true,
  },
})
