# Common Patterns

## Table of Contents

- [CRUD Actions](#crud-actions)
- [Multi-Tenant Organization](#multi-tenant-organization)
- [File Upload/Download](#file-uploaddownload)
- [Background Jobs](#background-jobs)
- [Event-Driven Architecture](#event-driven-architecture)
- [Cron Tasks](#cron-tasks)
- [Caching with KV](#caching-with-kv)

## CRUD Actions

### Create

```typescript
export const createUser = action({
  name: 'users.create',
  input: t.Object({
    email: t.String({ format: 'email' }),
    name: t.String(),
  }),
  output: t.Object({
    user: t.Object({ id: t.String(), email: t.String(), name: t.String() }),
  }),
  triggers: [triggers.api('POST', '/')],
  guards: [guards.authenticated(), guards.hasPermission('users:create')],
}, async (input, ctx) => {
  const user = await ctx.db
    .from('users')
    .insert({ email: input.email, name: input.name })
    .returning('id', 'email', 'name')
    .single()

  ctx.event.emit('user.created', { userId: user.id })
  return { user }
})
```

### Read

```typescript
export const getUser = action({
  name: 'users.get',
  input: t.Object({ userId: t.String() }),
  output: t.Object({
    user: t.Object({ id: t.String(), email: t.String(), name: t.String() }),
  }),
  triggers: [triggers.api('GET', '/:userId')],
  guards: [guards.authenticated()],
}, async (input, ctx) => {
  const user = await ctx.db
    .from('users')
    .eq('id', input.userId)
    .single()

  if (!user) throw new Error('User not found')
  return { user }
})
```

### Update

```typescript
export const updateUser = action({
  name: 'users.update',
  input: t.Object({
    userId: t.String(),
    name: t.Optional(t.String()),
    email: t.Optional(t.String({ format: 'email' })),
  }),
  output: t.Object({
    user: t.Object({ id: t.String(), email: t.String(), name: t.String() }),
  }),
  triggers: [triggers.api('PATCH', '/:userId')],
  guards: [guards.authenticated()],
}, async (input, ctx) => {
  const updates: any = {}
  if (input.name) updates.name = input.name
  if (input.email) updates.email = input.email

  const user = await ctx.db
    .from('users')
    .eq('id', input.userId)
    .update(updates)
    .returning('id', 'email', 'name')
    .single()

  return { user }
})
```

### Delete

```typescript
export const deleteUser = action({
  name: 'users.delete',
  input: t.Object({ userId: t.String() }),
  output: t.Object({ success: t.Boolean() }),
  triggers: [triggers.api('DELETE', '/:userId')],
  guards: [guards.authenticated(), guards.hasPermission('users:delete')],
}, async (input, ctx) => {
  await ctx.db.from('users').eq('id', input.userId).delete()
  return { success: true }
})
```

### List with Pagination

```typescript
export const listUsers = action({
  name: 'users.list',
  input: t.Object({
    limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
    offset: t.Optional(t.Number({ minimum: 0 })),
  }),
  output: t.Object({
    users: t.Array(t.Object({ id: t.String(), email: t.String(), name: t.String() })),
    total: t.Number(),
  }),
  triggers: [triggers.api('GET', '/')],
  guards: [guards.authenticated()],
}, async (input, ctx) => {
  const limit = input.limit ?? 20
  const offset = input.offset ?? 0

  const users = await ctx.db.from('users').limit(limit).offset(offset).exec()
  const [{ count }] = await ctx.db.raw<[{ count: number }]>`
    SELECT COUNT(*) as count FROM users
  `

  return { users, total: count }
})
```

## Multi-Tenant Organization

### Create Organization

```typescript
export const createOrganization = action({
  name: 'orgs.create',
  input: t.Object({
    name: t.String(),
    slug: t.String({ pattern: '^[a-z0-9-]+$' }),
  }),
  triggers: [triggers.api('POST', '/')],
  guards: [guards.authenticated()],
}, async (input, ctx) => {
  const userId = ctx.auth.userId!

  const org = await ctx.db
    .from('organizations')
    .insert({ name: input.name, slug: input.slug, owner_id: userId })
    .returning('id', 'name', 'slug')
    .single()

  // Add creator as admin
  await ctx.db.from('org_memberships').insert({
    org_id: org.id, user_id: userId, role: 'org:admin',
  })

  // Create free subscription
  await ctx.db.from('subscriptions').insert({
    org_id: org.id,
    plan_key: 'free',
    status: 'active',
    current_period_end: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
  })

  ctx.event.emit('organization.created', { orgId: org.id, userId })
  return { organization: org }
})
```

### Invite Member

```typescript
export const inviteMember = action({
  name: 'orgs.inviteMember',
  input: t.Object({
    email: t.String({ format: 'email' }),
    role: t.Union([
      t.Literal('org:admin'),
      t.Literal('org:member'),
      t.Literal('org:billing_manager'),
    ]),
  }),
  triggers: [triggers.api('POST', '/invitations')],
  guards: [
    guards.authenticated(),
    saasGuards.inOrg(),
    guards.hasPermission('org:invitations:manage'),
  ],
}, async (input, ctx) => {
  const invitation = await ctx.db
    .from('org_invitations')
    .insert({
      org_id: ctx.auth.orgId!,
      email: input.email,
      role: input.role,
      invited_by: ctx.auth.userId!,
      status: 'pending',
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    })
    .returning('id', 'email', 'role')
    .single()

  await ctx.queue.push('sendInvitationEmail', {
    invitationId: invitation.id,
    email: input.email,
  })

  return { invitation }
})
```

### Org-Scoped Query Pattern

Always filter by `org_id` to prevent data leaks:

```typescript
// CORRECT: scoped to current org
const items = await ctx.db
  .from('items')
  .eq('org_id', ctx.auth.orgId!)
  .exec()

// WRONG: unscoped, returns all orgs' data
const items = await ctx.db.from('items').exec()
```

## File Upload/Download

```typescript
export const uploadFile = action({
  name: 'files.upload',
  input: t.Object({
    filename: t.String(),
    contentType: t.String(),
    data: t.String(), // Base64
  }),
  triggers: [triggers.api('POST', '/')],
  guards: [guards.authenticated(), saasGuards.inOrg()],
}, async (input, ctx) => {
  const fileId = crypto.randomUUID()
  const ext = input.filename.split('.').pop()
  const key = `orgs/${ctx.auth.orgId}/files/${fileId}.${ext}`

  const buffer = Buffer.from(input.data, 'base64')

  await ctx.storage.upload(key, buffer, {
    contentType: input.contentType,
    acl: 'private',
    storageClass: 'INTELLIGENT_TIERING',
  })

  await ctx.db.from('files').insert({
    id: fileId,
    org_id: ctx.auth.orgId!,
    uploaded_by: ctx.auth.userId!,
    filename: input.filename,
    storage_key: key,
    content_type: input.contentType,
    size_bytes: buffer.length,
  })

  const url = await ctx.storage.getUrl(key)
  return { file: { id: fileId, url, key } }
})

export const downloadFile = action({
  name: 'files.download',
  input: t.Object({ fileId: t.String() }),
  triggers: [triggers.api('GET', '/:fileId/download')],
  guards: [guards.authenticated(), saasGuards.inOrg()],
}, async (input, ctx) => {
  const file = await ctx.db
    .from('files')
    .eq('id', input.fileId)
    .eq('org_id', ctx.auth.orgId!)
    .single()

  if (!file) throw new Error('File not found')
  const url = await ctx.storage.getUrl(file.storage_key)
  return { url }
})
```

## Background Jobs

```typescript
// Action that enqueues work
export const generateReport = action({
  name: 'reports.generate',
  input: t.Object({
    type: t.String(),
    dateRange: t.Object({ start: t.String(), end: t.String() }),
  }),
  triggers: [triggers.api('POST', '/')],
  guards: [guards.authenticated(), saasGuards.inOrg()],
}, async (input, ctx) => {
  await ctx.queue.push('generateReport', {
    orgId: ctx.auth.orgId!,
    type: input.type,
    dateRange: input.dateRange,
  })
  return { status: 'queued' }
})

// Worker action processing the job
export const processReport = action({
  name: 'workers.generateReport',
  triggers: [triggers.event('job.generateReport')],
}, async (input, ctx) => {
  ctx.logger.info('Generating report', { orgId: input.orgId, type: input.type })

  // ... generate report data ...

  const key = `orgs/${input.orgId}/reports/${Date.now()}.pdf`
  await ctx.storage.upload(key, reportBuffer, {
    contentType: 'application/pdf',
    contentDisposition: 'attachment; filename="report.pdf"',
  })

  ctx.event.emit('report.generated', { orgId: input.orgId, key })
})
```

## Event-Driven Architecture

```typescript
// Emit events from actions
ctx.event.emit('user.created', { userId, email })
ctx.event.emit('subscription.updated', { orgId, planKey })
ctx.event.emit('file.uploaded', { fileId, key })

// React to events with dedicated actions
export const onUserCreated = action({
  name: 'notifications.onUserCreated',
  triggers: [triggers.event('user.created')],
}, async (input, ctx) => {
  await ctx.queue.push('sendEmail', {
    to: input.email,
    template: 'welcome',
  })
})

export const onSubscriptionUpdated = action({
  name: 'billing.onSubscriptionUpdated',
  triggers: [triggers.event('subscription.updated')],
}, async (input, ctx) => {
  // Update cached features
  await ctx.kv.delete(`features:${input.orgId}`)
  ctx.logger.info('Subscription updated', { orgId: input.orgId })
})
```

## Cron Tasks

```typescript
export const dailyCleanup = action({
  name: 'system.dailyCleanup',
  triggers: [triggers.cron('0 2 * * *')], // 2 AM daily
}, async (input, ctx) => {
  // Clean expired sessions
  await ctx.db.raw`DELETE FROM kv_store WHERE expires_at < NOW()`

  // Clean old logs
  await ctx.db.raw`
    DELETE FROM action_logs WHERE created_at < NOW() - INTERVAL '30 days'
  `

  ctx.logger.info('Daily cleanup completed')
})

export const hourlyMetrics = action({
  name: 'system.hourlyMetrics',
  triggers: [triggers.cron('0 * * * *')], // every hour
}, async (input, ctx) => {
  const [{ count }] = await ctx.db.raw<[{ count: number }]>`
    SELECT COUNT(*) as count FROM action_runs
    WHERE created_at > NOW() - INTERVAL '1 hour'
  `
  ctx.logger.info('Hourly metrics', { actionsLastHour: count })
})
```

## Caching with KV

```typescript
// Cache expensive query results
export const getOrgFeatures = action({
  name: 'orgs.getFeatures',
  guards: [guards.authenticated(), saasGuards.inOrg()],
}, async (input, ctx) => {
  const cacheKey = `features:${ctx.auth.orgId}`

  // Check cache first
  const cached = await ctx.kv.get<string[]>(cacheKey)
  if (cached) return { features: cached }

  // Query database
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

  // Cache for 5 minutes
  await ctx.kv.set(cacheKey, featureKeys, { ttl: 300 })

  return { features: featureKeys }
})
```
