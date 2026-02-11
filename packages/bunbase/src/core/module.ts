import type { ModuleConfig, ModuleDefinition } from './types.ts'

/**
 * Define a module — groups actions with shared guards and API prefix.
 *
 * Any folder with a `_module.ts` file that default-exports a `module()` call
 * becomes a module. The runtime auto-discovers these files.
 *
 * @example
 * ```ts
 * // src/modules/billing/_module.ts
 * import { module, guards } from 'bunbase'
 * import { createInvoice } from './create-invoice'
 * import { sendInvoice } from './send-invoice'
 *
 * export default module({
 *   name: 'billing',
 *   apiPrefix: '/billing',
 *   guards: [guards.authenticated()],
 *   actions: [createInvoice, sendInvoice],
 * })
 * ```
 */
export function module(config: ModuleConfig): ModuleDefinition {
	return { config }
}
