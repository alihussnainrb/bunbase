import { ActionRegistry } from '../core/registry.ts'
import type { ActionContext, ActionDefinition } from '../core/types.ts'
import type { DatabaseClient } from '../db/client.ts'
import type { RunEntry } from '../persistence/types.ts'
import type { WriteBuffer } from '../persistence/write-buffer.ts'
import { executeAction } from '../runtime/executor.ts'

export interface TestActionOptions {
	/** Partial auth context for testing */
	auth?: Partial<ActionContext['auth']>
	/** Partial database client mock */
	db?: Partial<DatabaseClient>
	/** Custom logger mock */
	logger?: any
	/** Whether to capture run entries (default: true) */
	captureWrites?: boolean
	/** Request object for API/webhook triggers */
	request?: Request
	/** Trigger type (default: 'api') */
	triggerType?: string
}

export interface TestActionResult<TOutput> {
	/** Whether the action succeeded */
	success: boolean
	/** Output data if successful */
	data?: TOutput
	/** Error message if failed */
	error?: string
	/** Error object if failed */
	errorObject?: Error
	/** Captured run entries (empty if captureWrites=false) */
	runs: RunEntry[]
}

/**
 * Test helper to execute an action with minimal setup.
 * Automatically creates registry, mocks, and captures run entries.
 *
 * Example:
 * ```typescript
 * const result = await testAction(myAction, { name: 'World' }, {
 *   auth: { userId: 'test-123' },
 * })
 * expect(result.success).toBe(true)
 * expect(result.data).toEqual({ message: 'Hello, World' })
 * ```
 */
export async function testAction<TInput, TOutput>(
	actionDef: ActionDefinition<TInput, TOutput>,
	input: TInput,
	opts: TestActionOptions = {},
): Promise<TestActionResult<TOutput>> {
	// Create minimal mocks
	const runs: RunEntry[] = []

	const mockWriteBuffer: WriteBuffer = {
		pushLog: () => {},
		pushRun: (entry: RunEntry) => {
			if (opts.captureWrites !== false) {
				runs.push(entry)
			}
		},
		flush: async () => {},
		shutdown: async () => {},
		stats: { logs: 0, runs: 0 },
	} as any

	const mockLogger = opts.logger || {
		info: () => {},
		error: () => {},
		debug: () => {},
		warn: () => {},
		child: function (this: any) {
			return this
		},
	}

	// Register action
	const registry = new ActionRegistry()
	registry.registerAction(actionDef)
	const registered = registry.get(actionDef.config.name)

	if (!registered) {
		throw new Error(
			`Failed to register action: ${actionDef.config.name}. This should never happen.`,
		)
	}

	// Execute
	const result = await executeAction(registered, input, {
		triggerType: opts.triggerType || 'api',
		logger: mockLogger,
		writeBuffer: mockWriteBuffer,
		db: opts.db as any,
		auth: opts.auth,
		request: opts.request,
	})

	return {
		...result,
		runs,
	} as TestActionResult<TOutput>
}
