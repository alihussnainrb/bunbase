# Bunbase — Project Vision

## What Is Bunbase?

Bunbase is a Bun-native backend framework where **actions are the primitive**. Every piece of business logic is an action with typed input/output, and triggers determine how it gets invoked.

```
Action  = What happens (business logic + typed I/O)
Trigger = How it gets invoked (HTTP, event, cron, AI tool, webhook)
Guard   = Who can invoke it (auth, RBAC, features, rate limits)
Context = What it has access to (db, logger, queue, auth, org)
```

Bunbase targets developers building SaaS products who want a type-safe, opinionated backend with built-in multi-tenancy, RBAC, billing integration, and a development studio — all running on Bun with zero external service dependencies.

## Design Principles

1. **Actions are the primitive** — Everything is an action with typed I/O. No controllers, no middleware chains, no route handlers.
2. **Declarative triggers** — How an action is invoked is separate from what it does. The same action can be an API endpoint, a cron job, an event handler, and an MCP tool simultaneously.
3. **Guard pipelines** — Security is composable. Module guards run before action guards. Guards populate context (auth, org, permissions) for downstream use.
4. **Zero external dependencies** — Bun-native where possible: `Bun.serve()` for HTTP, `Bun.password` for hashing, `Bun.CryptoHasher` for sessions, built-in SQLite/Postgres support.
5. **Buffered persistence** — High-frequency writes (logs, run history) are batched via WriteBuffer. Critical writes (user data, org data) go through the query builder immediately.
6. **Opt-in complexity** — Modules are optional. SaaS features are optional. Studio is optional. Start with a single action file and scale up.
7. **Type-safe throughout** — TypeBox schemas provide end-to-end type safety from API request to handler to response.

## Architecture

### Core Flow

```
Request/Event/Cron/Webhook
        │
        ▼
   ┌─────────┐
   │ Trigger  │  Matches incoming signal to an action
   └────┬─────┘
        │
        ▼
   ┌──────────────┐
   │ ActionRegistry│  Looks up the registered action
   └────┬─────────┘
        │
        ▼
   ┌──────────────────────────────────┐
   │         executeAction()          │
   │  1. Generate traceId             │
   │  2. Build ActionContext           │
   │  3. Run guards (module → action) │
   │  4. Validate input (TypeBox)      │
   │  5. Execute handler               │
   │  6. Validate output (TypeBox)     │
   │  7. Record run to WriteBuffer     │
   └──────────────────────────────────┘
        │
        ▼
   Response / Event emit / Queue push
```

### Runtime Components

| Component | File | Purpose |
|-----------|------|---------|
| **Server** | `src/runtime/server.ts` | HTTP server via `Bun.serve()`, path-parameter routing, OpenAPI spec, Studio serving |
| **Executor** | `src/runtime/executor.ts` | Core execution pipeline for all trigger types |
| **Loader** | `src/runtime/loader.ts` | File-based auto-discovery of `_module.ts` and action files |
| **Scheduler** | `src/runtime/scheduler.ts` | Cron triggers via `croner`, one-time scheduling |
| **Queue** | `src/runtime/queue.ts` | Postgres-backed job queue with priorities and backoff |
| **EventBus** | `src/runtime/event-bus.ts` | In-process event emitter for event triggers |
| **MCP Server** | `src/runtime/mcp-server.ts` | MCP tool integration for AI agents |

### Data Layer

| Component | File | Purpose |
|-----------|------|---------|
| **TypedQueryBuilder** | `src/db/client.ts` | Chainable, type-safe query builder using Bun SQL |
| **Database Types** | `src/db/types.ts` | Central type definitions for all tables |
| **Schema** | `src/db/schema/001_init.sql` | Full DDL for all framework tables |
| **WriteBuffer** | `src/persistence/write-buffer.ts` | Batched persistence for logs and run history |

### SaaS Cockpit

Built-in multi-tenancy and billing support:

| Component | File | Purpose |
|-----------|------|---------|
| **Organizations** | `src/saas/organizations.ts` | Org CRUD, memberships, member count |
| **Subscriptions** | `src/saas/subscriptions.ts` | Subscription lifecycle, plan management |
| **SaaS Guards** | `src/guards/saas.ts` | `inOrg()`, `hasFeature()`, `trialActiveOrPaid()` |

### Studio

Development UI for introspecting the running application:

- Lists all registered actions with their triggers, guards, and schemas
- Shows action run history with input/output/errors
- Served as a built-in module at `/_studio` (configurable)
- Studio actions are regular bunbase actions — they use the same execution pipeline

## Database Schema

All framework tables are defined in `src/db/schema/001_init.sql`:

**Auth & Users:** `users`, `sessions`
**Organizations:** `organizations`, `org_memberships`, `org_invitations`
**RBAC:** `roles`, `permissions`, `role_permissions`
**Billing:** `plans`, `features`, `plan_features`, `subscriptions`
**Runtime:** `action_runs`, `action_logs`, `job_queue`, `job_failures`

Permission format: `<feature>:<action>` (e.g., `invoices:create`, `analytics:view`)

## Package Structure

This is a monorepo with two packages:

```
bunbase/
├── packages/
│   ├── bunbase/          # Core framework (published to NPM)
│   │   ├── src/
│   │   │   ├── index.ts          # Public API exports
│   │   │   ├── core/             # action, module, registry, types
│   │   │   ├── triggers/         # All trigger types
│   │   │   ├── guards/           # Built-in + SaaS guards
│   │   │   ├── runtime/          # server, loader, executor, scheduler, queue
│   │   │   ├── persistence/      # WriteBuffer
│   │   │   ├── auth/             # Session management, password hashing
│   │   │   ├── saas/             # Organizations, subscriptions
│   │   │   ├── db/               # Query builder, types, schema
│   │   │   ├── logger/           # Structured logging
│   │   │   ├── studio/           # Studio module + actions
│   │   │   └── cli/              # CLI commands (init, dev, generate)
│   │   └── test/                 # Tests
│   └── studio/           # React + Vite development UI (private)
├── bunup.config.ts       # Build configuration
└── docs/                 # Documentation
```

**NPM exports:**

- `bunbase` — Core primitives (`action`, `module`, `triggers`, `guards`, `t`, `defineConfig`), auth utilities, SaaS services, error classes
- `bunbase/db` — Database client (`TypedQueryBuilder`)
- `bunbase/logger` — Logging utilities (`Logger`, `LoggerSession`)
- `bunbase/cli` — CLI tool (bin: `bunbase`)

> **Note:** Runtime internals (`BunbaseServer`, `ActionRegistry`, `loadActions`, `WriteBuffer`, `Scheduler`, `McpService`) are **not** exported. They are initialized internally by the `bunbase dev` CLI command.

## Developer Experience

Developers don't interact with bunbase internals (ActionRegistry, BunbaseServer, etc.) directly. The workflow is:

1. Create a `bunbase.config.ts` in the project root
2. Write actions and modules under `src/`
3. Run `bunbase dev` — the CLI loads the config, discovers all actions/modules, and starts the server

```
my-app/
├── bunbase.config.ts          # Configuration
├── package.json
└── src/
    ├── health.ts              # Standalone action (auto-discovered)
    ├── auth/
    │   ├── _module.ts         # Module definition (discovered first)
    │   ├── login.ts           # Module action
    │   └── me.ts              # Module action
    └── tasks/
        ├── _module.ts         # Module with shared guards + apiPrefix
        ├── create-task.ts
        └── list-tasks.ts
```

Running `bunbase dev` the framework automatically:
- Reads `bunbase.config.ts` (searches root, then `src/`)
- Scans `actionsDir` for `_module.ts` files (registers modules first)
- Scans for remaining `.ts` files that default-export actions (standalone)
- Starts the HTTP server with routes built from action triggers
- Registers event listeners, cron schedules, and optionally the MCP server

## CLI

| Command | Description |
|---------|-------------|
| `bunbase init [name]` | Scaffold a new project with config, example action, and module |
| `bunbase dev` | Start development server (loads config, discovers actions, starts server) |
| `bunbase generate action <name>` | Generate a new action file |
| `bunbase generate module <name>` | Generate a new module with `_module.ts` |

## Configuration

```typescript
// bunbase.config.ts
import { defineConfig } from 'bunbase'

export default defineConfig({
  port: 3000,
  actionsDir: 'src',
  auth: {
    sessionSecret: process.env.SESSION_SECRET!,
  },
  openapi: {
    enabled: true,
    path: '/api/openapi.json',
  },
  studio: {
    enabled: true,
  },
  persistence: {
    flushIntervalMs: 2000,
    maxBufferSize: 500,
  },
})
```

The config is loaded by the CLI via dynamic `import()`. It searches for `bunbase.config.ts`, `bunbase.ts`, `src/bunbase.config.ts`, or `src/bunbase.ts` in order.

## Implementation Status

### Completed

- Action definition with TypeBox I/O validation
- Module system with `_module.ts` discovery
- All trigger types: API, event, cron, MCP tool, webhook
- Guard pipeline (module → action cascade)
- Auth module (HMAC-SHA256 sessions, password hashing)
- Built-in guards: `authenticated()`, `hasRole()`, `hasPermission()`, `rateLimit()`
- SaaS guards: `inOrg()`, `hasFeature()`, `trialActiveOrPaid()`
- Organizations service (CRUD, memberships)
- Subscriptions service
- TypedQueryBuilder with full method set
- Complete database schema (16 tables)
- Path-parameter routing in HTTP server
- OpenAPI spec generation from action schemas
- Studio module wired to real registry + DB data
- WriteBuffer for batched persistence
- Postgres-backed job queue
- CLI with init, dev, and generate commands
- 99 passing tests

### Open Areas

- Stripe billing integration (webhook handling, checkout flows)
- Migration runner CLI command
- Distributed event bus (Redis Pub/Sub, NATS) for multi-instance deployments
- Auto-generated client SDK from action schemas
- Studio UI polish (the React frontend in `packages/studio`)
