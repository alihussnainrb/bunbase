# Bunbase Studio Specification

## 1. Goal
Bunbase Studio is the operational control plane for Bunbase applications. It should give developers and operators a single place to inspect, operate, and administer:
- runtime execution (`actions`, `runs`, `queue`, `scheduler`, `realtime`)
- SaaS platform surfaces (`users`, `orgs`, `rbac`, `billing`, `entitlements`, `invitations`, `api-keys`)
- communications and integrations (`email`, `webhooks`)
- system health (`health`, `metrics`, `logs`, `audit`)

## 2. Target Users
- solo developers (fast local observability and debugging)
- SaaS builders (daily product operations)
- enterprise operators (governance, access control, incident response)

## 3. Recommended Stack
- Build tool: `Vite`
- Frontend: `React + TypeScript`
- UI: `shadcn/ui + Tailwind CSS v4`
- Routing: `TanStack Router`
- Data fetching/cache: `TanStack Query`
- Data grids: `TanStack Table`
- Charts: `ECharts`
- Validation/parsing: `zod`
- Realtime: `WebSocket` first, polling fallback

## 4. Architecture

### 4.1 Runtime Integration
- Studio is served at `/_studio` (configurable by `studio.path`).
- Studio API is served under `/_studio/api` (configurable by `studio.apiPrefix`).
- API should use versioned routes: `/_studio/api/v1/*`.

### 4.2 Data Contracts
Use consistent response envelope:
```json
{
  "data": {},
  "meta": {
    "cursor": "optional",
    "nextCursor": "optional",
    "total": 0
  },
  "error": null,
  "traceId": "trace_..."
}
```

### 4.3 Auth & Permissions
- Require authenticated session for Studio.
- Permission model:
  - `studio.read`
  - `studio.write`
  - `studio.runtime.manage`
  - `studio.platform.manage`
  - `studio.platform.api_keys.manage`
  - `studio.system.admin`
- All mutation endpoints must emit audit events.

## 5. Global UX Layout

### 5.1 Top Bar
- app/environment selector
- global search (`actions`, `runs`, `users`, `orgs`)
- command palette trigger
- notifications
- user menu

### 5.2 Left Navigation
- Overview
- Runtime
  - Actions
  - Runs
  - Queue
  - Scheduler
  - Realtime
- Platform
  - Users
  - Organizations
  - RBAC
  - Billing
  - Entitlements
  - Invitations
  - API Keys
- Communication
  - Email Templates
  - Email Sends
  - Webhooks
- System
  - Health
  - Metrics
  - Logs
  - Audit
- Settings

### 5.3 Main Content Pattern
- page header + status badges + page actions
- filter bar with saved views
- primary table/chart area
- right-side inspector panel (entity details + raw JSON + timeline)

## 6. Screen Inventory

### 6.1 Overview
- KPI cards:
  - requests/min
  - error rate
  - p95 latency
  - queue depth
- charts:
  - runs success/failure trend
  - top failing actions
- feeds:
  - recent incidents
  - failed webhook deliveries
  - pending invitations

### 6.2 Runtime Screens
- Actions List: searchable action catalog with trigger/guard metadata
- Action Detail: schemas, trigger config, last runs, inline test execution
- Runs List: filter by status/action/trigger/trace
- Run Detail: input/output, errors, stack, retry chain, trace metadata
- Queue: pending/running/retrying/dead-letter views with bulk operations
- Scheduler: cron jobs, next-run, pause/resume, manual trigger
- Realtime: channel browser, subscriber counts, message stream, test publish

### 6.3 Platform Screens
- Users: profile, status, sessions, MFA status, org memberships
- Organizations: org profile, members, role matrix, invitation state
- RBAC: roles, permissions, assignments, impact preview
- Billing: plans, subscriptions, status transitions, trial states
- Entitlements: effective feature access + overrides
- Invitations: send/resend/revoke + acceptance tracking
- API Keys: create/rotate/revoke keys, scope management, usage tracking

### 6.4 Communication Screens
- Email Templates: CRUD, preview, version history
- Email Sends: delivery logs, retries, provider responses
- Webhooks Endpoints: config, secret rotation, enable/disable
- Webhook Deliveries: attempts, response body, replay

### 6.5 System Screens
- Health: `/_health`, `/_health/live`, `/_health/ready` visualization
- Metrics: charts from `/_metrics`
- Logs: searchable structured logs (trace correlation)
- Audit: immutable admin activity timeline

### 6.6 Settings
- Studio path/config visibility
- read-only mode by environment
- dangerous action confirmations
- retention settings (runs/logs/audit)

## 7. API Requirements (v1)

### 7.1 Runtime APIs
- `GET /v1/actions`
- `GET /v1/actions/:name`
- `POST /v1/actions/:name/test`
- `GET /v1/runs`
- `GET /v1/runs/:id`
- `GET /v1/queue/jobs`
- `POST /v1/queue/jobs/:id/retry`
- `POST /v1/queue/jobs/:id/cancel`
- `GET /v1/scheduler/jobs`
- `POST /v1/scheduler/jobs/:name/trigger`

### 7.2 Platform APIs
- `GET /v1/users`, `GET /v1/users/:id`, `PATCH /v1/users/:id`
- `GET /v1/orgs`, `GET /v1/orgs/:id`, `PATCH /v1/orgs/:id`
- `GET /v1/rbac/roles`, `GET /v1/rbac/permissions`, `POST /v1/rbac/assignments`
- `GET /v1/billing/plans`, `POST /v1/billing/plans`
- `GET /v1/billing/subscriptions`, `PATCH /v1/billing/subscriptions/:id`
- `GET /v1/entitlements/resolve`
- `POST /v1/entitlements/overrides`
- `GET /v1/invitations`, `POST /v1/invitations`, `POST /v1/invitations/:id/resend`
- `GET /v1/api-keys`, `POST /v1/api-keys`, `POST /v1/api-keys/:id/rotate`, `POST /v1/api-keys/:id/revoke`

### 7.3 Communication APIs
- `GET /v1/email/templates`, `POST /v1/email/templates`, `PATCH /v1/email/templates/:id`
- `POST /v1/email/templates/:id/preview`
- `GET /v1/email/sends`
- `GET /v1/webhooks/endpoints`, `POST /v1/webhooks/endpoints`
- `GET /v1/webhooks/deliveries`, `POST /v1/webhooks/deliveries/:id/replay`

### 7.4 System APIs
- `GET /v1/system/health`
- `GET /v1/system/metrics`
- `GET /v1/system/logs`
- `GET /v1/audit/events`

## 8. Realtime Model
- websocket event types:
  - `run.created`
  - `run.updated`
  - `queue.updated`
  - `webhook.delivery.updated`
  - `incident.created`
- reconnect policy:
  - exponential backoff
  - stale data refetch on reconnect

## 9. Security Requirements
- secure session cookies for production
- CSRF protections on mutating studio APIs
- role/permission checks server-side only
- redact secrets in logs and UI responses
- protect replay/retry actions with explicit permission gates

## 10. Delivery Phases

### Phase 1: Foundation
- app shell + auth gate + nav + global query client
- Overview, Actions, Runs (list/detail)

### Phase 2: Runtime Ops
- Queue, Scheduler, Realtime, System Health

### Phase 3: Platform Core
- Users, Orgs, RBAC, Invitations, Audit baseline

### Phase 4: Platform Advanced
- Billing, Entitlements, API Keys, Webhooks, Email templates/sends

### Phase 5: Enterprise Hardening
- environment isolation
- advanced auditing/export
- governance controls and feature flags

## 11. Definition of Done (per screen)
- has loading/empty/error states
- supports filter/sort/pagination
- URL state is shareable
- permission-aware UI
- mutation emits audit event
- has integration/E2E test

## 12. Initial Backlog (Execution Order)
1. Bootstrap `apps/studio` (Vite + React + TS + Tailwind + shadcn).
2. Add shell layout + route skeleton.
3. Implement Studio API v1 runtime endpoints (`actions`, `runs`).
4. Build `Overview`, `Actions`, `Runs` screens.
5. Add queue/scheduler runtime ops screens.
6. Add platform admin surfaces (`users`, `orgs`, `rbac`).
7. Add billing/entitlements/webhooks/email/api-keys surfaces.
8. Add audit + hardening + performance pass.

## 13. Non-Goals (v1)
- no full no-code workflow builder
- no custom widget builder
- no multi-tenant Studio hosting layer
