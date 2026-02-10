// ── Public API ───────────────────────────────────────────
// import { action, module, t, triggers } from 'bunbase'

// TypeBox schema builder (re-exported as `t`)
export { default as t } from 'typebox'

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
// Logger
export { Logger, LoggerSession } from './logger/index.ts'
export type {
    LogEntry,
    RunEntry,
    WriteBufferOptions,
} from './persistence/types.ts'

// Persistence
export { WriteBuffer } from './persistence/write-buffer.ts'
export { loadActions } from './runtime/loader.ts'
// Runtime
export { BunbaseServer } from './runtime/server.ts'
// Trigger builders
export { triggers } from './triggers/index.ts'
