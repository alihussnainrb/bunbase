import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import type { ActionRegistry } from '../core/registry.ts'
import type { Logger } from '../logger/index.ts'
import type { WriteBuffer } from '../persistence/write-buffer.ts'
import { executeAction } from './executor.ts'

export class McpService {
    private server: Server
    private transport: StdioServerTransport | null = null

    constructor(
        private readonly registry: ActionRegistry,
        private readonly logger: Logger,
        private readonly writeBuffer: WriteBuffer,
    ) {
        this.server = new Server(
            {
                name: 'bunbase',
                version: '0.0.1',
            },
            {
                capabilities: {
                    tools: {},
                },
            },
        )

        this.setupHandlers()
    }

    private setupHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            const tools = []
            for (const action of this.registry.getAll()) {
                for (const trigger of action.triggers) {
                    if (trigger.type === 'tool') {
                        tools.push({
                            name: trigger.name,
                            description: trigger.description,
                            inputSchema: action.definition.config.input as any,
                        })
                    }
                }
            }
            return { tools }
        })

        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params
            // const context = request.params._meta // Context from client if any

            for (const action of this.registry.getAll()) {
                for (const trigger of action.triggers) {
                    if (trigger.type === 'tool' && trigger.name === name) {
                        try {
                            const result = await executeAction(action, args, {
                                triggerType: 'tool',
                                logger: this.logger,
                                writeBuffer: this.writeBuffer,
                            })

                            if (result.success) {
                                return {
                                    content: [
                                        {
                                            type: 'text',
                                            text: JSON.stringify(result.data, null, 2),
                                        },
                                    ],
                                }
                            }

                            return {
                                content: [
                                    {
                                        type: 'text',
                                        text: `Error: ${result.error}`,
                                    },
                                ],
                                isError: true,
                            }
                        } catch (err: any) {
                            return {
                                content: [
                                    {
                                        type: 'text',
                                        text: `Internal Error: ${err.message}`,
                                    },
                                ],
                                isError: true,
                            }
                        }
                    }
                }
            }

            throw new Error(`Tool not found: ${name}`)
        })
    }

    async start(): Promise<void> {
        this.transport = new StdioServerTransport()
        await this.server.connect(this.transport)
        this.logger.info('MCP Server started on stdio')
    }

    async stop(): Promise<void> {
        await this.server.close()
    }
}
