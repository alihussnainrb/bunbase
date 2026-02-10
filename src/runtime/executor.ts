import type { RegisteredAction } from '../core/registry.ts'
import type { ActionContext } from '../core/types.ts'
import type { Logger } from '../logger/index.ts'
import type { RunEntry } from '../persistence/types.ts'
import type { WriteBuffer } from '../persistence/write-buffer.ts'
import { eventBus } from './event-bus.ts'

/**
 * Executes a registered action through the full pipeline:
 *   1. Build action context
 *   2. Run guards (module guards first, then action guards)
 *   3. Run handler with validated input
 *   4. Record run entry to WriteBuffer
 */
export async function executeAction(
    action: RegisteredAction,
    input: unknown,
    opts: {
        triggerType: string
        request?: Request
        logger: Logger
        writeBuffer: WriteBuffer
        db?: unknown
        auth?: {
            userId?: string
            role?: string
            permissions?: string[]
            [key: string]: unknown
        },
        response?: {
            headers: Headers
            setCookie: (name: string, value: string, opts?: any) => void
        }
    },
): Promise<{ success: boolean; data?: unknown; error?: string }> {
    const traceId = generateTraceId()
    const startedAt = Date.now()

    // Create child logger for this action invocation
    const actionLogger = opts.logger.child({
        action: action.definition.config.name,
        module: action.moduleName,
        traceId,
    })

    // Build context
    const ctx: ActionContext = {
        db: (opts.db ?? null) as any,
        logger: actionLogger,
        traceId,
        event: {
            emit: (name: string, payload?: unknown) => {
                eventBus.emit(name, payload)
            },
        },
        auth: opts.auth ?? {},
        module: action.moduleName ? { name: action.moduleName } : undefined,
        response: opts.response,
        request: opts.request,
    }

    try {
        // Run guards
        for (const guard of action.guards) {
            await guard(ctx)
        }

        // Run handler (validation is baked into the wrapped handler)
        const result = await action.definition.handler(input as never, ctx)

        // Record successful run
        const runEntry: RunEntry = {
            id: traceId,
            action_name: action.definition.config.name,
            module_name: action.moduleName,
            trace_id: traceId,
            trigger_type: opts.triggerType,
            status: 'success',
            input: safeStringify(input),
            output: safeStringify(result),
            error: null,
            duration_ms: Date.now() - startedAt,
            started_at: startedAt,
        }
        opts.writeBuffer.pushRun(runEntry)

        return { success: true, data: result }
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)

        actionLogger.error(`Action failed: ${errorMessage}`)

        // Record failed run
        const runEntry: RunEntry = {
            id: traceId,
            action_name: action.definition.config.name,
            module_name: action.moduleName,
            trace_id: traceId,
            trigger_type: opts.triggerType,
            status: 'error',
            input: safeStringify(input),
            output: null,
            error: errorMessage,
            duration_ms: Date.now() - startedAt,
            started_at: startedAt,
        }
        opts.writeBuffer.pushRun(runEntry)

        // Determine HTTP status
        // const status = err instanceof ActionValidationError ? 400 : 500

        return { success: false, error: errorMessage }
    }
}

function generateTraceId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function safeStringify(value: unknown): string | null {
    if (value === undefined || value === null) return null
    try {
        return JSON.stringify(value)
    } catch {
        return null
    }
}
