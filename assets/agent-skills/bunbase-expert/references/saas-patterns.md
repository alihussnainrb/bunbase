# SaaS Patterns

## Table of Contents

- [Organization Lifecycle](#organization-lifecycle)
- [Role-Based Access Control](#role-based-access-control)
- [Plan and Feature Gating](#plan-and-feature-gating)
- [Invitation Flow](#invitation-flow)
- [Subscription Management](#subscription-management)
- [Multi-Tenant Data Isolation](#multi-tenant-data-isolation)

## Organization Lifecycle

### Default Seed Data

The initial migration seeds these defaults (all with ON CONFLICT DO NOTHING for safe re-runs):

**Roles:**
| Key | Name | Description |
|-----|------|-------------|
| `org:admin` | Organization Admin | Full administrative access |
| `org:member` | Organization Member | Standard read access |
| `org:billing_manager` | Billing Manager | Billing and subscriptions |

**Permissions (org:resource:action pattern):**
| Key | Description |
|-----|-------------|
| `org:read` | View organization details |
| `org:update` | Modify organization settings |
| `org:delete` | Delete the organization |
| `org:members:read` | View members |
| `org:members:manage` | Add/remove/update members |
| `org:invitations:manage` | Send and manage invitations |
| `org:billing:read` | View billing information |
| `org:billing:manage` | Update billing and subscriptions |
| `org:roles:manage` | Assign roles to members |

**Role-Permission Mapping:**
- `org:admin` gets ALL permissions
- `org:member` gets `org:read`, `org:members:read`
- `org:billing_manager` gets `org:read`, `org:members:read`, `org:billing:read`, `org:billing:manage`

**Plans:**
| Key | Name | Price |
|-----|------|-------|
| `free` | Free | $0/mo |
| `starter` | Starter | $29/mo |
| `pro` | Pro | $99/mo |
| `enterprise` | Enterprise | $299/mo |

**Features:**
| Key | Free | Starter | Pro | Enterprise |
|-----|------|---------|-----|-----------|
| `org:basic` | Y | Y | Y | Y |
| `org:members:5` | Y | - | - | - |
| `org:members:25` | - | Y | - | - |
| `org:members:unlimited` | - | - | Y | Y |
| `org:analytics` | - | Y | Y | Y |
| `org:api_access` | - | - | Y | Y |
| `org:sso` | - | - | - | Y |
| `org:priority_support` | - | - | - | Y |

## Role-Based Access Control

### Guard Composition

Guards are composable and run in order:

```typescript
// Basic authenticated endpoint
guards: [guards.authenticated()]

// Org-scoped with role check
guards: [
  guards.authenticated(),
  saasGuards.inOrg(),
  guards.hasRole('org:admin'),
]

// Permission-based (more granular than role)
guards: [
  guards.authenticated(),
  saasGuards.inOrg(),
  guards.hasPermission('org:members:manage'),
]

// Feature-gated
guards: [
  guards.authenticated(),
  saasGuards.inOrg(),
  saasGuards.hasFeature('org:analytics'),
]

// Combined: auth + org + permission + feature + rate limit
guards: [
  guards.authenticated(),
  saasGuards.inOrg(),
  guards.hasPermission('org:billing:manage'),
  saasGuards.hasFeature('org:api_access'),
  guards.rateLimit({ max: 100, window: 60 }),
]
```

### Custom Guards

```typescript
import { GuardFn, GuardError } from 'bunbase'

export const isOrgOwner = (): GuardFn => {
  return async (ctx) => {
    const org = await ctx.db
      .from('organizations')
      .eq('id', ctx.auth.orgId!)
      .single()

    if (org.owner_id !== ctx.auth.userId) {
      throw new GuardError('Only the organization owner can perform this action', 403)
    }
  }
}

// Usage
guards: [guards.authenticated(), saasGuards.inOrg(), isOrgOwner()]
```

## Plan and Feature Gating

### Check Features in Handlers

When you need conditional logic based on features (not just guard blocking):

```typescript
async (input, ctx) => {
  const subscription = await ctx.db
    .from('subscriptions')
    .eq('org_id', ctx.auth.orgId!)
    .eq('status', 'active')
    .single()

  const features = await ctx.db
    .from('plan_features')
    .eq('plan_key', subscription.plan_key)
    .exec()

  const featureKeys = features.map(f => f.feature_key)

  // Conditional behavior based on plan
  if (featureKeys.includes('org:analytics')) {
    // Include analytics data
  }

  // Check member limits
  const memberCount = await ctx.db
    .from('org_memberships')
    .eq('org_id', ctx.auth.orgId!)
    .count()

  const maxMembers = featureKeys.includes('org:members:unlimited') ? Infinity
    : featureKeys.includes('org:members:25') ? 25
    : featureKeys.includes('org:members:5') ? 5
    : 1

  if (memberCount >= maxMembers) {
    throw new Error('Member limit reached. Upgrade your plan.')
  }
}
```

## Invitation Flow

```
1. Admin sends invitation (POST /invitations)
   - Validate permission: org:invitations:manage
   - Create invitation record with 7-day expiry
   - Queue invitation email

2. Recipient clicks link
   - Verify invitation token
   - Check expiry
   - If user exists: add to org
   - If new user: create account, then add to org

3. Accept invitation
   - Create org_membership with invited role
   - Mark invitation as accepted
   - Emit member.joined event
```

## Subscription Management

### Upgrade/Downgrade

```typescript
export const changePlan = action({
  name: 'billing.changePlan',
  input: t.Object({
    planKey: t.Union([
      t.Literal('free'),
      t.Literal('starter'),
      t.Literal('pro'),
      t.Literal('enterprise'),
    ]),
  }),
  guards: [
    guards.authenticated(),
    saasGuards.inOrg(),
    guards.hasPermission('org:billing:manage'),
  ],
}, async (input, ctx) => {
  const subscription = await ctx.db
    .from('subscriptions')
    .eq('org_id', ctx.auth.orgId!)
    .single()

  await ctx.db
    .from('subscriptions')
    .eq('id', subscription.id)
    .update({ plan_key: input.planKey })

  // Invalidate cached features
  await ctx.kv.delete(`features:${ctx.auth.orgId}`)

  ctx.event.emit('subscription.updated', {
    orgId: ctx.auth.orgId!,
    oldPlan: subscription.plan_key,
    newPlan: input.planKey,
  })

  return { success: true }
})
```

## Multi-Tenant Data Isolation

### Key Principle

Every table storing tenant data MUST have an `org_id` column, and every query MUST filter by it:

```sql
-- Migration
CREATE TABLE items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_items_org_id ON items(org_id);
```

```typescript
// Every query scoped to org
const items = await ctx.db
  .from('items')
  .eq('org_id', ctx.auth.orgId!)
  .exec()
```

### Storage Isolation

Namespace storage keys by org:

```typescript
const key = `orgs/${ctx.auth.orgId}/files/${fileId}.${ext}`
await ctx.storage.upload(key, buffer)
```

### KV Isolation

Namespace KV keys by org:

```typescript
await ctx.kv.set(`org:${ctx.auth.orgId}:settings`, settings)
const settings = await ctx.kv.get(`org:${ctx.auth.orgId}:settings`)
```
