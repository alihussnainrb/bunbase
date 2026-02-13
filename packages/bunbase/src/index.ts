// ── Public API ───────────────────────────────────────────
// import { action, module, t, http, triggers, guards, defineConfig } from 'bunbase'

// Auth utilities (used in action handlers for session management)
export * from './auth/password.ts'
export * from './auth/session.ts'
export type { BunbaseConfig } from './config/types.ts'
// Config
export { defineConfig } from './config/types.ts'
// Action + Module primitives
export { ActionValidationError, action } from './core/action.ts'
// Guards
export * from './core/guards/index.ts'
export { module } from './core/module.ts'
// Trigger builders
export { triggers } from './core/triggers/index.ts'
// Types (used by action/module authors)
export type {
	ActionConfig,
	ActionContext,
	ActionDefinition,
	ActionHandler,
	ActionOutput,
	ApiTriggerConfig,
	CronTransportMeta,
	CronTriggerConfig,
	EventTransportMeta,
	EventTriggerConfig,
	GuardFn,
	HttpMetadata,
	HttpMethod,
	HttpTransportMeta,
	McpTransportMeta,
	ModuleConfig,
	ModuleDefinition,
	RetryConfig,
	ToolTriggerConfig,
	TransportMetadata,
	TriggerConfig,
	WebhookTriggerConfig,
} from './core/types.ts'
export type {
	BaseDatabase,
	Database,
	DatabaseClient,
	GeneratedDatabase,
} from './db/client.ts'
// Database client and types
export { createDB } from './db/client.ts'
// IAM (Identity & Access Management)
export type {
	AuthContext,
	IAMManager,
	Organization,
	OrgMembership,
	Permission,
	Role,
	RolePermission,
	SessionAction,
	Subscription,
} from './iam/index.ts'
export {
	buildAuthContext,
	createAuthContext,
	createIAMManager,
	hasPermission,
	OrgManager,
	RoleManager,
	resolvePermissions,
	SubscriptionManager,
	UsersManager,
} from './iam/index.ts'
// Key-value store types (for custom store implementations)
export type { KVStore } from './kv/types.ts'
export type { LoggerOptions, LogLevel, LogListener } from './logger/index.ts'
// Logger (useful for custom logging in action handlers)
export { Logger, LoggerSession } from './logger/index.ts'
// Mailer adapter types (for custom adapter implementations)
export type {
	EmailAttachment,
	MailerAdapter,
	SendEmailOptions,
} from './mailer/types.ts'
// Storage adapter types (for custom adapter implementations)
export type { StorageAdapter, UploadOptions } from './storage/types.ts'
export type { TestActionOptions, TestActionResult } from './test/index.ts'
// Test utilities (for testing actions)
export { testAction } from './test/index.ts'
// Error classes
export * from './utils/errors.ts'
export type { CookieOptions } from './utils/typebox.ts'
// TypeBox schema builder (re-exported as `t`) and HTTP mapping utilities
export { http, t } from './utils/typebox.ts'
// Transport metadata helper
export { withMeta } from './utils/with-meta.ts'
