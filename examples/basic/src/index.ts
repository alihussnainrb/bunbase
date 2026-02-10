import { ActionRegistry, BunbaseServer, Logger, loadActions, WriteBuffer } from 'bunbase'
import { resolve } from 'path'

const logger = new Logger({ level: 'debug' })
const registry = new ActionRegistry()
const writeBuffer = new WriteBuffer()

// Load actions
const actionsDir = resolve(process.cwd(), 'src/actions')
console.log(`Loading actions from ${actionsDir}`)

await loadActions(actionsDir, registry)

const server = new BunbaseServer(registry, logger, writeBuffer)

console.log('Starting server on port 3000...')
server.start({ port: 3000 })
