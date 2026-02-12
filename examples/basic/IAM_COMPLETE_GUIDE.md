# Bunbase IAM - 100% Use Case Guide

This guide explains how to achieve **100% coverage** of authorization use cases by combining **fast guards** with **dynamic IAM**.

## The Missing 5%: Permission Resolution at Login

The initial implementation (95% solution) had a gap: `ctx.auth.permissions` was empty, so `guards.hasPermission()` didn't work.

### The Problem

```typescript
// ❌ Doesn't work - ctx.auth.permissions is []
guards: [hasPermission('article:publish')]

// ✅ Works but requires DB query
const { allowed } = await ctx.iam.can('article:publish')
```

### The Solution: Resolve Permissions at Login

Use `buildAuthContext()` helper during login to:
1. Query user's role permissions from database
2. Store them in session/JWT
3. Populate `ctx.auth.permissions` from session

## Complete Login Flow (100% Solution)

```typescript
import { action, buildAuthContext, SessionManager, triggers, t } from 'bunbase'

export const login = action({
  name: 'auth.login',
  input: t.Object({
    email: t.String({ format: 'email' }),
    password: t.String()
  }),
  triggers: [triggers.api('POST', '/auth/login')]
}, async (input, ctx) => {
  // 1. Authenticate user
  const user = await ctx.db
    .from('users')
    .eq('email', input.email)
    .single()

  if (!user) throw new Error('Invalid credentials')

  // Verify password...

  // 2. Get user's role from org membership
  const membership = await ctx.db
    .from('org_memberships')
    .eq('user_id', user.id)
    .single()

  // 3. 🎯 Resolve permissions from database (THE MISSING PIECE!)
  const authContext = await buildAuthContext(ctx.db, {
    userId: user.id,
    orgId: membership.org_id,
    role: membership.role  // e.g., 'org:admin'
  })

  // authContext = {
  //   userId: '...',
  //   orgId: '...',
  //   role: 'org:admin',
  //   permissions: ['*']  // 🎯 Resolved from database!
  // }

  // 4. Create session with permissions
  const session = new SessionManager({ secret: process.env.SESSION_SECRET })
  const token = session.createSession({
    userId: authContext.userId,
    orgId: authContext.orgId,
    role: authContext.role,
    permissions: authContext.permissions  // 🎯 Store in session!
  })

  // 5. Set cookie
  ctx.response?.setCookie('bunbase_session', token, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 7  // 7 days
  })

  return { success: true, userId: user.id }
})
```

## After Login: 100% Coverage

Once permissions are in the session, **both approaches work**:

### Approach 1: Fast Guards (0 DB Queries)

```typescript
import { guards } from 'bunbase'

export const publishArticle = action({
  guards: [
    guards.authenticated(),
    guards.hasPermission('article:publish')  // ✅ Works! No DB query
  ]
}, async (input, ctx) => {
  // ctx.auth.permissions = ['article:*', 'users:read', ...]
  // Guard already checked permission above
  await ctx.db.from('articles').eq('id', input.articleId).update({ status: 'published' })
})
```

**Performance**: <1ms (in-memory check)

### Approach 2: Dynamic IAM (1 DB Query, Cached)

```typescript
export const deleteArticle = action({
  guards: [guards.authenticated()]
}, async (input, ctx) => {
  // Query DB on first call, then cached for 5 min
  const { allowed, reason } = await ctx.iam.can('article:delete')

  if (!allowed) {
    throw new Forbidden(reason)
  }

  await ctx.db.from('articles').eq('id', input.articleId).delete()
})
```

**Performance**: 5-20ms (first call), <1ms (cached)

## 100% Use Case Matrix

| Scenario | Use Guards | Use ctx.iam | Why |
|----------|------------|-------------|-----|
| **Check if authenticated** | ✅ `authenticated()` | ❌ | Guards are faster |
| **Check single role** | ✅ `hasRole('admin')` | ❌ | Guards are faster |
| **Check static permission** | ✅ `hasPermission('users:read')` | ✅ `ctx.iam.can()` | Both work - guards faster |
| **Check dynamic permission** | ❌ | ✅ `ctx.iam.can()` | Admins can change permissions |
| **Programmatic permission checks** | ❌ | ✅ `ctx.iam.can()` | Guards can't be called in handlers |
| **Conditional logic based on permissions** | ❌ | ✅ `ctx.iam.canAll()` | Need to branch in code |
| **Admin permission management** | ❌ | ✅ `ctx.iam.roles.*` | Create/update roles via API |

## Helper Functions

### `buildAuthContext(db, data)`

Resolves permissions for a user and returns complete auth context.

```typescript
const authContext = await buildAuthContext(ctx.db, {
  userId: user.id,
  orgId: org.id,
  role: 'org:admin'
})
// Returns: { userId, orgId, role, permissions: ['*'] }
```

### `resolvePermissions(db, roleKey)`

Resolves just the permissions array for a role.

```typescript
const permissions = await resolvePermissions(ctx.db, 'org:admin')
// Returns: ['*']

const permissions2 = await resolvePermissions(ctx.db, 'org:member')
// Returns: ['org:read', 'org:members:read']
```

### `hasPermission(permissions, permission)`

Client-side permission check with namespace wildcard support.

```typescript
const permissions = ['article:*', 'users:read']

hasPermission(permissions, 'article:publish')  // true (namespace wildcard)
hasPermission(permissions, 'article:delete')   // true (namespace wildcard)
hasPermission(permissions, 'users:read')       // true (exact match)
hasPermission(permissions, 'users:delete')     // false
hasPermission(['*'], 'anything')               // true (superadmin)
```

## Trade-offs: Session Size vs Performance

### Option 1: Store Permissions in Session (Recommended)

**Pros:**
- ✅ Guards work without DB queries
- ✅ Zero latency for permission checks
- ✅ 100% offline (no DB dependency)

**Cons:**
- ❌ Session/JWT grows with permissions
- ❌ Must re-login to get new permissions
- ❌ Can hit cookie size limits (4KB)

**Best For:** Most applications

### Option 2: Always Query DB

**Pros:**
- ✅ Session stays small
- ✅ Permission changes apply immediately
- ✅ No cookie size issues

**Cons:**
- ❌ Adds 5-20ms per request (cached: <1ms)
- ❌ Requires DB availability
- ❌ Guards can't check permissions

**Best For:** Enterprise apps with frequent permission changes

### Hybrid Approach (Recommended)

Store **common permissions** in session, query **rare permissions** via `ctx.iam.can()`:

```typescript
// Login: Store only essential permissions
const corePermissions = ['org:read', 'org:members:read', 'users:read']
const token = session.createSession({
  userId: user.id,
  role: 'org:member',
  permissions: corePermissions  // Small, essential set
})

// Action: Check rare permission via ctx.iam
export const deleteOrganization = action({
  guards: [guards.authenticated()]  // Fast check
}, async (input, ctx) => {
  // Rare permission - query DB (cached)
  const { allowed } = await ctx.iam.can('org:delete')
  if (!allowed) throw new Forbidden()

  await ctx.db.from('organizations').eq('id', input.orgId).delete()
})
```

## Namespace Wildcards

Both guards and `ctx.iam` support namespace wildcards:

```typescript
// Grant all article permissions
await ctx.iam.roles.assignPermission('org:editor', 'article:*')

// Now these all work:
await ctx.iam.can('article:create')   // true
await ctx.iam.can('article:publish')  // true
await ctx.iam.can('article:delete')   // true
await ctx.iam.can('users:delete')     // false (different namespace)
```

## Permission Invalidation

After changing permissions, invalidate the cache OR force re-login:

### Option 1: Invalidate Cache (Fast)

```typescript
// Admin changes permissions
await ctx.iam.roles.assignPermission('org:editor', 'article:publish')
ctx.iam.invalidateCache('org:editor')  // Clear cache

// Next ctx.iam.can() call fetches fresh permissions from DB
```

**Pros:** Immediate effect
**Cons:** Session permissions still stale

### Option 2: Force Re-login (Complete)

```typescript
// Admin changes permissions
await ctx.iam.roles.assignPermission('org:editor', 'article:publish')

// Invalidate all sessions (custom logic)
await ctx.db.from('sessions').eq('role', 'org:editor').delete()

// Users must re-login to get new permissions
```

**Pros:** Session + cache both refreshed
**Cons:** Disrupts user experience

### Recommended: Hybrid

- Use cache invalidation for `ctx.iam.can()` checks
- Store **critical** permissions in session
- Force re-login for **major** role changes

## Complete Example: E-commerce App

```typescript
// Login with permissions
export const login = action({...}, async (input, ctx) => {
  // ... authenticate user ...

  const authContext = await buildAuthContext(ctx.db, {
    userId: user.id,
    orgId: org.id,
    role: membership.role
  })

  const token = session.createSession(authContext)
  ctx.response?.setCookie('bunbase_session', token)

  return { success: true }
})

// View products (no auth required)
export const listProducts = action({...}, async (input, ctx) => {
  return ctx.db.from('products').select('*').exec()
})

// Add to cart (authenticated only)
export const addToCart = action({
  guards: [guards.authenticated()]  // Fast check
}, async (input, ctx) => {
  return ctx.db.from('cart').insert({
    user_id: ctx.auth.userId,
    product_id: input.productId
  })
})

// Create product (requires permission)
export const createProduct = action({
  guards: [
    guards.authenticated(),
    guards.hasPermission('products:create')  // ✅ Works! (from session)
  ]
}, async (input, ctx) => {
  return ctx.db.from('products').insert(input)
})

// Delete user account (requires permission + dynamic check)
export const deleteAccount = action({
  guards: [guards.authenticated()]
}, async (input, ctx) => {
  // Dynamic check for sensitive operation
  const { allowed } = await ctx.iam.can('users:delete_own_account')

  if (!allowed) {
    throw new Forbidden('Contact admin to delete your account')
  }

  await ctx.db.from('users').eq('id', ctx.auth.userId).delete()
})
```

## Summary: 100% Coverage

| What | How | Performance |
|------|-----|-------------|
| **Login** | `buildAuthContext()` | One-time: 10-30ms |
| **Auth Check** | `guards.authenticated()` | <1ms |
| **Role Check** | `guards.hasRole()` | <1ms |
| **Permission Check (Static)** | `guards.hasPermission()` | <1ms |
| **Permission Check (Dynamic)** | `ctx.iam.can()` | 5-20ms (first), <1ms (cached) |
| **Admin Role Management** | `ctx.iam.roles.*` | 10-50ms |

**The Missing Piece (Now Included):**
- `buildAuthContext()` - Resolves permissions at login
- `resolvePermissions()` - Fetch permissions for a role
- `hasPermission()` - Client-side permission checker

**Result:** 100% of authorization use cases covered with optimal performance!
