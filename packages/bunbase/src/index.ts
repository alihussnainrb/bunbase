// ── Public API ───────────────────────────────────────────
// import { action, module, t, triggers } from 'bunbase'

// TypeBox schema builder (re-exported as `t`)
export { default as t } from 'typebox'
export * from './auth/password.ts'
export * from './auth/session.ts'
// Action + Module primitives
export { ActionValidationError, action } from './core/action.ts'
export { module } from './core/module.ts'
export { ActionRegistry } from './core/registry.ts'
// Types
export type {
	ActionConfig,
	ActionContext,
	ActionDefinition,
	ActionHandler,
	ApiTriggerConfig,
	CronTriggerConfig,
	EventTriggerConfig,
	GuardFn,
	HttpMethod,
	ModuleConfig,
	ModuleDefinition,
	ToolTriggerConfig,
	TriggerConfig,
	WebhookTriggerConfig,
} from './core/types.ts'
export * from './guards/index.ts'
// Logger
export { Logger, LoggerSession } from './logger/index.ts'
export type {
	LogEntry,
	RunEntry,
	WriteBufferOptions,
} from './persistence/types.ts'
export * from './persistence/write-buffer.ts'
export { loadActions } from './runtime/loader.ts'
export * from './runtime/mcp-server.ts'
export * from './runtime/scheduler.ts'
// Runtime
export { BunbaseServer } from './runtime/server.ts'
export * from './saas/organizations.ts'
export * from './saas/plans.ts'
export * from './saas/role-sets.ts'
export * from './saas/roles.ts'
export * from './saas/subscriptions.ts'
export * from './saas/types.ts'
// Trigger builders
export { triggers } from './triggers/index.ts'
// View primitives
export { html, renderJSX, view } from './views/view.ts'
export { ViewRegistry } from './views/view-registry.ts'
