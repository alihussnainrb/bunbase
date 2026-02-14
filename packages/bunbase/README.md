# bunbase

A type-safe, batteries-included backend framework for [Bun](https://bun.sh) that makes building APIs delightful.

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

## Quick Start

```bash
# Create a new project
bunbase init my-app
cd my-app

# Configure your database in bunbase.config.ts
# Run migrations
bunbase migrate

# Start development server
bunbase dev
```

Your API will be running at `http://localhost:3000`!

## Documentation

Full documentation is available at: **[bunbase.vercel.app](https://bunbase.vercel.app)**

- **Getting Started** - Installation, project setup, and first steps
- **Core Concepts** - Actions, modules, triggers, and guards
- **Database** - Type-safe query builder and migrations
- **Queue & Scheduler** - Background jobs and cron tasks
- **Guards & Auth** - Authorization, RBAC, and rate limiting
- **React Integration** - Type-safe React client with `@bunbase/react`
- **API Reference** - Complete API documentation
- **Examples** - Real-world applications and patterns

## Example

```typescript
// src/tasks/create-task.action.ts
import { action, t, triggers } from 'bunbase'

export const createTask = action({
  name: 'create-task',
  input: t.Object({
    title: t.String({ minLength: 1 }),
    description: t.Optional(t.String()),
  }),
  output: t.Object({
    id: t.String(),
    title: t.String(),
  }),
  triggers: [triggers.api('POST', '/tasks')],
}, async (input, ctx) => {
  const task = await ctx.db
    .from('tasks')
    .insert({ title: input.title, description: input.description })
    .returning('id', 'title')
    .single()

  return task
})
```

## CLI Commands

```bash
bunbase init <name>              # Create new project
bunbase dev                       # Start development server
bunbase generate action <name>    # Generate action scaffold
bunbase generate module <name>    # Generate module scaffold
bunbase migrate                   # Run pending migrations
bunbase migrate new <name>        # Create new migration
bunbase typegen:db                # Generate TypeScript types from PostgreSQL
bunbase typegen:react --url <url> # Generate React client types
```

## Project Structure

```text
my-app/
├── src/
│   ├── actions/          # Standalone actions
│   └── modules/          # Module directories with _module.ts
├── migrations/           # Database migrations
├── bunbase.config.ts     # Framework configuration
└── package.json
```

## Examples

Check out complete working examples:

- [`examples/basic`](../../examples/basic) - Full-featured application demonstrating all features
- [`examples/amantra-cpanel`](../../examples/amantra-cpanel) - Real-world SaaS application

## Contributing

Issues and PRs welcome! See [CONTRIBUTING.md](../../CONTRIBUTING.md).

## License

MIT

---

Built with ❤️ using [Bun](https://bun.sh)
