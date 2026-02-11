# Bunbase Architecture

## Table of Contents

- [System Overview](#system-overview)
- [Component Breakdown](#component-breakdown)
- [Execution Pipeline](#execution-pipeline)
- [Data Flows](#data-flows)
- [Database Schema](#database-schema)
- [Scalability](#scalability)

## System Overview

```
                     BunbaseServer
  +--------------------------------------------------+
  |  HTTP Router  |  Event Bus  |  MCP Server        |
  |               |  (in-mem)   |  (stdio)           |
  +-------+-------+------+------+--------+-----------+
          |              |               |
          +------+-------+-------+-------+
                 |               |
           +-----v-----+  +-----v------+
           |  Executor  |  |  Scheduler |
           +-----+------+  +-----+------+
                 |                |
      +----------+----------+    |
      |          |          |    |
  +---v---+ +---v---+ +---v----v---+
  |Guards | |Handler| |Write Buffer|
  +-------+ +---+---+ +-----+------+
                |            |
     +----------+----------+ |
     |          |          | |
  +--v---+ +---v----+ +--v-v--+
  |  DB  | |Storage | |  KV   |
  +------+ +--------+ +-------+
```

## Component Breakdown

### Action Registry (`src/core/registry.ts`)
- Central singleton holding all discovered actions
- Discovery: `_module.ts` files first, then standalone `.ts` files
- Merges module guards/config into action definitions
- Methods: `registerAction()`, `registerModule()`, `get(name)`, `getAll()`

### Executor (`src/runtime/executor.ts`)
- Core pipeline for ALL action invocations regardless of trigger
- Flow: traceId -> context -> guards -> validate input -> handler -> validate output -> persist

### HTTP Server (`src/runtime/server.ts`)
- `Bun.serve()` with route generation from action triggers
- Automatic session loading and auth context
- Special routes: `/api/openapi.json`, `/api/docs`, `/_studio/*`

### Database (`src/db/`)
- `pool.ts`: Connection pooling (default 20 connections, 30s idle timeout)
- `client.ts`: `TypedQueryBuilder` with fluent chainable API
- `migrator.ts`: SQL file-based migrations with `_migrations` tracking table
- `init-sql.ts`: Schema initialization + SaaS seed data

### Storage (`src/storage/`)
- `types.ts`: `StorageAdapter` interface
- `s3-adapter.ts`: Bun.S3Client with full options (ACL, storage classes, multipart)
- `local-adapter.ts`: Filesystem using Bun.write/Bun.file
- `index.ts`: Factory `createStorage(config)`

### KV Store (`src/kv/`)
- PostgreSQL-backed with `kv_store` table (key TEXT, value JSONB, expires_at TIMESTAMPTZ)
- TTL support with automatic expiry filtering
- Prefix-based key listing

### Event Bus (`src/runtime/event-bus.ts`)
- In-memory singleton pub/sub
- Max 50 listeners per event
- Async handlers with error catching
- Not distributed (single process only)

### Job Queue (`src/runtime/queue.ts`)
- PostgreSQL `job_queue` table with status tracking
- Priority-based processing, exponential backoff
- Dead letter queue in `job_failures`
- Configurable worker concurrency and polling interval

### Scheduler (`src/runtime/scheduler.ts`)
- `croner` library for cron expressions
- One-time delayed tasks via `setTimeout`
- Trace ID propagation into scheduled executions

### Write Buffer (`src/persistence/write-buffer.ts`)
- Batches writes to `action_runs` and `action_logs`
- Flush interval: 2s, max buffer: 500 entries
- Transaction-based batch inserts
- Graceful shutdown flush

### Session Manager (`src/auth/session.ts`)
- HMAC-SHA256 signed, base64 encoded
- Stateless (no DB lookups)
- Timing-safe comparison
- Cookie-based transport with secure flags

### Guards (`src/core/guards/`)
- Higher-order functions returning `GuardFn`
- Throw `GuardError(message, statusCode)` to block
- Sequential execution: module guards then action guards
- Built-in: authenticated, hasRole, hasPermission, rateLimit, inOrg, hasFeature

### SaaS Services (`src/saas/`)
- `OrganizationService`: CRUD + membership management
- `RoleService`: Role and permission lookups
- `PlanService`: Plan management
- `SubscriptionService`: Subscription lifecycle

### Logger (`src/logger/`)
- Hierarchical with `.child(context)` for scoped logging
- Multiple listeners for custom routing
- Structured entries with metadata
- Trace ID propagation through async boundaries

### OpenAPI (`src/runtime/openapi.ts`)
- Generates OpenAPI 3.1 spec from action triggers + TypeBox schemas
- JSON at `/api/openapi.json`, Swagger UI at `/api/docs`

### Studio (`src/studio/`)
- Preact + HTM development dashboard
- Actions list, routes explorer, execution logs, metrics
- Embedded in server at `/_studio`

### CLI (`src/cli/`)
- Commander.js based
- Commands: init, dev, migrate, generate
- Config loading from bunbase.config.ts (or variants)

## Execution Pipeline

```
1. Trigger fires (HTTP request / event / cron / webhook)
2. Generate unique traceId
3. Build ActionContext (db, storage, kv, logger, auth, event, queue, scheduler)
4. Run guards sequentially (module guards first, then action guards)
   - Any guard throws GuardError -> return error response
5. Validate input against TypeBox schema
6. Execute handler function
7. Validate output against TypeBox schema
8. Queue run entry to write buffer (async, non-blocking)
9. Return result
```

## Data Flows

### HTTP Request
```
HTTP Request -> Bun.serve -> Route match -> Session load -> Auth context
-> Executor -> Guards -> Input validation -> Handler -> Output validation
-> Write buffer (async) -> JSON response
```

### Event
```
ctx.event.emit() -> Event bus broadcasts -> For each listener:
-> Executor -> Guards -> Handler -> Write buffer (async)
```

### Background Job
```
ctx.queue.push() -> INSERT job_queue -> Worker polls -> Claims job
-> Executor -> Guards -> Handler -> Update job status -> Write buffer
```

### Cron
```
croner fires at schedule -> Executor -> Guards -> Handler -> Write buffer
```

## Database Schema

Core tables created by `init-sql.ts`:

- `action_runs` - Execution history (id, action, status, input, output, duration, trace_id)
- `action_logs` - Log entries (id, run_id, level, message, meta, trace_id)
- `kv_store` - Key-value pairs (key, value JSONB, expires_at)
- `job_queue` - Background jobs (id, name, data, status, priority, attempts, run_at)
- `job_failures` - Dead letter queue
- `_migrations` - Migration tracking

SaaS tables:
- `organizations` - Tenants (id, name, slug, owner_id)
- `org_memberships` - User-org relationships with roles
- `org_invitations` - Pending invitations
- `roles` - Role definitions (key, name, description)
- `permissions` - Permission definitions (key, name, description)
- `role_permissions` - Role-permission mapping
- `plans` - Subscription plans (key, name, price_cents)
- `features` - Feature definitions (key, name, description)
- `plan_features` - Plan-feature mapping
- `subscriptions` - Org subscriptions (org_id, plan_key, status, period)

## Scalability

### Horizontal
- HTTP server is stateless (sessions in signed cookies)
- Job queue is shared-database (multiple workers can poll)
- Event bus is in-memory only (not distributed across instances)
- Scheduler needs leader election for multi-instance

### Vertical
- Connection pool size tuning (default 20)
- Worker concurrency configuration
- Write buffer size/interval tuning
- Database indexes on hot paths

### Caching Strategy
- KV store for frequently accessed data
- Namespace cache keys by org for isolation
- Set appropriate TTLs
- Invalidate on mutations (emit events to trigger cache clearing)
