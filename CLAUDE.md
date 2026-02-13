# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Bunbase is a type-safe backend framework for Bun built around three core primitives:
- **Actions**: Reusable, validated functions (atomic units of work)
- **Modules**: Logical groupings of actions with shared configuration
- **Triggers**: Entry points connecting actions to different invocation mechanisms (API, cron, event, webhook, MCP tools)

This is a monorepo with:
- `packages/bunbase`: Core framework (published to NPM)
- `packages/react`: React client with TanStack Query integration (published as `@bunbase/react`)
- `packages/studio`: React-based development UI (private, uses Vite)
- `examples/basic`: Working example app demonstrating all features
- `examples/amantra-cpanel`: AMANTRA compliance management control panel

## Development Commands

### Building
```bash
bun run build         # Build all packages using bunup
bun run dev           # Watch mode build
```

### Testing
```bash
bun test              # Run all tests
bun test --watch      # Watch mode
bun test --coverage   # Generate coverage report
```

### Code Quality
```bash
bun run lint          # Check with Biome
bun run lint:fix      # Auto-fix issues
bun run type-check    # TypeScript checking across all packages
```

### Releasing
```bash
bun run release       # Version bump, commit, tag, and push
```

## Developer Experience (End-User Workflow)

Developers using bunbase do NOT interact with framework internals (ActionRegistry, BunbaseServer, Logger, WriteBuffer, etc.). The workflow is:

1. Create a `bunbase.config.ts` in the project root (uses `defineConfig()` for type safety)
2. Write actions and modules under `src/`
3. Run `bunbase dev` — the CLI loads config, discovers actions/modules, and starts the server

The `bunbase dev` command (in `src/cli/commands/dev.ts`) handles all wiring:
- Reads `bunbase.config.ts` (or `bunbase.ts`, `src/bunbase.config.ts`, `src/bunbase.ts`)
- Creates Logger, WriteBuffer, ActionRegistry internally
- Calls `loadActions()` to discover modules and standalone actions
- Creates and starts BunbaseServer with the config

There is no `main.ts` or manual server setup in user projects. See `examples/basic/` for a complete working example.

## Core Architecture (Framework Internals)

### Action → Module → Registry Flow

1. **Actions** are defined with `action()` - they specify:
   - Input/output schemas (TypeBox)
   - Triggers (how they're invoked)
   - Guards (authorization checks)
   - Handler function

2. **Modules** group actions with:
   - Shared API prefix (e.g., `/billing`)
   - Shared guards applied to all actions
   - Organizational structure

3. **ActionRegistry** (singleton):
   - Central registry populated at startup via file discovery
   - Merges module + action configuration
   - Used by runtime components to find and execute actions

### Runtime Components

**BunbaseServer** (`packages/bunbase/src/runtime/server.ts`):
- HTTP server using `Bun.serve()`
- Builds routes from action triggers
- Handles request parsing and session management
- Generates OpenAPI specs
- Serves Studio dashboard

**executeAction** (`packages/bunbase/src/runtime/executor.ts`):
- Core execution pipeline for all actions regardless of trigger type
- Flow: trace ID → build context → run guards → execute handler → persist run entry
- ActionContext provides: db, logger, auth, event bus, queue, scheduler

**Action Discovery** (`packages/bunbase/src/runtime/loader.ts`):
- Scans for `_module.ts` files (modules first)
- Then scans for `.action.ts` action files (skips files in module directories)
- Uses Bun's `Glob` API for discovery

**Scheduler** (`packages/bunbase/src/runtime/scheduler.ts`):
- Cron-based triggers using `croner` library
- One-time scheduled tasks via `setTimeout`
- Delayed execution with `ctx.scheduler.schedule()`

**Queue** (`packages/bunbase/src/runtime/queue.ts`):
- Postgres-backed job queue with polling workers
- Features: priorities, exponential backoff, dead letter queue
- Tables: `job_queue` and `job_failures`
- Access via `ctx.queue.push(jobName, data)`

**EventBus** (`packages/bunbase/src/runtime/event-bus.ts`):
- In-memory singleton event emitter
- Actions with event triggers subscribe to events
- Emit events via `ctx.event.emit(eventName, data)`

### Database Layer

**TypedQueryBuilder** (`packages/bunbase/src/db/client.ts`):
- Fluent, chainable API with type safety
- Methods: `select()`, `eq()`, `neq()`, `gt()`, `gte()`, `lt()`, `lte()`, `in()`, `like()`, `ilike()`, `isNull()`, `isNotNull()`, `limit()`, `offset()`, `orderBy()`, `returning()`, `insert()`, `update()`, `delete()`, `single()`, `maybeSingle()`, `exec()`, `count()`
- Uses Bun's SQL template tag for parameterization
- Example: `db.from('users').eq('id', 123).select('id', 'email').single()`

**Database Types** (`packages/bunbase/src/db/types.ts`):
- Central `Database` type defines all tables with Row/Insert/Update types
- Mirrors Supabase schema structure

### Redis Integration (Optional)

**Redis Configuration** (`bunbase.config.ts`):

- Optional Redis support for high-performance KV store and rate limiting
- Automatically falls back to Postgres if Redis is not configured or connection fails
- Uses Bun's native Redis client for optimal performance

Configuration example:

```typescript
export default defineConfig({
  redis: {
    url: process.env.REDIS_URL, // Default: redis://localhost:6379
    connectionTimeout: 5000,     // Default: 5000ms
    idleTimeout: 30000,          // Default: 30000ms
    autoReconnect: true,         // Default: true
    maxRetries: 10,              // Default: 10
    tls: false,                  // Default: false
  }
})
```

**RedisKVStore** (`packages/bunbase/src/kv/redis.ts`):

- Implements `KVStore` interface using Redis
- JSON serialization for complex values
- TTL support via Redis EXPIRE command
- Used automatically when Redis is configured
- Falls back to PostgresKVStore if Redis unavailable

**Redis Rate Limiter** (`packages/bunbase/src/core/guards/rate-limit-redis.ts`):

- Distributed rate limiting using Redis sorted sets
- Sliding window algorithm for accurate rate limiting
- Persists across server restarts
- Scales horizontally across multiple instances
- Auto-created when Redis is configured, otherwise uses in-memory limiter

Key differences from Postgres-backed implementations:

- **KV Store**: Redis is ~10-100x faster for key-value operations
- **Rate Limiting**: Redis enables distributed rate limiting across multiple server instances
- **Persistence**: Redis data persists across restarts (unlike in-memory rate limiter)
- **Scalability**: Multiple Bunbase instances can share the same Redis for coordination

### Guards & Authorization

Guards are higher-order functions returning `GuardFn` that:
- Run before action handlers
- Can throw `GuardError` with status codes (401/403/429)
- Are composable and applied hierarchically (module guards → action guards)

Built-in guards (`packages/bunbase/src/guards/`):
- `authenticated()`: Require `ctx.auth.userId`
- `hasRole(role)`, `hasPermission(permission)`: RBAC
- `rateLimit(opts)`: In-memory sliding window rate limiting
- `inOrg()`, `hasFeature(feature)`, `trialActiveOrPaid()`: Multi-tenant SaaS guards

### Persistence & Logging

**WriteBuffer** (`packages/bunbase/src/persistence/write-buffer.ts`):
- Batches writes to `action_logs` and `action_runs` tables
- Avoids database bombardment on high-frequency logging
- Flushes on interval (default 2s) or size threshold (default 500)
- Gracefully flushes on shutdown

**Logger** (`packages/bunbase/src/logger/`):
- Hierarchical scoped logging (root → child loggers)
- Trace IDs propagate through async boundaries
- Multiple listeners for custom log routing

### Session Management

**SessionManager** (`packages/bunbase/src/auth/session.ts`):
- HMAC-SHA256 signed sessions (stateless JWT-like)
- Base64 encoded for cookie transport
- Timing-safe comparison to prevent timing attacks
- Default cookie name: `bunbase_session`

## Key Patterns

### Composition Over Inheritance
- Guards are composable functions, not classes
- Triggers are data structures, not polymorphic types
- Modules are metadata containers

### Registry Pattern
- Single `ActionRegistry` holds all discovered actions
- Runtime components query registry for execution

### Builder Pattern
- `action()`, `module()` return definition objects
- `triggers.*()` build trigger configurations
- Guards are factory functions

### Execution Pipeline
Guards → Input Validation → Handler (with retry loop) → Output Validation → Persistence

### Retry Support
Actions can configure automatic retry with exponential or fixed backoff:

- `retry.maxAttempts`: Total attempts including first (default: 1 = no retry)
- `retry.backoff`: 'exponential' (default) or 'fixed'
- `retry.backoffMs`: Base delay (default: 1000ms)
- `retry.maxBackoffMs`: Cap for exponential (default: 30000ms)
- `retry.retryIf`: Custom predicate for error filtering
- Guards run once; only the handler retries
- `NonRetriableError`, `GuardError`, client errors (< 500) never retry
- Server errors (>= 500) and generic errors are retryable by default
- `ctx.retry.attempt` and `ctx.retry.maxAttempts` available in handler

### Write Buffering
High-frequency writes batched and flushed periodically

### Trace Context
Every execution gets unique `traceId` for observability

## File Structure Conventions

- `_module.ts`: Module definitions (discovered first by loader)
- `*.action.ts`: Standalone action files
- Actions organized by domain: `auth/`, `guards/`, `saas/`, etc.
- Tests co-located with source (Bun's default)

## TypeScript Configuration

- Strict mode enabled
- `noUncheckedIndexedAccess` for safer array access
- `isolatedDeclarations` for faster type checking
- `verbatimModuleSyntax` for explicit imports
- `moduleResolution: "bundler"` for Bun compatibility
- JSX: Preact for lightweight components

## Code Style (Biome)

- Single quotes for strings
- Semicolons "as needed" (ASI-aware)
- Organize imports on save
- `noExplicitAny` disabled (pragmatic type usage allowed)
- Uses `.editorconfig` for consistent formatting

## Commit Conventions

Follow Conventional Commits:
- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation
- `refactor:` Code restructuring
- `perf:` Performance improvements
- `test:` Test additions/updates
- `chore:` Maintenance tasks

## Package Exports

### `bunbase`

The main `bunbase` package exports:

- `./` - Core primitives (`action`, `module`, `triggers`, `guards`, `t`, `defineConfig`, `BunbaseConfig`), database client (`createDB`, `DatabaseClient`), logging utilities (`Logger`, `LoggerSession`), auth utilities, SaaS services, error classes
- `./cli` - CLI tooling (bin: `bunbase`)

> Runtime internals (`BunbaseServer`, `ActionRegistry`, `loadActions`, `WriteBuffer`, `Scheduler`, `McpService`) are NOT exported. They are initialized internally by the `bunbase dev` CLI command.

### `@bunbase/react`

React client package (`packages/react`) for consuming Bunbase backends with full type safety:

**Core exports:**
- `createBunbaseClient<API>(options)` - Creates typed client with hooks
- `BunbaseClient` - Low-level client class
- `BunbaseError` - Error class with status codes
- Type helpers: `ActionName`, `ActionInput`, `ActionOutput`, `BaseAPI`

**Features:**
- TanStack Query integration for `useQuery` and `useMutation` hooks
- Direct API calls via `client.call(action, input)` for non-React code
- Request/response interceptors
- Global error handling
- Authentication header management

**Usage pattern:**
1. Generate types: `bunbase typegen:react --url http://localhost:3000`
2. Create client: `createBunbaseClient<BunbaseAPI>({ baseUrl: '...' })`
3. Use hooks: `bunbase.useQuery('action-name', input)` or `bunbase.useMutation('action-name')`

See `packages/react/README.md` for full documentation and examples.

## CLI Tool

`packages/bunbase/src/cli/` provides the `bunbase` command for:

- Project scaffolding (`bunbase init <name>`)
- Action/module generation (`bunbase generate action <name>`)
- Database migrations (`bunbase migrate`, `bunbase migrate new <name>`)
- Type generation:

  - `bunbase typegen:db` - introspects PostgreSQL and generates TypeScript types
  - `bunbase typegen:react --url <backend-url>` - fetches OpenAPI spec and generates React client types

- Development server (`bunbase dev`)

### Database Type Generation (`typegen:db`)

The `bunbase typegen:db` command introspects a live PostgreSQL database and generates TypeScript types at `.bunbase/database.d.ts`. The generated types are automatically picked up by the database client via a type registration pattern — no explicit generic parameter needed.

**Workflow:**

1. Run `bunbase typegen:db` after adding/modifying database tables
2. The command queries `information_schema.columns` and `pg_enum` to introspect the schema
3. Generates a `.bunbase/database.d.ts` file with Row/Insert/Update types for all tables
4. The types are automatically resolved via module augmentation of `bunbase`

**Options:**
- `--schema <schema>` - PostgreSQL schema to introspect (default: `public`)
- `--output <path>` - Output file path (default: `.bunbase/database.d.ts`)

**Type mapping:**

- PostgreSQL `uuid`, `text`, `varchar` → TypeScript `string`
- `int2`, `int4`, `float4`, `float8` → `number`
- `int8` → `string` (to avoid precision loss)
- `jsonb` → `unknown`
- `timestamptz`, `date` → `string`
- Nullable columns → `| null`
- Columns with defaults → optional in Insert type

**Usage:**

```typescript
import { createDB } from 'bunbase'

const db = createDB(sql) // Automatically typed with generated schema
const user = await db.from('users').eq('email', 'test@example.com').single()
// ✓ Full autocomplete for 'users' table and columns
```

You can still pass an explicit generic to override: `createDB<CustomDB>(sql)`

### React Type Generation (`typegen:react`)

The `bunbase typegen:react` command fetches the OpenAPI spec from a running Bunbase backend and generates TypeScript types for use with `@bunbase/react` client.

**Workflow:**

1. Run your Bunbase backend: `bunbase dev` (serves OpenAPI at `/openapi.json`)
2. In your React project, run: `bunbase typegen:react --url http://localhost:3000`
3. Generates `.bunbase/api.d.ts` with full action types (input/output schemas)
4. Import types in your React client for end-to-end type safety

**Options:**

- `--url <url>` - Backend URL (required, e.g., `http://localhost:3000`)
- `--output <path>` - Output file path (default: `.bunbase/api.d.ts`)

**Usage:**

```typescript
// After running: bunbase typegen:react --url http://localhost:3000
import { createBunbaseClient } from '@bunbase/react'
import type { BunbaseAPI } from './.bunbase/api'

export const bunbase = createBunbaseClient<BunbaseAPI>({
  baseUrl: 'http://localhost:3000',
})

// Fully typed queries and mutations
const { data } = bunbase.useQuery('list-tasks', { status: 'active' })
//    ^? { tasks: Task[] }

const createTask = bunbase.useMutation('create-task')
//    ^? (input: { title: string; description?: string }) => Promise<{ id: string; ... }>
```

## Important Context for Code Changes

### When Adding New Actions
1. Define with `action()` including input/output schemas
2. Choose appropriate trigger(s): API, event, cron, webhook, or MCP
3. Add guards for authorization
4. Use `ctx.db` for database, `ctx.logger` for logging
5. File location determines discovery (standalone `.action.ts` or in `_module.ts`)
6. Consider adding `retry` config for actions that call external services or may face transient failures

### When Modifying Database Queries
- Use TypedQueryBuilder methods, not raw SQL strings
- Ensure return types match schema definitions
- Use `single()` for one result, `exec()` for many

### When Working with Guards
- Guards throw errors to short-circuit execution
- Use `GuardError` with appropriate status codes
- Module guards run before action guards

### When Dealing with Events
- Emit via `ctx.event.emit(eventName, data)`
- Define event triggers with `triggers.event(eventName)`
- Handlers run async in background

### When Using the Queue
- Push jobs via `ctx.queue.push(jobName, data)`
- Define job handlers with proper types
- Configure retries and priorities as needed

### When Building HTTP APIs

- Use `triggers.api(method, path)` with optional `{ map }` for custom request mapping
- Routes automatically include module API prefix
- Path parameters supported: `triggers.api('GET', '/users/:id')`
- Session cookies handled automatically
- Return objects are JSON-serialized

## Studio Package

`packages/studio/` is a React + Vite application for visualizing:
- Registered actions and modules
- API routes and OpenAPI specs
- Action execution logs
- System metrics

Separate dev/build commands (uses Vite, not bunup).
