# Action Context API Reference

## Table of Contents

- [Database (ctx.db)](#database-ctxdb)
- [Storage (ctx.storage)](#storage-ctxstorage)
- [Key-Value Store (ctx.kv)](#key-value-store-ctxkv)
- [Event Bus (ctx.event)](#event-bus-ctxevent)
- [Job Queue (ctx.queue)](#job-queue-ctxqueue)
- [Scheduler (ctx.scheduler)](#scheduler-ctxscheduler)
- [Logger (ctx.logger)](#logger-ctxlogger)
- [Auth (ctx.auth)](#auth-ctxauth)

## Database (ctx.db)

Fluent query builder over PostgreSQL via Bun's native SQL driver.

```typescript
// SELECT with filters
const users = await ctx.db
  .from('users')
  .eq('status', 'active')
  .in('role', ['admin', 'member'])
  .select('id', 'email', 'name')
  .limit(10)
  .offset(20)
  .orderBy('created_at', 'desc')
  .exec()

// Single row (throws if not found)
const user = await ctx.db.from('users').eq('id', userId).single()

// Maybe single (returns null if not found)
const user = await ctx.db.from('users').eq('id', userId).maybeSingle()

// INSERT with returning
const newUser = await ctx.db
  .from('users')
  .insert({ email: 'a@b.com', name: 'Alice' })
  .returning('id', 'email')
  .single()

// UPDATE
await ctx.db.from('users').eq('id', userId).update({ name: 'Bob' })

// DELETE
await ctx.db.from('users').eq('id', userId).delete()

// COUNT
const total = await ctx.db.from('users').eq('status', 'active').count()

// Raw SQL (escape hatch)
const result = await ctx.db.raw<{ count: number }[]>`
  SELECT COUNT(*) as count FROM users WHERE status = 'active'
`
```

### Filter Methods

| Method | SQL | Example |
|--------|-----|---------|
| `.eq(col, val)` | `col = val` | `.eq('status', 'active')` |
| `.neq(col, val)` | `col != val` | `.neq('role', 'guest')` |
| `.gt(col, val)` | `col > val` | `.gt('age', 18)` |
| `.gte(col, val)` | `col >= val` | `.gte('score', 90)` |
| `.lt(col, val)` | `col < val` | `.lt('price', 100)` |
| `.lte(col, val)` | `col <= val` | `.lte('attempts', 3)` |
| `.in(col, vals)` | `col IN (...)` | `.in('id', [1, 2, 3])` |
| `.like(col, pat)` | `col LIKE pat` | `.like('name', '%john%')` |
| `.ilike(col, pat)` | `col ILIKE pat` | `.ilike('email', '%@gmail%')` |
| `.isNull(col)` | `col IS NULL` | `.isNull('deleted_at')` |
| `.isNotNull(col)` | `col IS NOT NULL` | `.isNotNull('verified_at')` |

## Storage (ctx.storage)

File storage with S3 or local filesystem adapter.

```typescript
// Upload
await ctx.storage.upload('avatars/user-123.png', buffer, {
  contentType: 'image/png',
  acl: 'public-read',
  storageClass: 'INTELLIGENT_TIERING',
  contentDisposition: 'inline',
  partSize: 5 * 1024 * 1024, // 5MB parts for multipart
  queueSize: 4,               // parallel upload streams
  retry: 3,                    // retry attempts
})

// Download
const buffer = await ctx.storage.download('avatars/user-123.png')

// Get URL (presigned for S3, file:// for local)
const url = await ctx.storage.getUrl('avatars/user-123.png')

// Delete
await ctx.storage.delete('avatars/user-123.png')

// List files by prefix
const keys = await ctx.storage.list('avatars/')

// Check existence
const exists = await ctx.storage.exists('avatars/user-123.png')
```

### Upload Options

| Option | Type | Description |
|--------|------|-------------|
| `contentType` | string | MIME type |
| `acl` | string | S3 ACL policy (private, public-read, etc.) |
| `storageClass` | string | S3 storage class (STANDARD, GLACIER, etc.) |
| `contentDisposition` | string | Content-Disposition header |
| `partSize` | number | Multipart upload part size in bytes |
| `queueSize` | number | Parallel upload streams |
| `retry` | number | Retry attempts on failure |
| `requestPayer` | boolean | Requester pays |
| `metadata` | Record<string, string> | Custom metadata |

## Key-Value Store (ctx.kv)

PostgreSQL-backed KV store with optional TTL.

```typescript
// Set with TTL (seconds)
await ctx.kv.set('session:abc', { userId: '123' }, { ttl: 3600 })

// Set without TTL (permanent)
await ctx.kv.set('config:theme', { dark: true })

// Get (returns null if expired or missing)
const session = await ctx.kv.get<{ userId: string }>('session:abc')

// Check existence
const exists = await ctx.kv.has('session:abc')

// Delete
await ctx.kv.delete('session:abc')

// List keys by prefix
const keys = await ctx.kv.list('session:')
```

## Event Bus (ctx.event)

In-memory pub/sub for decoupled communication between actions.

```typescript
// Emit event (fire and forget)
ctx.event.emit('user.created', { userId: '123', email: 'a@b.com' })
ctx.event.emit('order.completed', { orderId: 'abc', total: 9900 })

// Listen via trigger (in action definition)
export const onUserCreated = action({
  triggers: [triggers.event('user.created')],
}, async (input, ctx) => {
  // input contains the emitted data
  ctx.logger.info('New user', { userId: input.userId })
})
```

Note: In-memory only, not distributed. For reliable delivery use the job queue.

## Job Queue (ctx.queue)

PostgreSQL-backed background job processing with retry logic.

```typescript
// Push a job
await ctx.queue.push('sendEmail', {
  to: 'user@example.com',
  subject: 'Welcome',
  template: 'welcome',
})

// Push with options
await ctx.queue.push('generateReport', data, {
  priority: 10,        // higher = processed first
  delay: 60,           // delay in seconds
  maxAttempts: 5,      // retry limit
})
```

Jobs are processed by worker actions. Failed jobs get exponential backoff and eventually move to the dead letter queue (`job_failures` table).

## Scheduler (ctx.scheduler)

Cron-based and delayed task scheduling.

```typescript
// Cron trigger (in action definition)
export const dailyCleanup = action({
  triggers: [triggers.cron('0 0 * * *')], // midnight daily
}, async (input, ctx) => {
  // runs on schedule
})

// One-time delayed execution
ctx.scheduler.schedule('processRefund', { refundId: '123' }, 300) // 5 min delay

// Schedule at specific time
ctx.scheduler.scheduleAt('sendReminder', { userId: '123' }, new Date('2025-01-01'))
```

## Logger (ctx.logger)

Hierarchical structured logging with automatic trace ID propagation.

```typescript
ctx.logger.debug('Query result', { rows: users.length })
ctx.logger.info('User created', { userId, email })
ctx.logger.warn('Rate limit approaching', { current: 95, max: 100 })
ctx.logger.error('Payment failed', { orderId, error: err.message })

// Child logger with extra context
const log = ctx.logger.child({ module: 'billing' })
log.info('Processing payment') // includes module: 'billing' + traceId
```

All log entries automatically include `ctx.traceId` for correlation.

## Auth (ctx.auth)

Authentication and authorization context from the session.

```typescript
ctx.auth.userId       // string | null - authenticated user ID
ctx.auth.orgId        // string | null - current organization ID
ctx.auth.role         // string | null - user's role in current org
ctx.auth.permissions  // string[] - permissions for current role
ctx.auth.sessionId    // string | null - session identifier
```

These fields are populated by the session manager from signed cookies. Guards check these values before the handler runs.
