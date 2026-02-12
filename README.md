# Bunbase

> Type-safe backend framework for Bun

Bunbase is a modern backend framework built specifically for [Bun](https://bun.sh), designed around three core primitives: **Actions**, **Modules**, and **Triggers**. Write validated, reusable backend logic that automatically connects to APIs, cron jobs, webhooks, events, and MCP tools.

## Features

- **Type-safe by default** - Full TypeScript support with automatic database type generation
- **Action-based architecture** - Write reusable, validated functions as atomic units of work
- **Multiple trigger types** - Connect actions to HTTP APIs, cron schedules, webhooks, events, or MCP tools
- **Built-in guards** - Authentication, authorization, rate limiting, and custom validation
- **Automatic retries** - Configurable retry logic with exponential or fixed backoff
- **Database client** - Fluent, type-safe PostgreSQL query builder
- **Queue & Scheduler** - Background jobs and delayed execution out of the box
- **Event bus** - Internal pub/sub for action orchestration
- **Development UI** - Built-in Studio dashboard for monitoring and debugging
- **CLI tooling** - Project scaffolding, code generation, migrations, and type generation

## Installation

```bash
bun add bunbase
```

Or create a new project:

```bash
bunx bunbase init my-app
cd my-app
bun install
bun run dev
```

## Quick Start

### 1. Define an Action

```typescript
// src/actions/greet.ts
import { action, t, triggers } from 'bunbase'

export const greet = action(
  {
    name: 'greet',
    description: 'Greet a user by name',
    input: t.Object({
      name: t.String({ minLength: 1 })
    }),
    output: t.Object({
      message: t.String()
    }),
    triggers: [
      triggers.api('GET', '/greet/:name')
    ]
  },
  async (input, ctx) => {
    ctx.logger.info('Greeting user', { name: input.name })

    return {
      message: `Hello, ${input.name}!`
    }
  }
)
```

### 2. Configure Your App

```typescript
// bunbase.config.ts
import { defineConfig } from 'bunbase'

export default defineConfig({
  port: 3000,
  database: {
    url: process.env.DATABASE_URL
  },
  auth: {
    sessionSecret: process.env.SESSION_SECRET!
  }
})
```

### 3. Start the Server

```bash
bun run dev
```

Your action is now available at `http://localhost:3000/greet/World` 🎉

## Core Concepts

### Actions

Actions are validated, reusable functions that represent atomic units of work:

```typescript
export const createUser = action(
  {
    name: 'createUser',
    input: t.Object({
      email: t.String({ format: 'email' }),
      name: t.String()
    }),
    output: t.Object({
      id: t.String(),
      email: t.String()
    }),
    triggers: [triggers.api('POST', '/users')],
    guards: [authenticated()]
  },
  async (input, ctx) => {
    const user = await ctx.db
      .from('users')
      .insert({ email: input.email, name: input.name })

    return user
  }
)
```

### Modules

Group related actions with shared configuration:

```typescript
// src/billing/_module.ts
import { module, guards } from 'bunbase'
import { createInvoice } from './create-invoice.ts'
import { listInvoices } from './list-invoices.ts'

export default module({
  name: 'billing',
  apiPrefix: '/billing',
  guards: [authenticated(), hasFeature('billing')],
  actions: [createInvoice, listInvoices]
})
```

### Triggers

Connect actions to different invocation mechanisms:

```typescript
// HTTP API
triggers.api('POST', '/webhooks/stripe')

// Cron schedule
triggers.cron('0 0 * * *') // Daily at midnight

// Webhook
triggers.webhook('/webhooks/github', {
  verify: (req) => verifyGithubSignature(req)
})

// Event
triggers.event('user.created')

// MCP Tool
triggers.tool('search-users', 'Search for users by email or name')
```

### Guards

Add authorization and validation:

```typescript
import { authenticated, hasRole, hasPermission, rateLimit } from 'bunbase'

export const deleteUser = action(
  {
    name: 'deleteUser',
    guards: [
      authenticated(),
      hasRole('admin'),
      hasPermission('users:delete'),
      rateLimit({ maxRequests: 10, windowMs: 60000 })
    ],
    // ...
  },
  async (input, ctx) => {
    // Handler runs only if all guards pass
  }
)
```

### Database Type Generation

Generate TypeScript types from your PostgreSQL schema:

```bash
bunbase typegen
```

This introspects your database and creates `.bunbase/database.d.ts` with full autocomplete for tables and columns:

```typescript
const user = await ctx.db
  .from('users') // ✓ Autocomplete for table names
  .eq('email', 'test@example.com') // ✓ Autocomplete for columns
  .select('id', 'name', 'email') // ✓ Type-safe field selection
  .single()
```

### Retry Support

Configure automatic retries for actions that call external services:

```typescript
export const sendEmail = action(
  {
    name: 'sendEmail',
    retry: {
      maxAttempts: 3,
      backoff: 'exponential',
      backoffMs: 1000,
      retryIf: (error) => error.message.includes('rate limit')
    },
    // ...
  },
  async (input, ctx) => {
    // Access retry state
    ctx.logger.info(`Attempt ${ctx.retry.attempt} of ${ctx.retry.maxAttempts}`)

    // Call external API (retries automatically on failure)
    await sendgrid.send(input.email)
  }
)
```

## CLI Commands

### Development

```bash
bunbase dev                    # Start development server
bunbase generate action <name> # Generate action scaffold
bunbase generate module <name> # Generate module scaffold
```

### Database

```bash
bunbase migrate               # Run pending migrations
bunbase migrate new <name>    # Create new migration
bunbase migrate status        # Show migration status
bunbase typegen               # Generate TypeScript types from schema
```

### Project Setup

```bash
bunbase init <name>           # Create new Bunbase project
```

## Examples

Check out the [`examples/basic`](./examples/basic) directory for a complete working application demonstrating:

- User authentication with sessions
- CRUD operations with type-safe queries
- API routes with guards
- Cron jobs and scheduled tasks
- Webhook handling
- Event-driven architecture
- Background job processing

## Documentation

- [Architecture Guide](./assets/agent-skills/bunbase-expert/references/architecture.md) - Deep dive into framework internals
- [CLAUDE.md](./CLAUDE.md) - Comprehensive developer guide

## Tech Stack

- **Runtime**: [Bun](https://bun.sh) - Fast JavaScript runtime
- **Validation**: [TypeBox](https://github.com/sinclairzx81/typebox) - JSON Schema Type Builder
- **Database**: PostgreSQL with built-in type-safe query builder
- **Build Tool**: [bunup](https://github.com/wobsoriano/bunup) - Bundle tool for Bun
- **Code Quality**: [Biome](https://biomejs.dev) - Fast linter and formatter

## Project Structure

```text
bunbase/
├── packages/
│   ├── bunbase/          # Core framework (published to NPM)
│   └── studio/           # React-based development UI
├── examples/
│   └── basic/            # Example application
├── assets/
│   └── agent-skills/     # AI agent documentation
└── bunup.config.ts       # Monorepo build configuration
```

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## License

MIT

---

Built with ❤️ using Bun
