# Bunbase Rules for AI Assistant

## Critical Architecture Patterns

### 1. Action Definition Pattern

**ALWAYS follow this structure for actions:**

```typescript
import { action, t } from 'bunbase'
import type { ActionContext } from 'bunbase'

// Define schemas at module level for reuse
const InputSchema = t.Object({
  email: t.String({ format: 'email' }),
  name: t.String({ minLength: 1 }),
})

const OutputSchema = t.Object({
  id: t.String(),
  email: t.String(),
})

export default action({
  name: 'createUser',        // kebab-case or camelCase, unique across app
  description: 'Creates a new user account',  // Used in dashboard + MCP
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
  // Handler implementation
  const { db, logger, traceId, auth } = ctx
  
  logger.info('Creating user', { email: input.email })
  
  const user = await db.from('users').insert({
    email: input.email,
    name: input.name,
  }).returning('*')
  
  return { id: user.id, email: user.email }
})
```

**NEVER:**
- Define schemas inline if they're complex (>3 properties)
- Use `any` types for input/output
- Forget to include `description` (required for MCP tools)
- Name actions with spaces or special characters

### 2. Module Definition Pattern

**ALWAYS use this structure for `_module.ts`:**

```typescript
import { module, guards } from 'bunbase'
import { createInvoice } from './create-invoice'
import { sendInvoice } from './send-invoice'

export default module({
  name: 'billing',           // unique, kebab-case
  description: 'Invoice and payment processing',
  apiPrefix: '/billing',    // leading slash required
  guards: [
    guards.authenticated(),
    guards.inOrg(),
    guards.hasFeature('billing'),
  ],
  actions: [
    createInvoice,
    sendInvoice,
  ],
})
```

**Rules:**
- `apiPrefix` must start with `/`
- Guards cascade: module guards run BEFORE action guards
- Actions are imported then referenced in the array
- Default export ONLY

### 3. Trigger Patterns

**API triggers with custom mapping:**
```typescript
triggers.api('POST', '/users/:id/activate', {
  map: async (req) => {
    const url = new URL(req.url)
    const id = url.pathname.split('/')[2]
    const body = await req.json()
    return { id, ...body }
  },
})
```

**Event triggers:**
```typescript
triggers.event('payment.succeeded', {
  map: (payload) => ({
    paymentId: payload.id,
    amount: payload.amount,
  }),
})
```

**Webhook triggers:**
```typescript
triggers.webhook('/webhooks/stripe', {
  verify: (req) => {
    const signature = req.headers.get('stripe-signature')
    return verifyStripeSignature(signature, req.body)
  },
  map: (event) => ({
    type: event.type,
    data: event.data.object,
  }),
})
```

### 4. Guard Implementation Pattern

**For new guards, follow this template:**

```typescript
import type { ActionContext } from '../core/types.ts'
import { GuardError } from './types.ts'

export function myGuard(options: MyGuardOptions): GuardFn {
  return async (ctx: ActionContext) => {
    // Check condition
    if (!condition) {
      throw new GuardError('Descriptive error message', 403)
    }
    
    // Optionally populate ctx
    ctx.someField = computedValue
  }
}
```

**Guard error status codes:**
- 401: Authentication required (`authenticated()`)
- 403: Permission denied (`hasRole()`, `hasPermission()`, `inOrg()`, `hasFeature()`)
- 429: Rate limit exceeded (`rateLimit()`)

### 5. TypeBox Schema Patterns

**Common patterns:**

```typescript
import { t } from 'bunbase'

// Basic object
const UserInput = t.Object({
  email: t.String({ format: 'email' }),
  name: t.String({ minLength: 1, maxLength: 100 }),
  age: t.Optional(t.Number({ minimum: 0 })),
})

// Union types (enums)
const Role = t.Union([
  t.Literal('admin'),
  t.Literal('member'),
  t.Literal('viewer'),
])

// Arrays
const TagsInput = t.Object({
  tags: t.Array(t.String({ minLength: 1 })),
})

// Nested objects
const Address = t.Object({
  street: t.String(),
  city: t.String(),
  zip: t.String(),
})

const UserWithAddress = t.Object({
  ...UserInput.properties,
  address: Address,
})
```

### 6. Database Access in Actions

**Preferred pattern using db client:**

```typescript
async (input, ctx) => {
  const { db } = ctx
  
  // Select
  const users = await db.from('users')
    .where({ org_id: ctx.auth.orgId })
    .select('*')
  
  // Insert
  const [user] = await db.from('users')
    .insert({ email: input.email })
    .returning('*')
  
  // Update
  await db.from('users')
    .where({ id: input.id })
    .update({ name: input.name })
  
  // Delete
  await db.from('users')
    .where({ id: input.id })
    .delete()
}
```

### 7. Logging Patterns

**Use the structured logger from ctx:**

```typescript
async (input, ctx) => {
  const { logger, traceId } = ctx
  
  // Info logs
  logger.info('Starting operation', { userId: ctx.auth.userId })
  
  // Debug logs (only shown in debug mode)
  logger.debug('Processing item', { itemId: input.id })
  
  // Warn logs
  logger.warn('Unexpected state', { state: 'pending' })
  
  // Error logs (automatically captured)
  try {
    // operation
  } catch (err) {
    logger.error('Operation failed', { error: err.message })
    throw err
  }
}
```

### 8. Error Handling in Actions

**Let errors propagate — executor will handle them:**

```typescript
async (input, ctx) => {
  // DON'T wrap in try/catch unless you need to transform the error
  const user = await db.from('users')
    .where({ id: input.id })
    .first()
  
  if (!user) {
    throw new Error('User not found')  // Will become 500
  }
  
  // For validation errors that should be 400:
  if (!isValid(input.data)) {
    throw new Error('Invalid data format')  // Will become 500
    // Better: let TypeBox validation catch it
  }
  
  return user
}
```

**Note:** The executor maps error messages to status codes:
- "validation failed" → 400
- "Unauthorized" → 401
- "Forbidden" → 403
- "Too Many Requests" → 429

## File Organization Rules

### Directory Structure

```
src/
├── core/           # action, module, types, registry
├── triggers/       # All trigger types
├── guards/         # Built-in and SaaS guards
├── runtime/        # server, loader, executor, scheduler
├── persistence/    # WriteBuffer
├── auth/           # Session, password
├── saas/           # Organizations, roles, billing
├── db/             # Database client, pool, migrations
└── logger/         # Structured logging
```

### Import Patterns

**Internal imports:**
```typescript
// From core
import type { ActionContext } from '../core/types.ts'
import { action } from '../core/action.ts'

// From triggers/guards
import { triggers } from '../triggers/index.ts'
import { guards } from '../guards/index.ts'

// Always use .ts extension for Bun
```

**Public exports (src/index.ts):**
```typescript
export { action } from './core/action.ts'
export { module } from './core/module.ts'
export { triggers } from './triggers/index.ts'
export { guards } from './guards/index.ts'
export { t } from 'typebox'
export type { ActionContext } from './core/types.ts'
```

## Coding Standards

### TypeScript

- **Strict mode enabled** — no implicit any
- **Explicit return types** on public functions
- **Never use `any`** — use `unknown` with type guards if needed
- **Use `.ts` extensions** in all imports (Bun requirement)

### Naming Conventions

- **Files:** kebab-case.ts (e.g., `write-buffer.ts`)
- **Functions:** camelCase (e.g., `executeAction`)
- **Types/Interfaces:** PascalCase (e.g., `ActionContext`)
- **Actions:** camelCase or kebab-case, unique across app
- **Modules:** kebab-case (e.g., `billing`, `user-management`)

### Comments

- JSDoc for public APIs
- Inline comments for complex logic only
- No redundant comments (code should be self-documenting)

### Testing

```typescript
// Test file naming: <name>.test.ts
// Example: action.test.ts, executor.test.ts

import { describe, expect, it } from 'bun:test'
import { action } from './action.ts'

describe('action', () => {
  it('should validate input', async () => {
    const testAction = action({
      name: 'test',
      input: t.Object({ name: t.String() }),
      output: t.Object({ greeting: t.String() }),
      triggers: [],
    }, async (input) => {
      return { greeting: `Hello ${input.name}` }
    })
    
    // Test implementation
  })
})
```

## Common Pitfalls to Avoid

### ❌ Don't Do This

```typescript
// DON'T: Inline complex schemas
action({
  input: t.Object({
    user: t.Object({
      email: t.String(),
      profile: t.Object({
        name: t.String(),
        age: t.Number(),
      }),
    }),
  }),
}, handler)

// DON'T: Use any
async (input: any, ctx: any) => { ... }

// DON'T: Forget to await async guards
async (input, ctx) => {
  guards.authenticated()(ctx)  // Missing await!
}

// DON'T: Manually validate TypeBox schemas
if (!input.name) throw new Error('Name required')  // TypeBox does this

// DON'T: Access db directly from trigger mapping
triggers.api('POST', '/users', {
  map: async (req) => {
    const db = getDb()  // Wrong! Use ctx.db in handler
    return req.json()
  },
})
```

### ✅ Do This Instead

```typescript
// DO: Extract complex schemas
const UserSchema = t.Object({ email: t.String(), profile: ProfileSchema })

// DO: Use proper types
async (input: Static<typeof InputSchema>, ctx: ActionContext) => { ... }

// DO: Await guards properly
// (Guards are run by executor, not manually)

// DO: Let TypeBox handle validation
// (Just define the schema correctly)

// DO: Keep trigger mapping simple, use ctx.db in handler
triggers.api('POST', '/users'),  // Default mapping
// Then access db in action handler
```

## Performance Guidelines

### Action Registry
- Actions are registered at startup, not per-request
- Pre-compiled TypeBox validators
- Routes built once at server start

### Database
- Use connection pooling
- Batch writes via WriteBuffer
- Never do N+1 queries

### WriteBuffer
- Logs/runs buffered, not user/org data
- Configurable flush interval (default 2s)
- Emergency flush at 500 items

## Security Checklist

When implementing features:

- [ ] Input validated via TypeBox schema
- [ ] Guards applied (at least `authenticated()` for user-facing actions)
- [ ] Org-scoped queries use `ctx.auth.orgId`
- [ ] No SQL injection (use parameterized queries)
- [ ] Sensitive data logged carefully (no passwords, tokens)
- [ ] Cookies have httpOnly, secure, sameSite flags

## Working with SaaS Features

### Adding New Guards

Add to `src/guards/saas.ts` if org/plan related:

```typescript
export const saasGuards = {
  inOrg: () => async (ctx: ActionContext) => {
    if (!ctx.auth.orgId) {
      throw new GuardError('Organization context required', 403)
    }
    // Optionally load org into ctx.org
  },
  
  hasFeature: (feature: string) => async (ctx: ActionContext) => {
    if (!ctx.org?.features.includes(feature)) {
      throw new GuardError(`Feature '${feature}' not available`, 403)
    }
  },
  
  // New guard here...
  myNewGuard: (options: MyOptions) => async (ctx: ActionContext) => {
    // Implementation
  },
}
```

Then export from `src/guards/index.ts`:

```typescript
export const guards = {
  // ... existing guards
  myNewGuard: saasGuards.myNewGuard,
}
```

### Database Migrations

Place new SaaS tables in `src/db/schema/`:
- `auth.sql` — users, sessions
- `organizations.sql` — orgs, memberships, invitations
- `rbac.sql` — roles, permissions, role sets
- `billing.sql` — plans, features, subscriptions

## Debugging Tips

### Enable Debug Logging

```typescript
// In bunbase.config.ts or environment
LOG_LEVEL=debug
```

### Check Registered Actions

Server logs routes on startup. Look for:
```
[debug] Registered route: POST:/users
[debug] Registered route: GET:/users/:id
```

### Trace ID Tracking

Every action execution has a `traceId`:
- Logged with all action logs
- Stored in `action_runs` table
- Use to correlate logs with runs

### Common Issues

**Action not registering:**
- Check file exports `export default action(...)`
- Verify `_module.ts` is in parent directory for module actions
- Check for syntax errors in loader logs

**Route not found:**
- Verify trigger path (case sensitive)
- Check module `apiPrefix` is applied
- Ensure server was restarted after changes

**Guard not running:**
- Guards must be in array: `guards: [guard1, guard2]`
- Guards are functions returning functions: `guards.authenticated()` not `guards.authenticated`
- Module guards run before action guards — check module config

## Summary

Remember the core philosophy:
- **Action** = Business logic with typed I/O
- **Trigger** = How it gets invoked (declarative)
- **Guard** = Who can invoke it (pipeline)
- **Context** = What it has access to (injected)

Keep it simple, type-safe, and Bun-native.
