// ── Public API ───────────────────────────────────────────
// import { action, module, t, triggers, guards, defineConfig } from 'bunbase'

// TypeBox schema builder (re-exported as `t`)
export { default as t } from 'typebox'

// Config
export { defineConfig } from './config/types.ts'
export type { BunbaseConfig } from './config/types.ts'

// Action + Module primitives
export { ActionValidationError, action } from './core/action.ts'
export { module } from './core/module.ts'

// Types (used by action/module authors)
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

// Guards
export * from './core/guards/index.ts'

// Trigger builders
export { triggers } from './core/triggers/index.ts'

// Auth utilities (used in action handlers for session management)
export * from './auth/password.ts'
export * from './auth/session.ts'

// Error classes
export * from './utils/errors.ts'

// SaaS services (used in action handlers)
export * from './saas/organizations.ts'
export * from './saas/plans.ts'
export * from './saas/role-sets.ts'
export * from './saas/roles.ts'
export * from './saas/subscriptions.ts'
export * from './saas/types.ts'

// Logger (useful for custom logging in action handlers)
export { Logger, LoggerSession } from './logger/index.ts'

// Storage adapter types (for custom adapter implementations)
export type { StorageAdapter, UploadOptions } from './storage/types.ts'

// Key-value store types (for custom store implementations)
export type { KVStore } from './kv/types.ts'
