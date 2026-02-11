# Bunbase Completion Plan

## Context

Bunbase is a Bun-native backend framework at v0.0.9 with solid core primitives (actions, modules, triggers, guards, executor) but has several critical bugs preventing it from running, incomplete features, and mock implementations that need to be wired to real data. The test suite shows failures caused by circular dependency issues. The DB client has API mismatches with SaaS services, and the studio/dashboard features are stubbed.

## Phase 1: Fix Critical Bugs (Must Fix First)

### 1.1 Fix Circular Dependency in `src/index.ts`
**Problem**: `src/index.ts` exports `triggers` from `./triggers/index.ts` AND `server.ts` imports `./studio/module.ts` which imports studio actions that import from `../../` (back to `src/index.ts`). This causes `ReferenceError: Cannot access 'triggers' before initialization`.

**Fix**: Studio actions should import directly from their sibling modules instead of from the barrel `../../` (src/index.ts). Change all studio action imports:
- `packages/bunbase/src/studio/actions/get-actions.ts` — change `from '../../'` to direct imports
- `packages/bunbase/src/studio/actions/get-action-details.ts` — same
- `packages/bunbase/src/studio/actions/get-runs.ts` — same
- `packages/bunbase/src/studio/actions/get-run-details.ts` — same
- `packages/bunbase/src/studio/module.ts` — change `from '../index'` to direct imports

### 1.2 Remove Duplicate Studio Files
**Problem**: `studio/runs.ts` duplicates `studio/actions/get-runs.ts` and `studio/actions/get-run-details.ts`. The module imports from `actions/` directory.

**Fix**: Delete `packages/bunbase/src/studio/runs.ts` (unused duplicate).

### 1.3 Fix Type Error in `cli/commands/dev.ts`
**Problem**: Passes `{ secret: ... }` but `BunbaseServer` expects `{ sessionSecret: ... }` per `BunbaseConfig['auth']`.

**Fix**: Change `secret:` to `sessionSecret:` in dev.ts and pass full config object to BunbaseServer.

### 1.4 Fix `OrganizationService` API Mismatch
**Problem**: Uses `.where()` and `.first()` which don't exist on `TypedQueryBuilder`. The builder has `.eq()` and `.single()`.

**Fix** in `packages/bunbase/src/saas/organizations.ts`:
- `.where({ id }).first()` → `.eq('id', id).single()`
- `.where({ org_id, user_id }).first()` → `.eq('org_id', orgId).eq('user_id', userId).single()`

### 1.5 Fix `SubscriptionService` API Mismatch
**Problem**: Same as OrganizationService — uses `.where()` and `.first()`.

**Fix** in `packages/bunbase/src/saas/subscriptions.ts`:
- `.where({ org_id: orgId }).first()` → `.eq('org_id', orgId).single()`

### 1.6 Fix Duplicate `IN` Check in `db/client.ts`
**Problem**: Lines 120-126 and 175-181 have duplicate `if (w.op === 'IN')` blocks.

**Fix**: Remove the duplicate `if (w.op === 'IN')` block in both `exec()` and `update()` methods.

### 1.7 Fix `devCommand` Config Passing
**Problem**: `devCommand` builds a custom auth object instead of passing `BunbaseConfig` directly.

**Fix**: Pass the config object directly to `BunbaseServer`.

## Phase 2: Fix Server Routing

### 2.1 Implement Path Parameter Routing
**Problem**: Server uses exact string matching (`GET:/users/:id` won't match `GET:/users/123`). The `url-parser.ts` exists but isn't used.

**Fix** in `packages/bunbase/src/runtime/server.ts`:
- Use `parsePathParams` from `url-parser.ts` for route matching
- When exact match fails, iterate routes to find pattern match
- Pass parsed params to the trigger map function or merge into input

### 2.2 Fix Duplicate Request Handling in Server
**Problem**: `mountOpenAPI()` overrides `handleRequest` but the original `handleRequest` also has OpenAPI/studio route checks, causing double handling.

**Fix**: Remove the hardcoded OpenAPI/studio handling from the base `handleRequest` method since `mountOpenAPI()` already handles it via override.

### 2.3 Remove Mock `handleStudioAPI`
**Problem**: `handleStudioAPI` returns hardcoded mock data. Studio actions are registered as normal actions — they should route through the standard pipeline.

**Fix**: Remove `handleStudioAPI` and let studio API requests fall through to normal action routing.

## Phase 3: Complete DB Layer

### 3.1 Complete `db/types.ts`
Add missing table types for all tables referenced in the codebase:
- `organizations`, `org_memberships`, `org_invitations`
- `roles`, `permissions`, `role_permissions`
- `plans`, `plan_features`, `features`
- `subscriptions`
- `action_runs`, `action_logs`
- `job_queue`, `job_failures`

### 3.2 Add Query Builder Methods
Add commonly needed methods to `TypedQueryBuilder`:
- `neq()`, `gt()`, `gte()`, `lt()`, `lte()`
- `like()`, `ilike()`
- `isNull()`, `isNotNull()`
- `orderBy(column, direction)`
- `offset(n)`
- `count()` for counting rows

### 3.3 Add SQL Migration File
Create `packages/bunbase/src/db/schema/001_init.sql` with the complete schema DDL for all tables.

## Phase 4: Wire Studio Actions to Real Data

### 4.1 Add `registry` to `ActionContext`
Add an optional `registry` field to `ActionContext` so studio actions can introspect registered actions.

### 4.2 Update Studio Actions
- `get-actions.ts`: Query registry for real actions, combine with run stats from DB
- `get-runs.ts`: Query `action_runs` table via `ctx.db`
- `get-action-details.ts`: Combine registry data + run stats from DB
- `get-run-details.ts`: Query `action_runs` + `action_logs` tables

### 4.3 Wire Registry into Executor
Pass registry reference when building ActionContext in executor.ts.

## Phase 5: Complete Missing Features

### 5.1 Fix `inOrg` Guard
- Look up subscription from DB instead of hardcoding 'free'
- Get actual member count from DB

### 5.2 Fix Build Config
**Problem**: `bunup.config.ts` only builds `./src/index.ts` but package.json exports `./cli`, `./db`, `./logger`.

**Fix**: Add multiple entry points to bunup config.

### 5.3 Add CLI `init` Command
Add `packages/bunbase/src/cli/commands/init.ts` to scaffold a new bunbase project.

### 5.4 Add CLI `generate` Command
Add `packages/bunbase/src/cli/commands/generate.ts` for generating action/module scaffolds.

### 5.5 Remove Dead Dashboard UI Code
Delete `src/dashboard/` directory — old React dashboard attempt with missing deps that's been replaced by the `studio/` approach.

## Phase 6: Fix Guard Error Handling in Server

### 6.1 Propagate Error Objects Through Executor
**Problem**: Executor catches errors and only returns `error: string`. Server determines HTTP status by string matching.

**Fix**: Return the error object from executor so the server can check `instanceof GuardError` / `instanceof BunbaseError` for proper status codes.

## Files to Modify (Summary)

**Fix circular deps:**
- `packages/bunbase/src/studio/actions/get-actions.ts`
- `packages/bunbase/src/studio/actions/get-action-details.ts`
- `packages/bunbase/src/studio/actions/get-runs.ts`
- `packages/bunbase/src/studio/actions/get-run-details.ts`
- `packages/bunbase/src/studio/module.ts`

**Delete:**
- `packages/bunbase/src/studio/runs.ts` (duplicate)
- `packages/bunbase/src/dashboard/` (dead code)

**Fix bugs:**
- `packages/bunbase/src/cli/commands/dev.ts`
- `packages/bunbase/src/saas/organizations.ts`
- `packages/bunbase/src/saas/subscriptions.ts`
- `packages/bunbase/src/db/client.ts`
- `packages/bunbase/src/runtime/server.ts`
- `packages/bunbase/src/runtime/executor.ts`

**Complete features:**
- `packages/bunbase/src/db/types.ts`
- `packages/bunbase/src/db/client.ts` (add methods)
- `packages/bunbase/src/db/schema/001_init.sql` (new)
- `packages/bunbase/src/guards/saas.ts`
- `packages/bunbase/src/core/types.ts` (add registry to context)
- `packages/bunbase/src/cli/index.ts`
- `packages/bunbase/src/cli/commands/init.ts` (new)
- `packages/bunbase/src/cli/commands/generate.ts` (new)
- `bunup.config.ts`

## Verification

1. `bun test` — all tests should pass (0 failures, 0 errors)
2. `bun run type-check` — no type errors in bunbase package
3. `bun run build` — builds successfully with all entry points
