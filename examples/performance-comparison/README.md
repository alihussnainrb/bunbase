# Bunbase vs Raw Bun.serve Performance Comparison

This project benchmarks Bunbase against raw `Bun.serve` to measure the performance overhead of the framework.

## What's Being Tested

Both servers implement the same simple endpoint:
- **GET /hello** - Returns `{"message": "Hello World"}`

### Bunbase Version
- Full framework with action validation, TypeBox schemas, routing, logging, persistence
- Port: 3000

### Raw Bun.serve Version
- Minimal implementation using `Bun.serve` directly
- Port: 3001

## Running the Benchmark

### Option 1: Automated (Recommended)

```bash
bun run benchmark:all
```

This will:
1. Start both servers in the background
2. Run 10,000 requests to each server
3. Display performance comparison
4. Clean up processes

### Option 2: Manual

Start both servers in separate terminals:

```bash
# Terminal 1: Start Bunbase server
bun run start:bunbase

# Terminal 2: Start raw Bun.serve server
bun run start:raw

# Terminal 3: Run benchmark
bun run benchmark
```

## Metrics Collected

- **Requests/sec** - Throughput (higher is better)
- **Avg Latency** - Average response time (lower is better)
- **Min/Max Latency** - Latency range
- **P50/P95/P99** - Latency percentiles

## Expected Results

Bunbase adds minimal overhead while providing:
- Type-safe input/output validation
- Automatic OpenAPI documentation
- Structured logging
- Error handling
- Guards & middleware
- Multiple trigger types (API, cron, events, webhooks)
- Database, storage, KV, mailer integrations
- Session management
- IAM (auth, orgs, roles, permissions)

The overhead is typically **< 5%** for simple endpoints, which is negligible considering the features you get.
