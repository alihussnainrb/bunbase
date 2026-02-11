# Contributing to Bunbase

## Code Patterns

### Action Definition

```typescript
import { action, t, triggers, guards } from 'bunbase'
import type { ActionContext } from 'bunbase'

const InputSchema = t.Object({
  email: t.String({ format: 'email' }),
  name: t.String({ minLength: 1 }),
})

const OutputSchema = t.Object({
  id: t.String(),
  email: t.String(),
})

export default action({
  name: 'createUser',
  description: 'Creates a new user account',
  input: InputSchema,
  output: OutputSchema,
  triggers: [
    triggers.api('POST', '/users'),
    triggers.event('user.invited'),
  ],
  guards: [
    guards.authenticated(),
    guards.hasPermission('users:create'),
  ],
}, async (input, ctx: ActionContext) => {
  const user = await ctx.db.from('users').insert({
    email: input.email,
    name: input.name,
  })
  return { id: user.id, email: user.email }
})
```

Rules:
- Extract complex schemas (>3 properties) to module-level constants
- Always include `description` (used for OpenAPI + MCP tools)
- Use `default export` for standalone actions

### Module Definition

```typescript
// src/modules/billing/_module.ts
import { module, guards } from 'bunbase'
import { createInvoice } from './create-invoice'
import { sendInvoice } from './send-invoice'

export default module({
  name: 'billing',
  description: 'Invoice and payment processing',
  apiPrefix: '/billing',
  guards: [
    guards.authenticated(),
    guards.inOrg(),
    guards.hasFeature('billing'),
  ],
  actions: [createInvoice, sendInvoice],
})
```

Rules:
- `apiPrefix` must start with `/`
- Guards cascade: module guards run before action guards
- Only `default export`

### Trigger Types

```typescript
// API with path parameters
triggers.api('POST', '/users/:id/activate')

// Event bus
triggers.event('payment.succeeded')

// Cron schedule
triggers.cron('0 2 * * *')

// MCP tool for AI agents
triggers.tool({ name: 'create_user', description: 'Create a user account' })

// Webhook with verification
triggers.webhook('/webhooks/stripe', {
  verify: (req) => verifyStripeSignature(req),
  map: (event) => ({ type: event.type, data: event.data.object }),
})
```

Input mapping defaults:
- `triggers.api()`: POST/PUT/PATCH → `req.json()`, GET/DELETE → `url.searchParams`
- `triggers.event()`: Raw event payload
- `triggers.cron()`: Static `input` function or empty object
- `triggers.tool()`: Tool call arguments (auto-mapped from input schema)

### Guard Implementation

```typescript
import type { ActionContext } from '../core/types.ts'
import { GuardError } from './types.ts'

export function myGuard(options: MyGuardOptions): GuardFn {
  return async (ctx: ActionContext) => {
    if (!condition) {
      throw new GuardError('Descriptive error message', 403)
    }
    ctx.someField = computedValue // Guards can populate context
  }
}
```

Status codes:
- 401: Authentication required
- 403: Permission denied, feature gated, plan restriction
- 429: Rate limit exceeded

### Database Queries

Use the chainable `TypedQueryBuilder` API:

```typescript
async (input, ctx) => {
  const { db } = ctx

  // Select with filters
  const user = await db.from('users')
    .eq('id', input.id)
    .select('id', 'email', 'name')
    .single()

  // Select multiple rows
  const members = await db.from('org_memberships')
    .eq('org_id', ctx.auth.orgId)
    .orderBy('joined_at', 'DESC')
    .limit(50)
    .exec()

  // Insert
  const newUser = await db.from('users').insert({
    email: input.email,
    name: input.name,
  })

  // Update
  await db.from('users')
    .eq('id', input.id)
    .update({ name: input.name })

  // Delete
  await db.from('users')
    .eq('id', input.id)
    .delete()
}
```

Available query methods: `eq()`, `neq()`, `gt()`, `gte()`, `lt()`, `lte()`, `in()`, `like()`, `ilike()`, `isNull()`, `isNotNull()`, `select()`, `limit()`, `offset()`, `orderBy()`, `single()`, `maybeSingle()`, `exec()`, `count()`, `insert()`, `update()`, `delete()`, `returning()`

### Error Handling

Let errors propagate — the executor handles them:

```typescript
async (input, ctx) => {
  const user = await ctx.db.from('users').eq('id', input.id).single()

  if (!user) {
    throw new Error('User not found') // Becomes 500
  }

  return user
}
```

For typed errors with specific status codes, use `GuardError` or `BunbaseError`:

```typescript
import { GuardError } from '../guards/types.ts'

throw new GuardError('Not authorized', 403)
```

The server maps error types to HTTP status codes via `instanceof` checks, not string matching.

## File Organization

### Directory Structure

```
packages/bunbase/src/
├── core/           # action, module, types, registry
├── triggers/       # All trigger types
├── guards/         # Built-in and SaaS guards
├── runtime/        # server, loader, executor, scheduler, queue, event-bus
├── persistence/    # WriteBuffer
├── auth/           # Session, password
├── saas/           # Organizations, subscriptions
├── db/             # Query builder, types, schema
├── logger/         # Structured logging
├── studio/         # Studio module + introspection actions
└── cli/            # CLI commands
```

### Import Rules

Internal imports use relative paths with `.ts` extensions:

```typescript
import type { ActionContext } from '../core/types.ts'
import { action } from '../core/action.ts'
import { triggers } from '../triggers/index.ts'
```

Avoid importing from barrel `../../index.ts` (or `../`) inside the framework — import directly from the specific module file. This prevents circular dependencies.

## Coding Standards

### TypeScript

- Strict mode enabled
- Use `.ts` extensions in all imports (Bun requirement)
- Prefer `unknown` over `any` with type guards
- `noUncheckedIndexedAccess` is on — handle `T | undefined` for array access

### Naming

| Thing | Convention | Example |
|-------|-----------|---------|
| Files | kebab-case | `write-buffer.ts` |
| Functions | camelCase | `executeAction` |
| Types/Interfaces | PascalCase | `ActionContext` |
| Actions | camelCase | `createUser` |
| Modules | kebab-case | `billing` |

### Testing

Tests use `bun:test` and live in `packages/bunbase/test/`:

```typescript
import { describe, expect, it } from 'bun:test'

describe('MyFeature', () => {
  it('should do the thing', async () => {
    // Arrange, Act, Assert
  })
})
```

For testing actions that use `ctx.db`, create a mock DB with the chainable API:

```typescript
function createMockDb(overrides: any = {}) {
  return {
    from: (table: string) => {
      const store: any[] = overrides[table] || []
      const wheres: Array<{ col: string; val: any }> = []
      const chain: any = {
        eq: (col: string, val: any) => { wheres.push({ col, val }); return chain },
        select: (..._fields: any[]) => chain,
        limit: (_n: number) => chain,
        single: async () => store.find(r => wheres.every(({ col, val }) => r[col] === val)) || null,
        exec: async () => store.filter(r => wheres.every(({ col, val }) => r[col] === val)),
        insert: async (data: any) => ({ id: 'test-id', ...data }),
      }
      return chain
    },
  }
}
```

### Commands

```bash
bun test              # Run all tests
bun run build         # Build with bunup
bun run lint          # Check with Biome
bun run lint:fix      # Auto-fix lint issues
bun run type-check    # TypeScript checking
```

## Security Checklist

When implementing features:

- Input validated via TypeBox schema
- Guards applied (at least `authenticated()` for user-facing actions)
- Org-scoped queries use `ctx.auth.orgId`
- No SQL injection (use parameterized queries via the query builder)
- Sensitive data not logged (no passwords, tokens, secrets)
- Cookies use `httpOnly`, `secure`, `sameSite` flags

## Debugging

### Trace ID Tracking

Every action execution gets a unique `traceId`:
- Logged with all action logs
- Stored in `action_runs` table
- Use to correlate logs with specific executions

### Common Issues

**Action not registering:**
- Check file exports `export default action(...)`
- Verify `_module.ts` is in the parent directory for module actions

**Route not found:**
- Verify trigger path (case sensitive)
- Check module `apiPrefix` is applied
- Path parameters use `:param` syntax (e.g., `/users/:id`)

**Guard not running:**
- Guards must be in an array: `guards: [guard1(), guard2()]`
- Guards are factory functions — call them: `guards.authenticated()` not `guards.authenticated`

**Circular dependency errors:**
- Don't import from `../../index.ts` inside framework source
- Import directly from the specific module file
