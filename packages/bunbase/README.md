# bunbase

A type-safe, batteries-included backend framework for [Bun](https://bun.sh) that makes building APIs delightful.

## Why Bunbase?

- **🎯 Type-safe by default** - Full end-to-end type safety with TypeBox schemas
- **⚡ Built for Bun** - Leverages Bun's native performance and APIs
- **🔒 Authorization first** - Composable guards with RBAC and multi-tenancy built-in
- **🚀 Zero boilerplate** - Define actions, not routes. File-based discovery just works.
- **🔄 Job queue & scheduler** - Postgres-backed queue with cron support included
- **📡 Multiple triggers** - API, events, cron, webhooks, and MCP tools from one action
- **🎨 HTTP field mapping** - Route fields to body, headers, query, cookies, path automatically
- **📊 Built-in observability** - Action logs, runs tracking, and Studio dashboard
- **🔌 Optional Redis** - Drop-in Redis support for KV store and distributed rate limiting

## Installation

```bash
bun add bunbase
```

## Quick Start

### 1. Initialize a new project

```bash
bunbase init my-app
cd my-app
```

### 2. Configure your database

Create a `bunbase.config.ts`:

```typescript
import { defineConfig } from 'bunbase'

export default defineConfig({
  db: {
    url: process.env.DATABASE_URL || 'postgresql://localhost:5432/myapp',
  },
  server: {
    port: 3000,
  },
})
```

### 3. Create your first action

```typescript
// src/tasks/create-task.action.ts
import { action, t, triggers } from 'bunbase'

export const createTask = action({
  name: 'create-task',
  description: 'Create a new task',
  input: t.Object({
    title: t.String({ minLength: 1, maxLength: 200 }),
    description: t.Optional(t.String()),
  }),
  output: t.Object({
    id: t.String(),
    title: t.String(),
    createdAt: t.String(),
  }),
  triggers: [triggers.api('POST', '/tasks')],
}, async ({ input, ctx }) => {
  const task = await ctx.db
    .from('tasks')
    .insert({ title: input.title, description: input.description })
    .returning('id', 'title', 'created_at')
    .single()

  return {
    id: task.id,
    title: task.title,
    createdAt: task.created_at,
  }
})
```

### 4. Run your server

```bash
bunbase dev
```

Your API is now live at `http://localhost:3000/tasks`! 🎉

## Core Concepts

### Actions

Actions are the fundamental building blocks of Bunbase. They are reusable, validated functions that represent atomic units of work.

```typescript
import { action, t, triggers, guards } from 'bunbase'

export const updateProfile = action({
  name: 'update-profile',
  description: 'Update user profile',

  // TypeBox input schema with validation
  input: t.Object({
    name: t.String({ minLength: 2 }),
    bio: t.Optional(t.String({ maxLength: 500 })),
  }),

  // TypeBox output schema
  output: t.Object({
    id: t.String(),
    name: t.String(),
    bio: t.Union([t.String(), t.Null()]),
  }),

  // How this action can be invoked
  triggers: [
    triggers.api('PATCH', '/profile'),
  ],

  // Authorization checks
  guards: [guards.authenticated()],

  // Optional retry configuration
  retry: {
    maxAttempts: 3,
    backoff: 'exponential',
    backoffMs: 1000,
  },
}, async ({ input, ctx }) => {
  // ctx provides: db, logger, auth, event, queue, scheduler
  const user = await ctx.db
    .from('users')
    .eq('id', ctx.auth.userId)
    .update({ name: input.name, bio: input.bio })
    .returning('id', 'name', 'bio')
    .single()

  return user
})
```

### Modules

Modules group related actions with shared configuration:

```typescript
// src/billing/_module.ts
import { module, guards } from 'bunbase'
import { createSubscription } from './create-subscription.action.ts'
import { cancelSubscription } from './cancel-subscription.action.ts'
import { getInvoices } from './get-invoices.action.ts'

export default module({
  name: 'billing',
  description: 'Subscription and billing management',
  apiPrefix: '/billing', // All action routes prefixed with this
  guards: [guards.authenticated(), guards.hasFeature('billing')],
  actions: [createSubscription, cancelSubscription, getInvoices],
})
```

### Triggers

Actions can be invoked through multiple triggers:

```typescript
// API endpoint
triggers.api('POST', '/tasks')

// Scheduled cron job
triggers.cron('0 0 * * *', { timezone: 'America/New_York' })

// Event-driven
triggers.event('task.completed')

// Webhook with signature verification
triggers.webhook('/webhooks/stripe', {
  verify: async (req) => verifyStripeSignature(req)
})

// MCP tool (for AI assistants)
triggers.mcp({
  description: 'Create a new task',
  parameters: { /* ... */ }
})
```

## Database

Bunbase includes a type-safe query builder with fluent API:

### Query Building

```typescript
// Select with filters
const tasks = await ctx.db
  .from('tasks')
  .eq('status', 'active')
  .gt('priority', 5)
  .orderBy('created_at', 'desc')
  .limit(10)
  .exec()

// Single record
const user = await ctx.db
  .from('users')
  .eq('email', 'user@example.com')
  .single() // Throws if not found

// Maybe single (returns null if not found)
const task = await ctx.db
  .from('tasks')
  .eq('id', taskId)
  .maybeSingle()

// Insert
const newTask = await ctx.db
  .from('tasks')
  .insert({ title: 'New task', status: 'pending' })
  .returning('id', 'title', 'created_at')
  .single()

// Update
await ctx.db
  .from('tasks')
  .eq('id', taskId)
  .update({ status: 'completed', completed_at: new Date().toISOString() })
  .exec()

// Delete
await ctx.db
  .from('tasks')
  .eq('status', 'archived')
  .delete()
  .exec()

// Count
const { count } = await ctx.db
  .from('tasks')
  .eq('status', 'active')
  .count()
```

### Type Generation

Generate TypeScript types from your PostgreSQL database:

```bash
bunbase typegen:db
```

This creates `.bunbase/database.d.ts` with Row/Insert/Update types for all tables. The types are automatically picked up by the database client via module augmentation.

```typescript
// Types are automatically inferred!
const user = await ctx.db.from('users').eq('id', userId).single()
//    ^? { id: string; email: string; name: string; ... }
```

## Guards & Authorization

Guards are composable authorization functions that run before action handlers:

### Built-in Guards

```typescript
import { guards } from 'bunbase'

// Require authenticated user
guards.authenticated()

// Role-based access control
guards.hasRole('admin')
guards.hasPermission('tasks:delete')

// Multi-tenant SaaS
guards.inOrg() // User must be in an organization
guards.hasFeature('advanced-analytics') // Org must have feature
guards.trialActiveOrPaid() // Org must have active trial or paid plan

// Rate limiting
guards.rateLimit({
  points: 100,        // 100 requests
  duration: 60000,    // per 60 seconds
  keyPrefix: 'api',
  blockDuration: 300000, // Block for 5 minutes if exceeded
})
```

### Custom Guards

```typescript
import { type GuardFn, GuardError } from 'bunbase'

function isTaskOwner(): GuardFn {
  return async ({ input, ctx }) => {
    const task = await ctx.db
      .from('tasks')
      .eq('id', input.taskId)
      .single()

    if (task.created_by !== ctx.auth.userId) {
      throw new GuardError('Not authorized to access this task', 403)
    }
  }
}

// Use in action
export const deleteTask = action({
  guards: [guards.authenticated(), isTaskOwner()],
  // ...
})
```

## HTTP Field Mapping

Route fields to different HTTP locations automatically:

```typescript
import { action, t, triggers, http } from 'bunbase'

export const advancedLogin = action({
  name: 'advanced-login',
  input: t.Object({
    // Regular fields go to JSON body
    email: t.String({ format: 'email' }),
    password: t.String(),

    // Map to HTTP locations
    apiKey: http.Header(t.String(), 'X-API-Key'),
    remember: http.Query(t.Boolean()),
    deviceId: http.Cookie(t.String()),
  }),
  output: t.Object({
    user: t.Object({ id: t.String(), email: t.String() }),
    token: t.String(),

    // Response headers and cookies
    userId: http.Header(t.String(), 'X-User-ID'),
    refreshToken: http.Cookie(t.String(), 'refresh_token', {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    }),
  }),
  triggers: [triggers.api('POST', '/auth/login')],
}, async ({ input, ctx }) => {
  // All fields are available in input
  // HTTP routing happens automatically
  const user = await authenticateUser(input.email, input.password)
  const token = generateToken(user.id)

  return {
    user: { id: user.id, email: user.email },
    token,
    userId: user.id, // Will be in X-User-ID response header
    refreshToken: 'refresh_token_value', // Will be in Set-Cookie header
  }
})
```

When using [@bunbase/react](../react), the client automatically handles all HTTP field routing based on your backend schema.

## Job Queue

Postgres-backed job queue with priorities, retries, and dead letter queue:

```typescript
// Push a job
await ctx.queue.push('send-email', {
  to: 'user@example.com',
  subject: 'Welcome!',
  body: 'Thanks for signing up',
}, {
  priority: 10, // Higher priority = processed first
  delay: 5000,  // Delay 5 seconds
})

// Define job handler
export const sendEmail = action({
  name: 'send-email',
  triggers: [triggers.job()],
  input: t.Object({
    to: t.String({ format: 'email' }),
    subject: t.String(),
    body: t.String(),
  }),
  output: t.Object({
    messageId: t.String(),
  }),
  retry: {
    maxAttempts: 5,
    backoff: 'exponential',
    backoffMs: 1000,
    maxBackoffMs: 30000,
  },
}, async ({ input, ctx }) => {
  const messageId = await emailService.send(input)
  return { messageId }
})
```

## Scheduler

Schedule actions to run at specific times or intervals:

```typescript
// Cron-based scheduling
export const dailyReport = action({
  name: 'daily-report',
  triggers: [
    triggers.cron('0 9 * * *', { timezone: 'America/New_York' })
  ],
}, async ({ ctx }) => {
  const report = await generateDailyReport()
  await ctx.event.emit('report.generated', { report })
})

// One-time delayed execution
await ctx.scheduler.schedule(
  'send-reminder',
  { taskId: task.id },
  new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours from now
)
```

## Event Bus

In-memory event emitter for action-to-action communication:

```typescript
// Emit event
await ctx.event.emit('task.created', {
  taskId: task.id,
  title: task.title,
  createdBy: ctx.auth.userId,
})

// Listen for event
export const onTaskCreated = action({
  name: 'on-task-created',
  triggers: [triggers.event('task.created')],
  input: t.Object({
    taskId: t.String(),
    title: t.String(),
    createdBy: t.String(),
  }),
}, async ({ input, ctx }) => {
  // Send notifications, update analytics, etc.
  await ctx.queue.push('send-notification', {
    userId: input.createdBy,
    message: `Task "${input.title}" created`,
  })
})
```

## Redis Support (Optional)

Add Redis for high-performance KV operations and distributed rate limiting:

```typescript
// bunbase.config.ts
export default defineConfig({
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    connectionTimeout: 5000,
    autoReconnect: true,
    maxRetries: 10,
    tls: false,
  },
  db: { /* ... */ },
})
```

When Redis is configured:
- **KV Store**: ~10-100x faster than Postgres for key-value operations
- **Rate Limiting**: Distributed rate limiting across multiple server instances
- **Auto-fallback**: Falls back to Postgres/in-memory if Redis unavailable

```typescript
// KV operations (uses Redis if configured, Postgres otherwise)
await ctx.kv.set('user:123:preferences', { theme: 'dark' })
const prefs = await ctx.kv.get('user:123:preferences')
await ctx.kv.delete('user:123:preferences')

// Rate limiting automatically uses Redis when available
guards.rateLimit({ points: 100, duration: 60000 })
```

## CLI Commands

```bash
# Initialize new project
bunbase init <project-name>

# Generate action or module
bunbase generate action <name>
bunbase generate module <name>

# Database migrations
bunbase migrate           # Run pending migrations
bunbase migrate new <name> # Create new migration

# Type generation
bunbase typegen:db                        # PostgreSQL → TypeScript
bunbase typegen:react --url <backend-url> # Backend schema → React types

# Development server
bunbase dev

# Production build
bun run build
```

## Configuration

Complete `bunbase.config.ts` example:

```typescript
import { defineConfig } from 'bunbase'

export default defineConfig({
  // Database configuration (required)
  db: {
    url: process.env.DATABASE_URL!,
  },

  // Server configuration
  server: {
    port: 3000,
    hostname: '0.0.0.0',
    cors: {
      origin: ['http://localhost:3000', 'https://myapp.com'],
      credentials: true,
    },
  },

  // Redis configuration (optional)
  redis: {
    url: process.env.REDIS_URL,
    connectionTimeout: 5000,
    idleTimeout: 30000,
    autoReconnect: true,
    maxRetries: 10,
    tls: false,
  },

  // Session configuration
  session: {
    secret: process.env.SESSION_SECRET!,
    cookieName: 'my_session',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },

  // Logging configuration
  logging: {
    level: 'info',
    pretty: true,
  },

  // Write buffer for action logs/runs
  writeBuffer: {
    flushInterval: 2000,  // Flush every 2 seconds
    maxSize: 500,         // Or when 500 entries buffered
  },

  // Queue configuration
  queue: {
    pollInterval: 1000,   // Check for jobs every second
    maxConcurrency: 10,   // Process up to 10 jobs concurrently
  },
})
```

## Studio Dashboard

Bunbase includes a built-in development dashboard at `http://localhost:3000/_studio`:

- 📊 View all registered actions and modules
- 🔍 Browse action execution logs and runs
- ⚡ Monitor performance metrics
- 🎯 Test actions directly from the UI
- 📈 Success rates and average duration stats

## React Integration

Generate fully-typed React client with automatic HTTP field routing:

```bash
bunbase typegen:react --url http://localhost:3000
```

```typescript
import { createBunbaseClient } from '@bunbase/react'
import type { BunbaseAPI } from './.bunbase/api'
import { bunbaseAPISchema } from './.bunbase/api'

export const bunbase = createBunbaseClient<BunbaseAPI>({
  baseUrl: 'http://localhost:3000',
  schema: bunbaseAPISchema, // Enables automatic field routing
})

// Use in components
function TaskList() {
  const { data, isLoading } = bunbase.useQuery('list-tasks', {
    status: 'active'
  })

  const createTask = bunbase.useMutation('create-task')

  // Full type safety and automatic HTTP field routing!
}
```

See [@bunbase/react](../react) for complete documentation.

## Error Handling

```typescript
import { GuardError, NonRetriableError } from 'bunbase'

// Guard errors (401/403/429)
throw new GuardError('Not authorized', 403)

// Non-retriable errors (won't retry even if retry config exists)
throw new NonRetriableError('Invalid payment method')

// Regular errors (will retry based on action retry config)
throw new Error('External API timeout')
```

## Multi-Tenant SaaS

Built-in support for multi-tenant applications:

```typescript
import { guards } from 'bunbase'

// Ensure user is in an organization
guards.inOrg()

// Check organization has feature
guards.hasFeature('advanced-analytics')

// Check subscription status
guards.trialActiveOrPaid()

// Access current org in action
async ({ ctx }) => {
  const orgId = ctx.auth.orgId
  const org = await ctx.db.from('organizations').eq('id', orgId).single()
}
```

## Observability

Every action execution is automatically tracked:

```typescript
// Access action run info
async ({ ctx }) => {
  ctx.logger.info('Processing task', { taskId: '123' })

  // Current retry attempt (if using retry)
  if (ctx.retry.attempt > 1) {
    ctx.logger.warn(`Retry attempt ${ctx.retry.attempt}/${ctx.retry.maxAttempts}`)
  }
}
```

Action logs and runs are stored in the database and visible in Studio.

## TypeScript

Bunbase is written in TypeScript with strict mode and provides:

- Full type inference for database queries
- TypeBox schemas for runtime validation and type generation
- Generated types from database schema
- End-to-end type safety with React client

## Examples

- [Basic Example](../../examples/basic) - Complete working app with all features
- [AMANTRA Control Panel](../../examples/amantra-cpanel) - Real-world SaaS application

## Architecture

Bunbase follows these principles:

- **Composition over inheritance** - Guards, triggers, and actions are composable functions
- **Registry pattern** - Single ActionRegistry holds all discovered actions
- **Builder pattern** - Fluent APIs for actions, modules, triggers, queries
- **Write buffering** - Batched writes to avoid database bombardment
- **Convention over configuration** - File-based discovery, sensible defaults

## Performance

- Built on Bun's native HTTP server and SQLite/PostgreSQL client
- Automatic request batching with write buffer
- Optional Redis for high-performance operations
- Efficient query builder with minimal overhead
- Zero-copy cookie parsing with Bun's CookieMap

## Contributing

Issues and PRs welcome! See [CONTRIBUTING.md](../../CONTRIBUTING.md).

## License

MIT

---

Built with ❤️ using [Bun](https://bun.sh)
