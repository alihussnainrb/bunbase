# Bunbase Implementation Vision

## Core Philosophy

Bunbase is a Bun-native backend framework where **actions are the primitive** — every piece of business logic is an action with typed I/O, and triggers determine *how* it gets invoked.

```
Action  = What happens (business logic + typed I/O)
Trigger = How it gets invoked (HTTP, event, cron, AI tool, webhook)
Guard   = Who can invoke it (auth, RBAC, features, rate limits)
Context = What it has access to (db, logger, queue, auth)
```

---

## Current Implementation Status

### ✅ Completed (Phases 1-4)

#### Phase 1: Core Primitives
- [x] `action()` definition function with TypeBox I/O validation
- [x] `module()` definition function with `_module.ts` discovery
- [x] `triggers.api()` — HTTP trigger with Bun.serve
- [x] `ActionRegistry` with file-based auto-discovery
- [x] Context injection (db, logger, traceId)
- [x] Runtime executor (validate input → run handler → validate output)
- [x] `WriteBuffer` — buffered persistence for logs + run history

#### Phase 2: All Trigger Types
- [x] `triggers.event()` — internal event bus (EventEmitter)
- [x] `triggers.cron()` — Bun cron scheduling
- [x] `triggers.tool()` — MCP server integration for LLM agents
- [x] `triggers.webhook()` — webhook verification + mapping

#### Phase 3: Guards + Auth
- [x] Guard pipeline in executor (module guards → action guards → handler)
- [x] Auth module (session management, password hashing via Bun.password)
- [x] Built-in guards: `authenticated()`, `hasRole()`, `hasPermission()`, `rateLimit()`

#### Phase 4: SaaS Cockpit
- [x] Organizations module (CRUD, memberships, invitations)
- [x] RBAC module (roles, permissions, role sets)
- [x] Plans & features module
- [x] Subscriptions & billing module
- [x] SaaS guards: `inOrg()`, `hasFeature()`, `trialActiveOrPaid()`

### 🚧 Pending (Phase 5)

- [ ] Developer dashboard (actions, run history, logs, scheduled jobs)
- [ ] Auto-generated OpenAPI spec from action schemas
- [ ] Postgres-backed job queue

---

## Architecture Deep Dive

### 1. Action Primitive

The fundamental unit of work. Every action has:

```typescript
import { action, t } from 'bunbase'

export default action({
  name: 'createUser',
  description: 'Creates a new user account',
  input: t.Object({
    email: t.String({ format: 'email' }),
    name: t.String(),
    role: t.Optional(t.Union([t.Literal('user'), t.Literal('admin')])),
  }),
  output: t.Object({
    id: t.String(),
    email: t.String(),
  }),
  triggers: [ /* ... */ ],
  guards: [ /* ... */ ],
}, async (input, ctx) => {
  // Business logic with fully typed input + ctx
  return { id: '...', email: input.email }
})
```

**Implementation:** `src/core/action.ts`
- Pre-compiles TypeBox validators at definition time
- Wrapped handler validates input → runs business logic → validates output
- Throws `ActionValidationError` on validation failures

### 2. Module System (`_module.ts`)

Any folder with a `_module.ts` file becomes a module. Modules group actions and apply shared config.

```typescript
// src/modules/billing/_module.ts
import { module, guards } from 'bunbase'
import { createInvoice } from './create-invoice'
import { sendInvoice } from './send-invoice'
import { processPayment } from './process-payment'

export default module({
  name: 'billing',
  description: 'Invoice and payment processing',
  apiPrefix: '/billing',              // All actions get /billing prefix
  guards: [
    guards.authenticated(),
    guards.inOrg(),
    guards.hasFeature('billing'),
  ],
  actions: [createInvoice, sendInvoice, processPayment],
})
```

**Guard Cascade:**
```
Module guards run first → Action guards run second
1. guards.authenticated()      ← from module
2. guards.inOrg()              ← from module  
3. guards.hasFeature('billing') ← from module
4. guards.hasPermission('invoices:create') ← from action
5. custom guard fn             ← from action
```

**Implementation:** `src/core/module.ts`, `src/core/registry.ts`

### 3. Trigger System

Triggers are declarative bindings connecting actions to entry points. One action can have multiple triggers.

```typescript
triggers: [
  // REST API endpoint
  triggers.api('POST', '/users', { map: (req) => req.body }),
  
  // Internal event bus
  triggers.event('user.invited', { map: (payload) => payload.data }),
  
  // Cron schedule
  triggers.cron('0 2 * * *', { input: () => ({ dryRun: true }) }),
  
  // MCP tool for AI agents
  triggers.tool({ name: 'create_user', description: 'Create a user account' }),
  
  // Incoming webhook with signature verification
  triggers.webhook('/webhooks/stripe', {
    verify: (req) => verifyStripeSignature(req),
    map: (event) => ({ email: event.data.object.email }),
  }),
]
```

**Input Mapping Defaults:**
- `triggers.api()`: POST/PUT/PATCH → `req.json()`, GET/DELETE → `url.searchParams`
- `triggers.event()`: Raw event payload
- `triggers.cron()`: Static `input` function or empty object
- `triggers.tool()`: Tool call arguments (auto-mapped from input schema)
- `triggers.webhook()`: Raw body after `verify()` passes

**Implementation:** `src/triggers/index.ts`

### 4. Guard System

Guards are async functions that run before the action handler. They form a pipeline — if any guard throws, the action is rejected.

```typescript
guards: [
  guards.authenticated(),                           // Must be logged in
  guards.hasPermission('invoices:create'),           // RBAC check
  guards.inOrg(),                                    // Must have org context
  guards.hasFeature('invoicing'),                    // Plan/feature gating
  guards.rateLimit({ limit: 10, windowMs: 60000 }),  // Anti-abuse (per key)
  
  // Custom guard — just a function
  async (ctx) => {
    if (ctx.org?.memberCount >= ctx.org?.plan.maxUsers) {
      throw new GuardError('User limit reached', 403)
    }
  },
]
```

**Guard Error Handling:**
- Guards throw `GuardError` with status codes
- Executor maps errors to HTTP status:
  - 400: Validation errors
  - 401: `authenticated()` fails
  - 403: `hasRole()`, `hasPermission()`, `inOrg()`, `hasFeature()` fail
  - 429: `rateLimit()` exceeded
  - 500: All other errors

**Implementation:** `src/guards/index.ts`, `src/guards/saas.ts`, `src/runtime/executor.ts`

### 5. Action Context (`ctx`)

Every action handler receives a fully typed `ctx` object:

```typescript
async (input, ctx) => {
  const { db, logger, traceId, event, queue, auth, org, module, request, response } = ctx

  // Typed DB queries
  const user = await db.from('users').insert({ email: input.email, ... })

  // Structured logging with trace ID
  logger.info('User created', { userId: user.id })

  // Emit events (triggers other actions)
  event.emit('user.created', { userId: user.id })

  // Queue background jobs
  await queue.add('sendWelcomeEmail', { userId: user.id })

  // Auth context (populated by guards)
  const userId = auth.userId      // Current user ID
  const orgId = auth.orgId        // Current org ID
  const role = auth.role          // User's role in org
  const permissions = auth.permissions  // User's permissions

  // Org context (populated by inOrg guard)
  const plan = org?.plan          // Current plan
  const features = org?.features  // Enabled features

  // Set cookies (only for API/webhook triggers)
  response?.setCookie('session', token, { httpOnly: true, secure: true })
}
```

**Implementation:** `src/core/types.ts`, `src/runtime/executor.ts`

### 6. Runtime Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Bunbase Runtime                          │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Loader    │  │   Server    │  │     Scheduler       │  │
│  │             │  │             │  │                     │  │
│  │ - Discover  │  │ - Routes    │  │ - Cron triggers     │  │
│  │ - Register  │  │ - Events    │  │ - Execute actions   │  │
│  │ - Modules   │  │ - Auth      │  │                     │  │
│  │ - Actions   │  │ - Cookies   │  │                     │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         │                │                    │             │
│         └────────────────┼────────────────────┘             │
│                          ▼                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                    ActionRegistry                    │    │
│  │  - actions: Map<string, RegisteredAction>            │    │
│  │  - registerAction()                                  │    │
│  │  - registerModule()                                  │    │
│  └─────────────────────────┬───────────────────────────┘    │
│                            ▼                                │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                  executeAction()                     │    │
│  │  1. Build context (db, logger, traceId, event)      │    │
│  │  2. Run guards (module → action)                     │    │
│  │  3. Run handler (with I/O validation)                │    │
│  │  4. Record run to WriteBuffer                          │    │
│  └─────────────────────────┬───────────────────────────┘    │
│                            ▼                                │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                   WriteBuffer                          │    │
│  │  - In-memory ring buffer for logs + runs             │    │
│  │  - Periodic flush (default: 2s or 500 items)         │    │
│  │  - Batch INSERT to Postgres on flush                   │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 7. SaaS Cockpit Database Schema

**Users & Auth:**
```sql
users (id, email, name, password_hash, email_verified_at)
sessions (id, user_id, token_hash, expires_at)
```

**Organizations:**
```sql
organizations (id, name, slug, owner_id, created_at)
org_memberships (id, user_id, org_id, role_id, joined_at)
org_invitations (id, org_id, email, role_id, status, expires_at)
```

**RBAC:**
```sql
roles (id, key, name, description, is_system)
permissions (id, key, name, feature_id)
role_permissions (role_id, permission_id)
role_sets (id, key, name, is_primary, is_default)
role_set_roles (role_set_id, role_id, is_creator_role, is_default_member_role)
```

**Billing & Features:**
```sql
features (id, key, name, description)
plans (id, key, name, price_cents, interval, trial_days, is_public)
plan_features (plan_id, feature_id, limit)
subscriptions (id, org_id, plan_id, status, trial_ends_at, current_period_end)
```

**Action System:**
```sql
action_runs (id, action_name, module_name, trace_id, trigger_type, status, input, output, error, duration_ms, started_at)
action_logs (id, run_id, level, message, meta, created_at)
scheduled_jobs (id, action_name, cron_expression, next_run_at, last_run_id, enabled)
```

**Permission Format:** `<feature>:<action>`
- `invoices:create`, `invoices:read`, `invoices:delete`
- `analytics:view`, `members:manage`, `billing:manage`

Permission check logic:
1. Does org's plan include this feature?
2. Does user's role grant this permission?

### 8. Project Structure

```
bunbase/
├── src/
│   ├── index.ts              # Main exports: action, module, t, triggers, guards
│   ├── core/
│   │   ├── action.ts         # action() definition + TypeBox validation
│   │   ├── module.ts         # module() definition
│   │   ├── types.ts          # All type definitions
│   │   └── registry.ts       # ActionRegistry
│   ├── triggers/
│   │   ├── index.ts          # triggers.api(), .event(), .cron(), .tool(), .webhook()
│   │   └── types.ts          # Trigger type definitions
│   ├── guards/
│   │   ├── index.ts          # Standard guards (authenticated, hasRole, etc.)
│   │   ├── saas.ts           # SaaS guards (inOrg, hasFeature, etc.)
│   │   └── types.ts          # Guard type definitions
│   ├── runtime/
│   │   ├── server.ts         # Bun HTTP server + router
│   │   ├── loader.ts         # Auto-discovery of _module.ts + actions
│   │   ├── executor.ts       # executeAction() pipeline
│   │   ├── event-bus.ts      # In-process event bus
│   │   ├── scheduler.ts      # Cron scheduler
│   │   ├── mcp-server.ts     # MCP server for AI tools
│   │   └── queue.ts          # Postgres-backed queue (pending)
│   ├── persistence/
│   │   ├── write-buffer.ts   # In-memory buffer + periodic flush
│   │   └── types.ts          # LogEntry, RunEntry types
│   ├── auth/
│   │   ├── session.ts        # Session management
│   │   ├── password.ts       # Bun.password hashing
│   │   └── middleware.ts     # Auth middleware
│   ├── saas/
│   │   ├── organizations.ts  # Org CRUD
│   │   ├── roles.ts          # Role + permission management
│   │   ├── role-sets.ts      # Role set management
│   │   ├── plans.ts          # Plan + feature management
│   │   ├── subscriptions.ts  # Subscription lifecycle
│   │   └── billing.ts        # Stripe integration
│   ├── db/
│   │   ├── pool.ts           # Connection pool
│   │   ├── client.ts         # Database client
│   │   ├── migrations.ts     # Migration runner
│   │   └── schema/           # SQL schema files
│   └── logger/
│       └── index.ts          # Structured logging
├── package.json
└── README.md

my-app/ (User's project)
├── bunbase.config.ts
├── package.json
├── src/
│   └── modules/
│       ├── users/
│       │   ├── _module.ts
│       │   ├── create-user.ts
│       │   ├── update-user.ts
│       │   └── delete-user.ts
│       └── billing/
│           ├── _module.ts
│           ├── create-invoice.ts
│           └── process-payment.ts
├── db/
│   └── migrations/
│       └── 001_init.sql
└── .bunbase/                  # Generated (gitignored)
    ├── types.ts               # Auto-generated DB types
    └── sdk.ts                 # Auto-generated client SDK
```

### 9. Configuration

```typescript
// bunbase.config.ts
import { defineConfig } from 'bunbase'

export default defineConfig({
  port: 3000,
  host: '0.0.0.0',
  
  database: {
    url: process.env.DATABASE_URL,
    pool: { max: 20 },
  },
  
  actionsDir: 'src/actions',  // Default: src/actions
  
  auth: {
    sessionSecret: process.env.SESSION_SECRET,
    tokenExpiry: '7d',
  },
  
  dashboard: {
    enabled: true,
    path: '/_admin',
    auth: { /* admin guard */ },
  },
  
  saas: {
    enabled: true,
    path: '/_cockpit',
    organizations: true,
    billing: {
      provider: 'stripe',
      plans: [/* ... */],
    },
  },
  
  persistence: {
    flushIntervalMs: 2000,
    maxBufferSize: 500,
    enabled: true,
  },
})
```

---

## Pending Decisions

### 1. Queue Backend
**Options:**
- Postgres-backed queue (simple, no extra infra) ← **Lean**
- Support external like BullMQ/Redis

### 2. Dashboard Technology
**Options:**
- Serve pre-built static HTML/JS from bunbase (zero-dependency, like Drizzle Studio) ← **Lean**
- Generate separate dashboard app

### 3. Event Bus Scaling
**Options:**
- In-process only (EventEmitter) ← **Current**
- Support external (Redis Pub/Sub, NATS) for distributed setups

---

## Key Design Principles

1. **Actions are the primitive** — Everything is an action with typed I/O
2. **Declarative triggers** — How an action is invoked is separate from what it does
3. **Guard pipelines** — Module guards run before action guards, compose security
4. **Zero external dependencies** — Bun-native where possible (password hashing, HTTP, cron)
5. **Buffered persistence** — High-frequency writes batched, critical writes immediate
6. **Opt-in complexity** — Modules are optional, SaaS features are optional
7. **Type-safe throughout** — TypeBox schemas provide end-to-end type safety

---

## Testing Strategy

Each phase should have:
- Unit tests for core functions (action registry, executor, guards)
- Integration tests hitting actual HTTP server
- Type-level tests ensuring TypeBox → TypeScript type inference works
- Dashboard serves as visual verification of runtime state
