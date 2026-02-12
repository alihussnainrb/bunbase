---
name: bunbase-expert
description: "Expert guidance for building type-safe backend applications with the Bunbase framework for Bun. Use this skill when: (1) Creating new Bunbase projects or scaffolding, (2) Writing actions, modules, guards, or triggers, (3) Working with the database query builder, storage, KV store, event bus, or job queue, (4) Implementing multi-tenant SaaS features (organizations, RBAC, plans), (5) Configuring bunbase.config.ts, (6) Writing or running migrations, (7) Debugging or optimizing Bunbase applications. Triggers on keywords: bunbase, action, module, trigger, guard, TypeBox, defineConfig, ctx.db, ctx.storage, ctx.kv, ctx.event, ctx.queue, saasGuards, inOrg, hasFeature."
---

# Bunbase Expert

## Quick Start

Bunbase projects have this workflow:

1. `bunbase init <name>` - Scaffold project
2. Edit `bunbase.config.ts` (uses `defineConfig()`)
3. Write actions/modules under `src/`
4. `bunbase dev` - CLI loads config, discovers code, starts server

No `main.ts` or manual wiring needed.

## Core Primitives

### Actions

Atomic units of work with validated I/O:

```typescript
import { action, t, triggers, guards } from 'bunbase'

export const createUser = action({
  name: 'users.create',
  input: t.Object({
    email: t.String({ format: 'email' }),
    name: t.String(),
  }),
  output: t.Object({
    user: t.Object({ id: t.String(), email: t.String() }),
  }),
  triggers: [triggers.api('POST', '/users')],
  guards: [guards.authenticated()],
}, async (input, ctx) => {
  const user = await ctx.db
    .from('users')
    .insert({ email: input.email, name: input.name })
    .returning('id', 'email')
    .single()
  return { user }
})
```

### Modules

Group related actions with shared config:

```typescript
import { module } from 'bunbase'

export default module({
  name: 'users',
  apiPrefix: '/api/users',
  guards: [guards.authenticated()],
  actions: [createUser, getUser, listUsers],
})
```

File convention: `_module.ts` defines the module, sibling `.ts` files are its actions.

### Triggers

```typescript
triggers.api('GET', '/users/:id')         // HTTP endpoint
triggers.event('user.created')            // Event listener
triggers.cron('0 0 * * *')               // Cron schedule
triggers.webhook('POST', '/hooks/stripe') // Webhook endpoint
triggers.tool('analyze', 'Analyzes code') // MCP tool
```

### Guards

Run before handlers, throw `GuardError` to block:

```typescript
guards.authenticated()                        // Require userId
guards.hasRole('org:admin')                   // Role check
guards.hasPermission('org:members:manage')    // Permission check
guards.rateLimit({ max: 100, window: 60 })    // Rate limit
saasGuards.inOrg()                            // Require org context
saasGuards.hasFeature('org:analytics')        // Plan feature check
saasGuards.trialActiveOrPaid()                // Subscription check
```

Module guards run first, then action guards. First failure short-circuits.

### Retry

Actions can configure automatic handler retry on transient failures:

```typescript
export const syncExternalData = action({
  name: 'sync.external',
  input: t.Object({ url: t.String() }),
  output: t.Object({ synced: t.Boolean() }),
  triggers: [triggers.cron('0 * * * *')],
  retry: {
    maxAttempts: 3,
    backoff: 'exponential',
    backoffMs: 1000,
    maxBackoffMs: 30000,
  },
}, async (input, ctx) => {
  ctx.logger.info(`Attempt ${ctx.retry.attempt}/${ctx.retry.maxAttempts}`)
  const response = await fetch(input.url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return { synced: true }
})
```

- Guards run once; only the handler retries
- Client errors (4xx), `NonRetriableError`, `GuardError` never retry
- Server errors (5xx) and generic `Error` retry by default
- Custom `retryIf` predicate for fine-grained control

## Action Context (ctx)

Every handler receives `ctx` with these services:

| Service | Description |
|---------|-------------|
| `ctx.db` | Type-safe PostgreSQL query builder |
| `ctx.storage` | File storage (S3/local) |
| `ctx.kv` | Key-value store with TTL |
| `ctx.logger` | Hierarchical logging with trace IDs |
| `ctx.auth` | Auth context (userId, orgId, role, permissions) |
| `ctx.event` | Event bus for pub/sub |
| `ctx.queue` | Background job queue |
| `ctx.scheduler` | Cron and delayed tasks |
| `ctx.traceId` | Unique execution trace ID |
| `ctx.retry` | Retry state (attempt, maxAttempts) |

For detailed API of each service, see [references/context-api.md](references/context-api.md).

## Configuration

```typescript
// bunbase.config.ts
import { defineConfig } from 'bunbase'

export default defineConfig({
  port: 3000,
  actionsDir: 'src',
  database: {
    url: process.env.DATABASE_URL,
    migrations: { directory: 'migrations' },
  },
  storage: {
    adapter: 's3', // or 'local'
    s3: {
      bucket: 'my-bucket',
      region: 'us-east-1',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  },
  auth: { sessionSecret: process.env.SESSION_SECRET! },
  openapi: { enabled: true, title: 'My API' },
  studio: { enabled: true },
})
```

## File Structure

```
project/
  bunbase.config.ts
  migrations/001_init.sql
  src/
    actions/            # Standalone actions
      health.ts
    modules/
      users/
        _module.ts      # Module definition (discovered first)
        create.ts
        list.ts
      billing/
        _module.ts
        subscribe.ts
    lib/                # Shared utilities
```

## SaaS Features

Built-in Clerk-inspired multi-tenancy. Default seed data:

- **Roles**: `org:admin`, `org:member`, `org:billing_manager`
- **Permissions**: `org:read`, `org:update`, `org:delete`, `org:members:read`, `org:members:manage`, `org:invitations:manage`, `org:billing:read`, `org:billing:manage`, `org:roles:manage`
- **Plans**: free ($0), starter ($29), pro ($99), enterprise ($299)
- **Features**: `org:basic`, `org:members:5/25/unlimited`, `org:analytics`, `org:api_access`, `org:sso`, `org:priority_support`

For SaaS patterns and examples, see [references/saas-patterns.md](references/saas-patterns.md).

## CLI Commands

```bash
bunbase init <name>          # Scaffold project
bunbase dev                  # Start dev server
bunbase migrate              # Run migrations
bunbase migrate new <name>   # Create migration
bunbase migrate status       # Check migration status
bunbase generate action <n>  # Generate action
bunbase generate module <n>  # Generate module
bunbase typegen              # Generate TypeScript types from database
```

### Type Generation

The `bunbase typegen` command introspects your PostgreSQL database and generates TypeScript types at `.bunbase/database.d.ts`. The generated types are automatically picked up by the database client via the `BunbaseDBRegister` type registration pattern:

```typescript
// After running bunbase typegen, the DB client is automatically typed
const db = createDB(sql) // No generic needed — types auto-resolved
const user = await db.from('users').single() // Full autocomplete

// You can still override with explicit generic
const db = createDB<CustomDB>(sql)
```

**How it works:**

- The generated `.bunbase/database.d.ts` augments `bunbase/db` module
- Types include Row (all columns), Insert (optionals for defaults/nullables), and Update (all optional)
- PostgreSQL types mapped to TypeScript: uuid→string, int→number, jsonb→unknown, timestamptz→string
- Run after schema changes to keep types in sync

## Critical Rules

1. **Always filter by org_id** in multi-tenant queries - prevents data leaks
2. **Use guards, not manual auth checks** in handlers
3. **Use query builder over raw SQL** - preserves type safety
4. **Use ctx.logger over console.log** - includes trace IDs
5. **Emit events, don't call actions directly** - keeps decoupling
6. **Push async work to queue** - ctx.queue.push() for background tasks
7. **TypeBox for schemas** - import `t` from 'bunbase'

## Common Patterns

For CRUD, multi-tenant, file upload, background job, and event-driven patterns, see [references/patterns.md](references/patterns.md).

## Anti-Patterns

```typescript
// BAD: Manual auth in handler
async (input, ctx) => { if (!ctx.auth.userId) throw new Error('Unauthorized') }
// GOOD: Use guard
guards: [guards.authenticated()]

// BAD: Unscoped query (leaks across orgs)
await ctx.db.from('items').exec()
// GOOD: Always scope to org
await ctx.db.from('items').eq('org_id', ctx.auth.orgId!).exec()

// BAD: Direct action call
await otherAction.handler(input, ctx)
// GOOD: Use event bus
ctx.event.emit('user.created', { userId })

// BAD: console.log
console.log('something happened')
// GOOD: Structured logging
ctx.logger.info('something happened', { userId })
```

## Architecture

For system architecture, component breakdown, data flows, and scalability, see [references/architecture.md](references/architecture.md).

## Debugging

- Studio dashboard at `http://localhost:3000/_studio`
- OpenAPI docs at `/api/docs`
- All executions logged to `action_runs` table with trace IDs
- Use `ctx.logger.debug()` for development logging
