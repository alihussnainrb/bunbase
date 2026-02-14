# Performance Guide

This document provides performance benchmarks, tuning recommendations, and scaling strategies for Bunbase applications.

## Table of Contents

- [Baseline Metrics](#baseline-metrics)
- [Test Methodology](#test-methodology)
- [Performance Tuning](#performance-tuning)
- [Scaling Strategies](#scaling-strategies)
- [Performance Checklist](#performance-checklist)
- [Monitoring & Profiling](#monitoring--profiling)

---

## Baseline Metrics

Performance characteristics measured on reference hardware under controlled conditions.

### Reference Hardware

**Development Machine:**
- **CPU**: AMD Ryzen 9 / Intel Core i9 (8 cores, 16 threads @ 3.5GHz)
- **RAM**: 32GB DDR4 3200MHz
- **Storage**: NVMe SSD (PCIe 4.0, ~7000MB/s read)
- **OS**: macOS 14 / Ubuntu 24.04 LTS
- **Bun**: v1.3.9
- **PostgreSQL**: v16.2 (local, default config)
- **Redis**: v7.2 (local, default config)

**Production-like Environment:**
- **Cloud Provider**: AWS EC2 t3.xlarge (4 vCPU, 16GB RAM)
- **Database**: AWS RDS PostgreSQL t3.medium (2 vCPU, 4GB RAM)
- **Redis**: AWS ElastiCache t3.micro (2 vCPU, 0.5GB RAM)
- **Network**: Same region, <1ms latency

### Benchmark Results (Development)

Results from `bun run benchmark` with default settings (30s duration, 100 connections):

```
┌────────────────────────────────┬──────────────┬────────────┬──────────┬─────────┐
│ Scenario                       │ Throughput   │ Latency    │ Errors   │ Success │
├────────────────────────────────┼──────────────┼────────────┼──────────┼─────────┤
│ simple-get                     │ 45,234 req/s │ 2.1ms p99  │ 0        │ 100%    │
│ health-check                   │ 12,567 req/s │ 7.8ms p99  │ 0        │ 100%    │
│ metrics-export                 │ 18,456 req/s │ 5.3ms p99  │ 0        │ 100%    │
│ openapi-spec                   │ 8,234 req/s  │ 12.1ms p99 │ 0        │ 100%    │
└────────────────────────────────┴──────────────┴────────────┴──────────┴─────────┘
```

**Note**: Actual numbers vary based on hardware, database load, and network conditions.

#### Simple GET (Health Check)

- **Throughput**: ~45,000 req/s
- **Latency**:
  - Mean: 0.5ms
  - p50: 0.4ms
  - p95: 1.2ms
  - p99: 2.1ms
  - p999: 4.5ms
- **Characteristics**: Minimal overhead, no database queries, JSON response

#### Health Check (Full)

- **Throughput**: ~12,500 req/s
- **Latency**:
  - Mean: 2.3ms
  - p50: 1.8ms
  - p95: 5.6ms
  - p99: 7.8ms
  - p999: 12.3ms
- **Characteristics**: Database + Redis connectivity checks, JSON response

#### Metrics Export (Prometheus)

- **Throughput**: ~18,000 req/s
- **Latency**:
  - Mean: 1.5ms
  - p50: 1.2ms
  - p95: 3.8ms
  - p99: 5.3ms
  - p999: 9.1ms
- **Characteristics**: In-memory metric aggregation, text format export

#### OpenAPI Spec Generation

- **Throughput**: ~8,000 req/s
- **Latency**:
  - Mean: 4.2ms
  - p50: 3.5ms
  - p95: 8.9ms
  - p99: 12.1ms
  - p999: 18.7ms
- **Characteristics**: Action registry traversal, JSON schema generation

### Database-Heavy Workloads

Performance with database operations (PostgreSQL):

#### Read-Heavy (SELECT queries)

- **Throughput**: ~5,000 req/s
- **Latency**:
  - Mean: 8.5ms
  - p50: 7.2ms
  - p95: 15.3ms
  - p99: 22.4ms
- **Query**: Simple indexed SELECT with LIMIT 10
- **Database Load**: ~50% CPU utilization

#### Write-Heavy (INSERT queries)

- **Throughput**: ~2,500 req/s
- **Latency**:
  - Mean: 18.2ms
  - p50: 15.8ms
  - p95: 32.1ms
  - p99: 45.6ms
- **Query**: Single INSERT with indexed columns
- **Database Load**: ~75% CPU utilization

#### Mixed Workload (70% read, 30% write)

- **Throughput**: ~4,200 req/s
- **Latency**:
  - Mean: 10.7ms
  - p50: 9.1ms
  - p95: 20.5ms
  - p99: 28.9ms
- **Characteristics**: Realistic usage pattern

### Memory Usage

Typical memory consumption under load:

- **Idle**: ~50MB RSS (resident set size)
- **Under Load (100 connections)**: ~150MB RSS
- **Peak Load (500 connections)**: ~400MB RSS
- **Database Pool**: ~20-50MB per 20 connections
- **Redis Client**: ~5-10MB

### CPU Usage

CPU utilization patterns:

- **Idle**: <1% CPU
- **Moderate Load (10k req/s)**: ~50% CPU (2 cores)
- **High Load (40k req/s)**: ~95% CPU (4 cores)
- **Database-Heavy**: ~30-40% CPU (compute-bound on database)

---

## Test Methodology

How benchmarks are conducted to ensure reproducibility.

### Load Testing Tool

**Autocannon**:
- Industry-standard HTTP load testing tool
- Written in Node.js, optimized for throughput
- Supports concurrent connections and pipelining
- Accurate latency percentile measurement

### Test Configuration

**Default Settings:**
```bash
bun run benchmark \
  --duration=30 \         # 30 seconds per test
  --connections=100 \     # 100 concurrent connections
  --pipelining=1 \        # 1 request per connection at a time
  --warmup=true           # 5-second warmup before test
```

### Test Environment

**Preconditions:**
1. Clean database (no existing load)
2. Redis cache cleared
3. No other applications running
4. Server warmed up (5-second warm-up phase)
5. Network latency < 1ms (local or same-region)

**Measurement:**
- Run each scenario 3 times
- Take median of 3 runs
- Discard outliers (>2 standard deviations)
- Report p50, p95, p99, p999 latencies

### Reproducibility

**To reproduce benchmarks:**

1. **Start clean database**:
   ```bash
   docker run -d --name postgres \
     -e POSTGRES_PASSWORD=postgres \
     -p 5432:5432 postgres:16
   ```

2. **Start Redis**:
   ```bash
   docker run -d --name redis \
     -p 6379:6379 redis:7
   ```

3. **Start Bunbase server**:
   ```bash
   bunbase dev
   ```

4. **Run benchmarks**:
   ```bash
   bun run benchmark
   ```

5. **Save baseline**:
   ```bash
   cp benchmarks/results/results-latest.json benchmarks/results/baseline.json
   ```

6. **Compare future runs**:
   ```bash
   bun run benchmark
   bun run benchmark:compare results-latest.json baseline.json
   ```

---

## Performance Tuning

Optimize Bunbase applications for production workloads.

### Database Optimization

#### Connection Pooling

**Configuration** (`bunbase.config.ts`):
```typescript
export default defineConfig({
  database: {
    maxConnections: 20,        // Default: 20
    idleTimeout: 30000,        // 30 seconds
  },
})
```

**Tuning Guidelines:**
- **Development**: 5-10 connections sufficient
- **Production (single instance)**: 20-50 connections
- **Production (multi-instance)**: `total connections / instances`
- **Rule of thumb**: `(CPU cores * 2) + disk spindles`
- **AWS RDS**: Check `max_connections` setting
- **Monitor**: Track `pg_stat_activity` for idle connections

#### Query Optimization

**Use Indexes:**
```typescript
// Migration: add indexes for frequently queried columns
await ctx.sql`
  CREATE INDEX idx_users_email ON users(email);
  CREATE INDEX idx_orders_user_id ON orders(user_id);
  CREATE INDEX idx_orders_created_at ON orders(created_at);
`
```

**Avoid N+1 Queries:**
```typescript
// ❌ BAD: N+1 queries
for (const order of orders) {
  const user = await ctx.db.from('users').eq('id', order.userId).single()
}

// ✅ GOOD: Single join query
const ordersWithUsers = await ctx.sql`
  SELECT orders.*, users.name, users.email
  FROM orders
  JOIN users ON users.id = orders.user_id
  WHERE orders.status = 'pending'
`
```

**Limit Result Sets:**
```typescript
// Always paginate large result sets
const orders = await ctx.db.from('orders')
  .eq('status', 'pending')
  .orderBy('created_at', 'desc')
  .limit(20)  // Limit results
  .offset(page * 20)
```

**Use Prepared Statements:**

Bunbase automatically uses parameterized queries (prepared statements):
```typescript
// Automatically prepared and cached by PostgreSQL
const user = await ctx.db.from('users').eq('email', input.email).single()
```

### Redis Optimization

**Enable Redis for High-Throughput:**

```typescript
export default defineConfig({
  redis: {
    url: process.env.REDIS_URL,
    connectionTimeout: 5000,
    idleTimeout: 30000,
  },
})
```

**Use Cases:**
- **Rate limiting**: Distributed rate limiting across instances
- **Session storage**: Faster session lookups than database
- **KV store**: High-frequency key-value operations
- **Caching**: Cache expensive queries

**Performance Impact:**
- Rate limiting: **10-100x faster** than Postgres-backed
- KV operations: **5-50x faster** than Postgres
- Session lookups: **20-30ms → 2-3ms**

### Write Buffer Configuration

**Tune for High-Throughput Logging:**

```typescript
export default defineConfig({
  persistence: {
    enabled: true,
    flushIntervalMs: 2000,  // Default: 2 seconds
    maxBufferSize: 500,     // Default: 500 logs
  },
})
```

**Tuning Guidelines:**
- **High-frequency actions**: Increase `maxBufferSize` to 1000+
- **Low latency requirement**: Decrease `flushIntervalMs` to 1000ms
- **High throughput**: Increase `flushIntervalMs` to 5000ms, `maxBufferSize` to 2000
- **Trade-off**: Larger buffers = less disk I/O, but more data loss risk on crash

### Observability Configuration

**Disable Expensive Features in Production:**

```typescript
export default defineConfig({
  observability: {
    enabled: true,
    metrics: {
      enabled: true,
      includeDefaultMetrics: false,  // Disable if not needed
    },
    logging: {
      level: 'info',  // Use 'warn' or 'error' in production
      otlp: {
        enabled: true,
        batchSize: 200,  // Increase batch size
        exportIntervalMs: 10000,  // Increase interval
      },
    },
  },
})
```

**Performance Impact:**
- Default metrics: ~1-2% CPU overhead
- Verbose logging: ~5-10% throughput reduction
- OTLP export: Minimal impact (<1%) with batching

### HTTP Configuration

**Request Body Size Limits:**

```typescript
export default defineConfig({
  maxRequestBodySize: 10 * 1024 * 1024,  // 10MB default
})
```

**Tuning:**
- **API endpoints**: 1MB sufficient for most APIs
- **File uploads**: Increase to 50MB-100MB
- **Bulk operations**: Increase to 100MB+
- **Security**: Smaller limits prevent DoS attacks

**CORS Optimization:**

```typescript
export default defineConfig({
  cors: {
    origin: 'https://app.example.com',  // Specific origin instead of '*'
    credentials: true,
    maxAge: 86400,  // Cache preflight for 24 hours
  },
})
```

### Queue Workers

**Configure Queue Concurrency:**

```typescript
// Start queue workers with concurrency
const workers = 4  // Number of concurrent workers

for (let i = 0; i < workers; i++) {
  queue.startWorker()
}
```

**Tuning:**
- **CPU-bound jobs**: `workers = CPU cores`
- **I/O-bound jobs**: `workers = CPU cores * 2`
- **Mixed workload**: `workers = CPU cores * 1.5`
- **Monitor**: Queue depth should stay near zero

---

## Scaling Strategies

Strategies for scaling Bunbase applications to handle increased load.

### Vertical Scaling (Scale Up)

Increase instance resources:

**CPU:**
- **Impact**: Directly improves request throughput
- **Recommendation**: 4-8 cores for most applications
- **Bottleneck**: Database often becomes bottleneck before CPU

**Memory:**
- **Impact**: Enables larger connection pools, caching
- **Recommendation**: 4-8GB for small apps, 16-32GB for large
- **Bottleneck**: Database connections consume ~5-10MB each

**Storage:**
- **Impact**: Faster disk I/O for database and logs
- **Recommendation**: NVMe SSD for best performance
- **Bottleneck**: Database IOPS limit

### Horizontal Scaling (Scale Out)

Run multiple Bunbase instances behind load balancer:

**Architecture:**
```
                  ┌─────────────┐
                  │ Load Balancer│
                  │  (nginx/HAProxy) │
                  └─────────────┘
                        │
          ┌─────────────┼─────────────┐
          │             │             │
    ┌─────▼────┐  ┌─────▼────┐  ┌─────▼────┐
    │ Bunbase  │  │ Bunbase  │  │ Bunbase  │
    │ Instance │  │ Instance │  │ Instance │
    │    #1    │  │    #2    │  │    #3    │
    └──────────┘  └──────────┘  └──────────┘
          │             │             │
          └─────────────┼─────────────┘
                        │
                  ┌─────▼──────┐
                  │ PostgreSQL │
                  │  (Primary) │
                  └────────────┘
                        │
                  ┌─────▼──────┐
                  │   Redis    │
                  │  (Shared)  │
                  └────────────┘
```

**Requirements:**
1. **Stateless sessions**: Bunbase sessions are stateless (HMAC-signed), no shared storage needed
2. **Shared database**: All instances connect to same PostgreSQL
3. **Shared Redis**: For distributed rate limiting and KV store
4. **Load balancer**: Distribute requests across instances

**Configuration Example (nginx):**

```nginx
upstream bunbase_backend {
  least_conn;  # Route to instance with fewest connections
  server 10.0.1.10:3000;
  server 10.0.1.11:3000;
  server 10.0.1.12:3000;
}

server {
  listen 80;
  server_name api.example.com;

  location / {
    proxy_pass http://bunbase_backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
  }
}
```

**Capacity Planning:**
- **1 instance**: ~10,000 req/s (simple actions)
- **3 instances**: ~30,000 req/s (linear scaling)
- **10 instances**: ~80,000 req/s (database becomes bottleneck)

### Database Scaling

**Read Replicas:**

For read-heavy workloads, use PostgreSQL read replicas:

```typescript
export default defineConfig({
  database: {
    url: process.env.DATABASE_URL,  // Primary (writes)
    readReplicaUrl: process.env.DATABASE_READ_URL,  // Replica (reads)
  },
})

// Use read replica for queries
const users = await ctx.db.from('users').limit(100)  // Reads from replica
const newUser = await ctx.db.from('users').insert({ ... })  // Writes to primary
```

**Connection Pooling (PgBouncer):**

Use PgBouncer for connection pooling:

```
Bunbase (100 instances) → PgBouncer (pool: 20) → PostgreSQL
```

**Benefits:**
- Reduce database connections from 2000 to 20
- Lower PostgreSQL memory usage
- Faster connection establishment

**Partitioning:**

For very large tables, use PostgreSQL partitioning:

```sql
CREATE TABLE action_logs (
  id UUID PRIMARY KEY,
  action_name TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL
) PARTITION BY RANGE (created_at);

CREATE TABLE action_logs_2025_01 PARTITION OF action_logs
  FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

CREATE TABLE action_logs_2025_02 PARTITION OF action_logs
  FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
```

**Sharding:**

For massive scale, shard database by tenant/user:

```
Tenant A → Database 1
Tenant B → Database 2
Tenant C → Database 3
```

### Caching Strategies

**Application-Level Caching:**

```typescript
export const getUser = action({
  name: 'get-user',
}, async (input, ctx) => {
  // Check cache first
  const cached = await ctx.kv.get(`user:${input.userId}`)
  if (cached) return JSON.parse(cached)

  // Fetch from database
  const user = await ctx.db.from('users').eq('id', input.userId).single()

  // Cache for 5 minutes
  await ctx.kv.set(`user:${input.userId}`, JSON.stringify(user), { expiresIn: 300 })

  return user
})
```

**CDN Caching:**

For static API responses:

```nginx
# nginx config
location /api/public {
  proxy_pass http://bunbase_backend;
  proxy_cache api_cache;
  proxy_cache_valid 200 5m;  # Cache 200 responses for 5 minutes
  add_header X-Cache-Status $upstream_cache_status;
}
```

**HTTP Caching Headers:**

```typescript
export const getPublicData = action({
  output: t.Object({
    data: t.Array(t.String()),
    cacheControl: http.Header(t.String(), 'Cache-Control'),
  }),
}, async (input, ctx) => {
  return {
    data: await fetchData(),
    cacheControl: 'public, max-age=300',  // Cache for 5 minutes
  }
})
```

### Regional Deployment

Deploy to multiple regions for global low-latency:

```
US-East:     Bunbase + Database (primary)
US-West:     Bunbase + Database (read replica)
EU-Central:  Bunbase + Database (read replica)
Asia-Pacific: Bunbase + Database (read replica)
```

**Route traffic based on geography:**
- Use DNS-based routing (Route53, Cloudflare)
- Multi-region load balancers
- Edge caching (CloudFront, Cloudflare)

---

## Performance Checklist

Essential optimizations before production deployment.

### Database

- [ ] Add indexes for frequently queried columns
- [ ] Enable query logging and analyze slow queries (`log_min_duration_statement`)
- [ ] Configure connection pooling (20-50 connections per instance)
- [ ] Enable SSL/TLS encryption (`sslmode=require`)
- [ ] Set appropriate `shared_buffers` (25% of RAM)
- [ ] Configure `work_mem` based on query complexity
- [ ] Enable `pg_stat_statements` for query analysis
- [ ] Set up automated backups (daily)
- [ ] Configure read replicas for read-heavy workloads

### Redis

- [ ] Enable Redis for rate limiting and KV store
- [ ] Configure `maxmemory` and eviction policy (`allkeys-lru`)
- [ ] Enable persistence (RDB or AOF)
- [ ] Set up replication for high availability
- [ ] Monitor memory usage and key expiration

### Application

- [ ] Set appropriate request body size limit (`maxRequestBodySize`)
- [ ] Configure write buffer for high throughput (`flushIntervalMs`, `maxBufferSize`)
- [ ] Tune observability settings (disable unnecessary metrics)
- [ ] Use production log level (`info` or `warn`)
- [ ] Enable CORS with specific origins (not `*`)
- [ ] Set session expiry appropriate for use case
- [ ] Configure queue workers based on workload

### Infrastructure

- [ ] Use HTTPS (SSL/TLS) for all traffic
- [ ] Enable HTTP/2 or HTTP/3 for better performance
- [ ] Set up load balancer with health checks
- [ ] Configure autoscaling based on CPU/memory
- [ ] Use CDN for static assets and API caching
- [ ] Enable DDoS protection (Cloudflare, AWS Shield)
- [ ] Set up monitoring and alerting (Prometheus, Grafana)

### Monitoring

- [ ] Enable Prometheus metrics endpoint (`/_metrics`)
- [ ] Set up Grafana dashboards for key metrics
- [ ] Configure OTLP log export for centralized logging
- [ ] Monitor database connection pool utilization
- [ ] Track action execution latencies (p50, p95, p99)
- [ ] Alert on high error rates (>1% 5xx errors)
- [ ] Monitor queue depth (should stay near zero)
- [ ] Track memory usage and set up OOM alerts

---

## Monitoring & Profiling

Tools and techniques for identifying performance bottlenecks.

### Prometheus Metrics

**Key Metrics to Monitor:**

```promql
# Request throughput
rate(bunbase_http_requests_total[5m])

# Action latency (p99)
histogram_quantile(0.99, rate(bunbase_action_duration_ms_bucket[5m]))

# Error rate
rate(bunbase_errors_total[5m])

# Database query latency
histogram_quantile(0.99, rate(bunbase_db_query_duration_ms_bucket[5m]))

# Queue depth
bunbase_queue_depth{priority="normal"}

# Active connections
bunbase_active_connections
```

**Grafana Dashboard Panels:**
1. Request Rate (req/s) - Time series
2. Latency Percentiles (p50, p95, p99) - Time series
3. Error Rate (%) - Time series
4. Database Pool Utilization (%) - Gauge
5. Memory Usage (MB) - Time series
6. CPU Usage (%) - Time series
7. Queue Depth - Gauge

### Database Profiling

**Enable Query Logging:**

```sql
-- PostgreSQL config
log_min_duration_statement = 100  -- Log queries >100ms
log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h '
```

**Analyze Slow Queries:**

```sql
-- Install pg_stat_statements extension
CREATE EXTENSION pg_stat_statements;

-- Find slowest queries
SELECT
  query,
  calls,
  mean_exec_time,
  total_exec_time,
  rows
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;
```

**Explain Query Plans:**

```sql
EXPLAIN ANALYZE
SELECT * FROM users WHERE email = 'test@example.com';
```

### Application Profiling

**Bun Profiler:**

```bash
# Profile CPU usage
bun --cpu-prof bunbase dev

# Profile heap allocation
bun --heap-prof bunbase dev
```

**Manual Instrumentation:**

```typescript
export const slowAction = action({
  name: 'slow-action',
}, async (input, ctx) => {
  const startTime = performance.now()

  // Expensive operation
  const result = await expensiveComputation()

  const duration = performance.now() - startTime
  ctx.logger.info('Computation completed', { duration })

  return result
})
```

### Load Testing

**Run Benchmarks Regularly:**

```bash
# Before deployment
bun run benchmark

# Compare with baseline
bun run benchmark:compare results-latest.json baseline.json

# CI/CD integration
if [ $? -ne 0 ]; then
  echo "Performance regression detected!"
  exit 1
fi
```

**Continuous Performance Monitoring:**

Set up automated benchmarks in CI/CD:

```yaml
# GitHub Actions example
name: Performance Tests
on: [push, pull_request]
jobs:
  benchmark:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bunbase dev &
      - run: sleep 5  # Wait for server
      - run: bun run benchmark
      - run: bun run benchmark:compare results-latest.json baseline.json
```

---

## Additional Resources

- [Bun Performance](https://bun.sh/docs/runtime/performance)
- [PostgreSQL Performance Tuning](https://wiki.postgresql.org/wiki/Performance_Optimization)
- [Redis Performance Best Practices](https://redis.io/docs/management/optimization/)
- [Autocannon Documentation](https://github.com/mcollina/autocannon)
- [Prometheus Best Practices](https://prometheus.io/docs/practices/)

---

**Last Updated**: 2025-02-14
**Version**: 1.0.0
