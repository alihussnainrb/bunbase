# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Bunbase is a type-safe backend framework for Bun built around three core primitives:
- **Actions**: Reusable, validated functions (atomic units of work)
- **Modules**: Logical groupings of actions with shared configuration
- **Triggers**: Entry points connecting actions to different invocation mechanisms (API, cron, event, webhook, MCP tools)

This is a monorepo with:
- `packages/bunbase`: Core framework (published to NPM)
- `packages/studio`: React-based development UI (private, uses Vite)
- `examples/basic`: Working example app demonstrating all features

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
- Then scans for `.ts` action files (skips files in module directories)
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
Guards → Input Validation → Handler → Output Validation → Persistence

### Write Buffering
High-frequency writes batched and flushed periodically

### Trace Context
Every execution gets unique `traceId` for observability

## File Structure Conventions

- `_module.ts`: Module definitions (discovered first by loader)
- `*.ts`: Standalone actions in packages/bunbase/src/
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

The main `bunbase` package exports:

- `./` - Core primitives (`action`, `module`, `triggers`, `guards`, `t`, `defineConfig`, `BunbaseConfig`), auth utilities, SaaS services, error classes
- `./db` - Database client (`TypedQueryBuilder`)
- `./logger` - Logging utilities (`Logger`, `LoggerSession`)
- `./cli` - CLI tooling (bin: `bunbase`)

> Runtime internals (`BunbaseServer`, `ActionRegistry`, `loadActions`, `WriteBuffer`, `Scheduler`, `McpService`) are NOT exported. They are initialized internally by the `bunbase dev` CLI command.

## CLI Tool

`packages/bunbase/src/cli/` provides the `bunbase` command for:
- Project scaffolding
- Action generation
- Development utilities

## Important Context for Code Changes

### When Adding New Actions
1. Define with `action()` including input/output schemas
2. Choose appropriate trigger(s): API, event, cron, webhook, or MCP
3. Add guards for authorization
4. Use `ctx.db` for database, `ctx.logger` for logging
5. File location determines discovery (standalone `.ts` or in `_module.ts`)

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
