# Bunbase SaaS Authorization Model

Inspired by [Clerk's authorization system](https://clerk.com/docs/guides/organizations/control-access/roles-and-permissions), Bunbase provides a comprehensive multi-tenant SaaS foundation with organizations, roles, permissions, plans, and features.

## Architecture Overview

### Organizations (Multi-tenancy)
- **organizations** - Tenant data with slug-based routing
- **org_memberships** - User-organization relationships with role assignment
- **org_invitations** - Pending invitations with expiration

Similar to Clerk: Organizations are the primary tenant boundary. Users can belong to multiple organizations with different roles in each.

### Roles & Permissions (RBAC)
- **roles** - Organization-level roles (e.g., `org:admin`, `org:member`)
- **permissions** - Granular permissions (e.g., `org:members:manage`, `org:billing:read`)
- **role_permissions** - Role-permission mappings

Similar to Clerk: Role keys follow the `org:role_name` pattern, permissions follow `org:resource:action` pattern.

#### Default Roles (seeded in migration)
- `org:admin` - Full administrative access (all permissions)
- `org:member` - Standard read-only access
- `org:billing_manager` - Billing management + read access

#### Default Permissions (seeded in migration)
- `org:read` - View organization details
- `org:update` - Modify organization settings
- `org:delete` - Delete the organization
- `org:members:read` - View members
- `org:members:manage` - Add/remove members
- `org:invitations:manage` - Manage invitations
- `org:billing:read` - View billing
- `org:billing:manage` - Update billing/subscriptions
- `org:roles:manage` - Assign roles to members

### Plans & Features (SaaS Billing)
- **plans** - Subscription tiers (free, starter, pro, enterprise)
- **features** - Feature flags that gate functionality
- **plan_features** - Plan-feature mappings
- **subscriptions** - Organization subscriptions to plans

Similar to Clerk: Plans are at the organization level (not user level). Features control access to functionality.

#### Default Plans (seeded in migration)
- **Free** ($0/mo) - Basic org + 5 members
- **Starter** ($29/mo) - 25 members + analytics
- **Pro** ($99/mo) - Unlimited members + analytics + API access
- **Enterprise** ($299/mo) - All features including SSO + priority support

#### Default Features (seeded in migration)
- `org:basic` - Create and manage organizations
- `org:members:5` / `org:members:25` / `org:members:unlimited` - Team size limits
- `org:analytics` - Advanced analytics
- `org:api_access` - Programmatic API
- `org:sso` - Single Sign-On
- `org:priority_support` - 24/7 support

## Guard Usage

### Organization Context
```typescript
import { guards, saasGuards } from 'bunbase'

export const myAction = action({
  guards: [
    guards.authenticated(),    // User must be logged in
    saasGuards.inOrg(),       // Loads org context from x-org-id header
  ]
}, async (input, ctx) => {
  // ctx.org is now available
  console.log(ctx.org.id)          // Organization ID
  console.log(ctx.org.plan)        // Current plan key
  console.log(ctx.org.features)    // Array of feature keys
  console.log(ctx.auth.role)       // User's role in this org
  console.log(ctx.auth.permissions) // User's permissions array
})
```

### Permission Checks
```typescript
export const updateOrgAction = action({
  guards: [
    guards.authenticated(),
    saasGuards.inOrg(),
    guards.hasPermission('org:update'),  // Check specific permission
  ]
}, async (input, ctx) => {
  // User has org:update permission
})
```

### Role Checks
```typescript
export const adminAction = action({
  guards: [
    guards.authenticated(),
    saasGuards.inOrg(),
    guards.hasRole('org:admin'),  // Only admins
  ]
}, async (input, ctx) => {
  // User is org:admin
})
```

### Feature Gates
```typescript
export const analyticsAction = action({
  guards: [
    guards.authenticated(),
    saasGuards.inOrg(),
    saasGuards.hasFeature('org:analytics'),  // Plan must include analytics
  ]
}, async (input, ctx) => {
  // Organization's plan includes analytics feature
})
```

### Paid Plan Check
```typescript
export const premiumAction = action({
  guards: [
    guards.authenticated(),
    saasGuards.inOrg(),
    saasGuards.trialActiveOrPaid(),  // Not on free plan
  ]
}, async (input, ctx) => {
  // Organization has active paid/trial subscription
})
```

## Configuration Changes

The `migrations` config has been moved inside the `database` block:

```typescript
// bunbase.config.ts
export default defineConfig({
  database: {
    url: process.env.DATABASE_URL,
    migrations: {
      directory: 'migrations',  // ← Now nested here
    },
  },
})
```

All CLI commands automatically use `config.database.migrations.directory`:
- `bunbase migrate` - Run pending migrations
- `bunbase migrate new <name>` - Create new migration
- `bunbase migrate status` - Show migration status

## Schema Comparison: Clerk vs Bunbase

| Clerk Concept | Bunbase Implementation | Notes |
|---------------|----------------------|-------|
| Organizations | `organizations` table | Same - tenant boundary |
| Organization Memberships | `org_memberships` table | Same - user-org links with roles |
| Roles (org:admin) | `roles` table with `org:admin` key | Same - org-level role keys |
| Permissions | `permissions` table | Same - granular access control |
| Role-Permission Mapping | `role_permissions` junction | Same - many-to-many |
| Plans (for orgs) | `plans` table | Same - organization-level billing |
| Features | `features` table | Same - feature flags |
| Plan-Feature Mapping | `plan_features` junction | Same - plans include features |
| Subscriptions | `subscriptions` table | Same - org subscriptions to plans |

## Key Differences from Clerk

1. **Database-first**: Roles, permissions, plans, and features are seeded in the database (not just in-memory)
2. **Self-hosted**: No external service dependencies
3. **Customizable**: Full control over roles, permissions, and plan definitions
4. **PostgreSQL-backed**: All data stored in your database
5. **Open source**: Fully auditable authorization logic

## Access Control Flow

```
1. User authenticates → guards.authenticated()
2. User specifies org (x-org-id header) → saasGuards.inOrg()
   ├─ Loads organization details
   ├─ Checks org membership
   ├─ Loads user's role in org
   ├─ Populates ctx.auth.permissions from role
   ├─ Loads org subscription
   └─ Populates ctx.org.features from plan
3. Check permissions → guards.hasPermission('org:members:manage')
4. Check features → saasGuards.hasFeature('org:analytics')
5. Action executes with full org context
```

## Example: Creating an Organization

```typescript
// When a user creates an organization:
// 1. Insert into organizations table
// 2. Insert into org_memberships with role='org:admin'
// 3. Insert into subscriptions with plan_key='free'

const org = await ctx.db.from('organizations').insert({
  name: 'Acme Corp',
  slug: 'acme-corp',
  owner_id: ctx.auth.userId,
}).single()

await ctx.db.from('org_memberships').insert({
  org_id: org.id,
  user_id: ctx.auth.userId,
  role: 'org:admin',  // Creator is admin
})

await ctx.db.from('subscriptions').insert({
  org_id: org.id,
  plan_key: 'free',  // Start on free plan
  status: 'active',
  current_period_end: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
})
```

## Migration Seed Data

The initial migration (`001_init.sql`) automatically seeds:
- 3 default roles
- 9 default permissions
- 4 default plans (free, starter, pro, enterprise)
- 8 default features
- Role-permission mappings
- Plan-feature mappings

All with `ON CONFLICT DO NOTHING` for safe re-running.

## Testing the Implementation

```bash
# Create a new project
bunbase init my-saas-app
cd my-saas-app

# Set up database
echo "DATABASE_URL=postgresql://user:pass@localhost:5432/mydb" > .env

# Run migrations (includes seed data)
bunbase migrate

# Check what was seeded
bunbase migrate status

# Start dev server
bun run dev
```

## Next Steps

- Implement organization CRUD actions
- Add member invitation flow
- Build subscription management
- Add webhook handlers for payment providers
- Customize roles/permissions for your use case
