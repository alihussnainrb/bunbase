# Bunbase IAM System Guide

This guide explains Bunbase's hybrid IAM (Identity & Access Management) system that combines **fast in-memory guards** with **dynamic database-backed RBAC**.

## Architecture Overview

### The Hybrid Approach

Bunbase uses a two-tier authorization model:

1. **Session-Based Guards** (Fast, No DB)
   - Simple checks against session/token data
   - Zero database overhead
   - Used for common patterns like `authenticated()`, `hasRole('admin')`

2. **Dynamic RBAC** (Database-Backed, Cached)
   - Roles and permissions stored in database
   - Admins can manage via API without code changes
   - Results cached for 5 minutes
   - Used when you need granular, configurable permissions

## When to Use Each

### Use Guards When:
- ✅ Checking if user is authenticated
- ✅ Checking user's single role (e.g., `hasRole('owner')`)
- ✅ Checking org membership (`inOrg()`)
- ✅ Simple, static checks that don't change often

```typescript
export const listUsers = action({
  guards: [authenticated(), hasRole('admin')]
}, async (input, ctx) => {
  // Fast - no DB queries
  return await ctx.db.from('users').exec()
})
```

### Use `ctx.iam.can()` When:
- ✅ Need granular permission checks
- ✅ Permissions change frequently
- ✅ Admins should manage permissions without code deploys
- ✅ Multi-role scenarios
- ✅ Namespace-based permissions (e.g., `article:*` grants `article:publish`)

```typescript
export const publishArticle = action({
  guards: [authenticated()] // Light guard only
}, async (input, ctx) => {
  // Dynamic permission check (DB + cache)
  const { allowed, reason } = await ctx.iam.can('article:publish')

  if (!allowed) {
    throw new Forbidden(reason)
  }

  // ... publish logic
})
```

## Database Schema

The IAM system uses three tables:

```sql
-- Roles with hierarchy (weight)
CREATE TABLE roles (
  id UUID PRIMARY KEY,
  key VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  weight INT DEFAULT 0, -- Higher = more powerful
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Permissions (granular capabilities)
CREATE TABLE permissions (
  id UUID PRIMARY KEY,
  key VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Role-Permission mappings
CREATE TABLE role_permissions (
  role_id UUID REFERENCES roles(id),
  permission_id UUID REFERENCES permissions(id),
  PRIMARY KEY (role_id, permission_id)
);
```

### Default Roles (Seeded Automatically)

| Role Key | Weight | Permissions |
|----------|--------|-------------|
| `org:admin` | 100 | All permissions (`*`) |
| `org:billing_manager` | 50 | Billing + read permissions |
| `org:member` | 10 | Read-only permissions |

## Context API

### `ctx.auth` (Identity)

```typescript
ctx.auth = {
  userId: 'uuid',
  orgId: 'uuid',
  role: 'org:admin', // Single role string from session

  // Lazy loaders (only query DB when called)
  user: async () => {
    return {
      id: string,
      email: string,
      name: string | null,
      created_at: Date,
      // ... other fields
    }
  },

  team: async () => {
    return {
      id: string,
      name: string,
      slug: string,
      owner_id: string,
      // ... other fields
    }
  }
}
```

### `ctx.iam` (Authorization)

```typescript
ctx.iam = {
  // Check single permission (cached)
  can: async (permission: string) => {
    return { allowed: boolean, reason?: string }
  },

  // Check multiple permissions at once
  canAll: async (permissions: string[]) => {
    return Map<string, boolean>
  },

  // Role management (admin only)
  roles: {
    createRole(data): Promise<Role>
    getRole(key): Promise<Role | null>
    getAllRoles(): Promise<Role[]>
    updateRole(key, data): Promise<Role>
    deleteRole(key): Promise<void>

    createPermission(data): Promise<Permission>
    getPermission(key): Promise<Permission | null>
    getAllPermissions(): Promise<Permission[]>

    assignPermission(roleKey, permKey): Promise<void>
    revokePermission(roleKey, permKey): Promise<void>
    getRolePermissions(roleKey): Promise<string[]>
    hasPermission(roleKey, permKey): Promise<boolean>
  },

  // Cache management
  invalidateCache: (roleKey?: string) => void
}
```

## Usage Examples

### Example 1: Simple Article Publishing

```typescript
export const publishArticle = action({
  name: 'articles.publish',
  input: t.Object({ articleId: t.String() }),
  output: t.Object({ success: t.Boolean() }),
  guards: [authenticated()], // Fast check only
}, async (input, ctx) => {
  // Dynamic permission check
  const { allowed } = await ctx.iam.can('article:publish')

  if (!allowed) {
    throw new Forbidden('Missing article:publish permission')
  }

  await ctx.db
    .from('articles')
    .eq('id', input.articleId)
    .update({ status: 'published' })
    .exec()

  return { success: true }
})
```

### Example 2: Multi-Permission Check

```typescript
export const deleteUser = action({
  guards: [authenticated()],
}, async (input, ctx) => {
  // Check multiple permissions at once
  const results = await ctx.iam.canAll([
    'users:delete',
    'users:view_sensitive_data'
  ])

  if (!results.get('users:delete')) {
    throw new Forbidden('Cannot delete users')
  }

  // ... delete logic
})
```

### Example 3: Admin Role Management

```typescript
export const createModeratorRole = action({
  guards: [authenticated(), hasRole('org:admin')],
}, async (input, ctx) => {
  // Create new role dynamically
  const role = await ctx.iam.roles.createRole({
    key: 'org:moderator',
    name: 'Content Moderator',
    weight: 30 // Between member (10) and billing_manager (50)
  })

  // Assign permissions
  await ctx.iam.roles.assignPermission('org:moderator', 'article:approve')
  await ctx.iam.roles.assignPermission('org:moderator', 'article:reject')

  // Clear cache so changes take effect immediately
  ctx.iam.invalidateCache()

  return role
})
```

### Example 4: Namespace Wildcards

The permission system supports namespace wildcards:

```typescript
// Grant all article permissions
await ctx.iam.roles.assignPermission('org:editor', 'article:*')

// Now these all return true:
await ctx.iam.can('article:publish') // ✅
await ctx.iam.can('article:delete')  // ✅
await ctx.iam.can('article:edit')    // ✅
```

### Example 5: Lazy User Loading

```typescript
export const getUserProfile = action({
  guards: [authenticated()],
}, async (input, ctx) => {
  // Only queries DB when called
  const user = await ctx.auth.user()
  const team = await ctx.auth.team()

  return {
    user: {
      email: user.email,
      name: user.name,
    },
    team: {
      name: team.name,
      slug: team.slug,
    }
  }
})
```

## Performance Characteristics

### Guards (In-Memory)
- **Latency**: <1ms
- **Overhead**: Zero DB queries
- **Use for**: Authentication, single role checks

### `ctx.iam.can()` (Database-Backed + Cached)
- **First Call**: 5-20ms (DB query)
- **Cached Calls**: <1ms (in-memory lookup)
- **Cache TTL**: 5 minutes
- **Use for**: Granular permissions

### `ctx.auth.user()` / `ctx.auth.team()`
- **Latency**: 5-20ms (DB query)
- **Not Cached**: Always queries DB
- **Use for**: Occasional full profile fetching

## Best Practices

### 1. Use Guards for Coarse-Grained Checks

```typescript
// ✅ Good: Fast guard for common check
guards: [authenticated(), hasRole('admin')]

// ❌ Avoid: Don't use guards for fine-grained permissions
guards: [hasPermission('article:publish:draft:author_only')]
```

### 2. Batch Permission Checks

```typescript
// ✅ Good: Single DB query for multiple checks
const perms = await ctx.iam.canAll(['users:read', 'users:edit', 'users:delete'])

// ❌ Avoid: Multiple separate queries
const canRead = await ctx.iam.can('users:read')
const canEdit = await ctx.iam.can('users:edit')
const canDelete = await ctx.iam.can('users:delete')
```

### 3. Invalidate Cache After Changes

```typescript
// ✅ Good: Clear cache after modifying permissions
await ctx.iam.roles.assignPermission('editor', 'article:publish')
ctx.iam.invalidateCache('editor')

// ❌ Avoid: Forgetting to invalidate (changes take up to 5 min)
await ctx.iam.roles.assignPermission('editor', 'article:publish')
// Users with 'editor' role won't see permission until cache expires!
```

### 4. Use Namespace Wildcards

```typescript
// ✅ Good: Grant broad permissions with wildcards
await ctx.iam.roles.assignPermission('admin', '*') // All permissions
await ctx.iam.roles.assignPermission('editor', 'article:*') // All article permissions

// ❌ Avoid: Assigning every permission individually
await ctx.iam.roles.assignPermission('editor', 'article:create')
await ctx.iam.roles.assignPermission('editor', 'article:edit')
await ctx.iam.roles.assignPermission('editor', 'article:delete')
// ... 20 more lines
```

## Migration from Old System

If you're using the old in-memory `RoleService`:

### Before (Old System)
```typescript
// roles.ts - Hardcoded roles
const roleService = new RoleService()
roleService.addRole({ key: 'owner', permissions: ['*'] })
roleService.addRole({ key: 'member', permissions: ['org:read'] })

// Action
guards: [hasPermission('org:update')]
```

### After (New IAM System)
```typescript
// No code changes for guards - they still work!
guards: [hasRole('owner')]

// But now you can also use dynamic checks:
const { allowed } = await ctx.iam.can('org:update')

// And admins can create roles via API (no code deploy)
await ctx.iam.roles.createRole({ key: 'moderator', weight: 50 })
```

## Admin API Endpoints

The example actions in `examples/basic/src/admin/iam-actions.ts` provide:

- `POST /admin/roles` - Create role
- `GET /admin/roles` - List all roles
- `DELETE /admin/roles/:key` - Delete role
- `POST /admin/permissions` - Create permission
- `GET /admin/permissions` - List permissions
- `POST /admin/roles/:roleKey/permissions` - Assign permission to role
- `DELETE /admin/roles/:roleKey/permissions/:permKey` - Revoke permission
- `GET /admin/roles/:roleKey/permissions` - List role permissions

## Troubleshooting

### "IAM not available: Database not configured"
Make sure database is configured in `bunbase.config.ts`:

```typescript
export default defineConfig({
  database: {
    url: process.env.DATABASE_URL
  }
})
```

### Permission changes not taking effect
Invalidate the cache after modifying permissions:

```typescript
ctx.iam.invalidateCache('roleKey') // Specific role
ctx.iam.invalidateCache()           // All roles
```

### `ctx.iam` is undefined
IAM is only available if:
1. Database is configured
2. You're accessing it inside an action handler (not in guards)

Guards run before context is fully built, so use guards for simple checks and `ctx.iam.can()` inside handlers.

## Summary

| Feature | Guards | `ctx.iam.can()` |
|---------|--------|-----------------|
| **Speed** | <1ms | 5-20ms (first call), <1ms (cached) |
| **DB Queries** | None | 1 per role (cached 5 min) |
| **Dynamic** | No | Yes (admin can change) |
| **Use For** | Authentication, role checks | Granular permissions |
| **Setup** | None | Database required |

**Rule of Thumb**: Use guards for "Is user logged in?" and "Is user an admin?". Use `ctx.iam.can()` for "Can user publish articles?" and other fine-grained permissions that admins should control.
