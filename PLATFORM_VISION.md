# Bunbase Platform Vision: Complete Usage Handbook

This document describes how Bunbase should feel to use when fully built.
It is not an implementation diff. It is the complete product usage model for developers, platform operators, and enterprise admins.

---

## 1. What Bunbase Is

Bunbase is a backend operating system for modern SaaS and enterprise products.

It combines:
- typed API runtime
- identity, orgs, roles, permissions
- billing, subscriptions, licenses, entitlements
- jobs, queues, scheduler, durable workflows
- realtime channels and event streams
- AI agents, typed tools, sandboxed execution
- integrations, webhooks, email templates and sending
- Studio control plane (runtime + platform + system operations)
- cloud multi-tenancy and on-prem install-time packaging

Goal:
- teams write business modules once
- platform handles security, policy, isolation, observability, and operations by default

---

## 2. Core Product Promise

1. One contract system for APIs, events, jobs, workflows, realtime, and SDKs.
2. One runtime context (`ctx`) with auth, policy, entitlements, db, queue, storage, realtime, audit.
3. One control plane (Studio) for operators.
4. One module system for cloud and on-prem editions.
5. One execution model for sync APIs, async jobs, and long-running workflows.

---

## 3. Feature Inventory (Complete)

### 3.1 Developer Runtime
- contract-first actions and queries
- typed events and event bus
- typed errors and response envelopes
- idempotency keys for mutating operations
- generated OpenAPI and typed SDKs
- multi-repo SDK distribution

### 3.2 Identity and Access
- users
- organizations
- memberships
- invitations
- sessions
- device/session management
- API keys
- service accounts
- OAuth providers
- passkeys / WebAuthn
- OTP and magic link
- MFA TOTP + backup codes
- enterprise SSO (SAML/OIDC)
- SCIM user provisioning

### 3.3 Authorization
- RBAC (roles and permissions)
- ABAC (context-based rules)
- policy packs (org/security constraints)
- decision logs (allow/deny reason)

### 3.4 Billing and Commercial
- org-level plans/subscriptions
- user-level plans/subscriptions
- seats
- trials and grace periods
- metered usage
- invoices and credits
- contracts and overrides
- license issuance and verification

### 3.5 Entitlements and Flags
- feature toggles tied to plans/contracts/licenses
- usage limits (hard/soft)
- quota windows (hour/day/month)
- environment overrides
- emergency kill switches

### 3.6 Async and Automation
- jobs with retries/backoff/DLQ
- queue priorities and per-tenant concurrency
- scheduler (cron, interval, one-shot)
- durable workflows (pause/resume/replay/compensation)

### 3.7 Realtime and Events
- tenant/org/user scoped channels
- typed event payloads
- replay window for reconnects
- presence and occupancy (optional)
- policy enforcement on subscribe/publish

### 3.8 AI and Sandboxing
- agent runtime
- typed tool registry
- prompt/policy guardrails
- token and tool budgets
- sandbox/container execution for untrusted code
- no-host access, network controls, resource limits

### 3.9 Communication
- email templates (HTML or React template)
- template versioning and preview
- test send and staged rollout
- provider adapters (SMTP/API providers)
- outbound webhooks with signature
- webhook delivery logs + replay

### 3.10 Storage and Data
- tenant-scoped object storage
- signed upload/download URLs
- lifecycle/retention policies
- optional malware scanning pipeline

### 3.11 Studio (Control Plane)
- runtime operations pages
- platform management pages
- communication pages
- system health and diagnostics
- audit explorer and trace search

### 3.12 Cloud and On-Prem
- cloud shared control plane + isolated tenant resources
- on-prem install-time module inclusion by license
- no runtime-only hidden modules in on-prem packages

### 3.13 Reliability and Security
- audit logs for mutating operations
- trace correlation across API/job/workflow/webhook
- SLO/SLA support
- backup and disaster recovery playbooks
- key rotation and secret management

---

## 4. Project Structure (How Teams Organize Real Code)

```text
acme-platform/
  apps/
    gateway/
    api/
    worker/
    studio/
    control-plane/
  modules/
    auth/
      contracts/
      actions/
      policies/
      migrations/
    orgs/
    rbac/
    billing/
    entitlements/
    support/
      contracts/
      actions/
      realtime/
      jobs/
      workflows/
      email-templates/
    ai/
      agents/
      tools/
      sandbox/
    webhooks/
    storage/
  packages/
    contracts/
    sdk-generator/
    policy-engine/
    tenancy/
    resource-broker/
    observability/
    testing/
  platform/
    bunbase.config.ts
    profiles/
      cloud-enterprise.yaml
      onprem-basic.yaml
      onprem-enterprise.yaml
    policy/
      roles.yaml
      default-policy-pack.yaml
  infra/
    docker/
    terraform/
    helm/
  scripts/
  .github/workflows/
```

Rules:
- `modules/*` contains business and platform capabilities.
- `apps/*` contains runtime entrypoints.
- `packages/*` contains shared primitives and tooling.

---

## 5. Runtime Configuration (Imagined)

`platform/bunbase.config.ts`

```ts
import { definePlatform } from "bunbase";

export default definePlatform({
  app: { name: "acme-platform", env: process.env.NODE_ENV },
  gateway: {
    tenantResolution: ["host", "header:x-tenant-id", "jwt-claim:tid"],
    trustedProxyHops: 1,
  },
  auth: {
    methods: ["password", "otp", "passkey", "oauth-google", "saml"],
    session: { ttlHours: 24, idleTimeoutMinutes: 30 },
    mfa: { totp: true, backupCodes: true },
  },
  jobs: { provider: "redis-streams", defaultRetries: 8, dlq: true },
  realtime: { provider: "nats", replayWindowSeconds: 900 },
  workflows: { provider: "durable-engine", retentionDays: 30 },
  modules: [
    "auth",
    "orgs",
    "rbac",
    "billing",
    "entitlements",
    "support",
    "ai",
    "webhooks",
    "storage",
  ],
});
```

---

## 6. Tenant Isolation Model (Cloud Multi-Tenant)

Each tenant gets isolated resources:
- db URL or dedicated schema policy
- storage bucket/prefix
- queue namespace/partition
- key reference (KMS)

Per request flow:
1. Gateway resolves tenant.
2. Resource Broker fetches tenant bindings.
3. Runtime creates tenant-scoped clients.
4. Module code only receives tenant-scoped clients.

`apps/api/src/middleware/tenant-context.ts`

```ts
export async function buildTenantContext(req: Request, platform: PlatformRuntime) {
  const tenant = await platform.tenancy.resolveTenant(req);
  if (!tenant) throw new HttpError(400, "tenant_not_resolved");

  const bindings = await platform.tenancy.getBindings(tenant.id);
  if (!bindings) throw new HttpError(503, "tenant_bindings_missing");

  return {
    tenant,
    db: platform.db.forTenant(bindings.db),
    storage: platform.storage.forTenant(bindings.storage),
    queue: platform.queue.forTenant(bindings.queue),
    kms: platform.kms.forTenant(bindings.kms),
  };
}
```

---

## 7. API Authoring: Exact Usage Pattern

### 7.1 Define contract

```ts
// modules/support/contracts/create-ticket.contract.ts
import { s } from "bunbase/schema";

export const CreateTicketInput = s.object({
  orgId: s.string(),
  subject: s.string().min(3),
  body: s.string().min(10),
  priority: s.enum(["low", "normal", "high"]),
});

export const CreateTicketOutput = s.object({
  ticketId: s.string(),
  status: s.literal("open"),
});
```

### 7.2 Implement action

```ts
// modules/support/actions/create-ticket.action.ts
import { action } from "bunbase";
import { CreateTicketInput, CreateTicketOutput } from "../contracts/create-ticket.contract";

export const createTicket = action({
  name: "support.ticket.create",
  input: CreateTicketInput,
  output: CreateTicketOutput,
  permissions: ["ticket:create"],
  requiresFeatures: ["support.core"],
  handler: async (input, ctx) => {
    const ticket = await ctx.db.tickets.insert({
      orgId: input.orgId,
      subject: input.subject,
      body: input.body,
      priority: input.priority,
      status: "open",
      createdBy: ctx.actor.userId,
    });

    await ctx.realtime.publish({
      channel: `org:${input.orgId}:tickets`,
      event: "ticket.created",
      payload: { ticketId: ticket.id, subject: ticket.subject, priority: ticket.priority },
    });

    return { ticketId: ticket.id, status: "open" };
  },
});
```

### 7.3 Invoke via endpoint
- `POST /v1/actions/support.ticket.create/run`

### 7.4 Invoke via SDK (typed)

```ts
import { client } from "@acme/platform-sdk";

const out = await client.actions.support.ticket.create.run({
  orgId: "org_01",
  subject: "Cannot login",
  body: "SSO redirect loop",
  priority: "high",
});
```

---

## 8. End-to-End Type Safety (Mono-Repo and Multi-Repo)

Generated artifacts from contracts:
- OpenAPI JSON
- typed TS SDK
- event payload types
- job payload types
- workflow input/output types
- realtime event types

Example commands:

```bash
pnpm bunbase contracts:build
pnpm bunbase sdk:generate
pnpm -F @acme/platform-sdk publish --access restricted
```

Compatibility policy:
- additive change: minor
- breaking change: major
- CI gate blocks breaking server changes against pinned client ranges

---

## 9. Realtime: Full Example

Server publish:

```ts
await ctx.realtime.publish({
  channel: `org:${ctx.org.id}:tickets`,
  event: "ticket.status.changed",
  payload: { ticketId, from: "open", to: "in_progress", at: new Date().toISOString() },
});
```

Client subscribe:

```ts
client.realtime
  .channel(`org:${orgId}:tickets`)
  .on("ticket.status.changed", (evt) => {
    // evt typed
    updateTicket(evt.ticketId, evt.to);
  });
```

Delivery semantics:
- at-least-once delivery
- ordered within a channel partition
- replay window for reconnect

---

## 10. Jobs, Scheduler, Workflows: Practical End-to-End Example

Use case:
- subscription trial lifecycle automation

### 10.1 One-shot schedule

```ts
await ctx.scheduler.once(`trial-warning:${sub.id}`, {
  runAt: sub.trialEndsAt.minus({ days: 7 }).toJSDate(),
  job: "billing.sendTrialWarning",
  payload: { subscriptionId: sub.id },
  idempotencyKey: `trial-warning:${sub.id}`,
});
```

### 10.2 Daily cron

```ts
await ctx.scheduler.cron("billing.trial-expiry-check", {
  cron: "0 1 * * *",
  timezone: "UTC",
  job: "billing.processTrialExpirations",
});
```

### 10.3 Worker

```ts
worker("billing.processTrialExpirations", async (_job, ctx) => {
  const due = await ctx.db.subscriptions.findTrialEndedToday();
  for (const sub of due) {
    await ctx.workflow.start("billing.trial.expired", { subscriptionId: sub.id, orgId: sub.orgId });
  }
});
```

### 10.4 Durable workflow

```ts
export const trialExpired = workflow({
  name: "billing.trial.expired",
  input: s.object({ subscriptionId: s.string(), orgId: s.string() }),
  steps: {
    downgrade: async ({ input, ctx }) => ctx.entitlements.applyPreset(input.orgId, "free"),
    notify: async ({ input, ctx }) =>
      ctx.jobs.enqueue("email.send", { template: "trial-ended", orgId: input.orgId }),
    waitGrace: wait.forDuration("7d"),
    restoreIfPaid: async ({ input, ctx }) => {
      const paid = await ctx.db.subscriptions.hasActivePaymentMethod(input.subscriptionId);
      if (paid) await ctx.entitlements.applyPreset(input.orgId, "pro");
    },
  },
});
```

When to use each:
- Job: single async task.
- Scheduler: time trigger to enqueue job/workflow.
- Workflow: long-running multi-step process with state and compensation.

---

## 11. Auth + RBAC + Entitlements + Billing in One Request

```ts
export const createAiDraft = action({
  name: "support.ticket.aiDraft",
  input: s.object({ ticketId: s.string() }),
  output: s.object({ draft: s.string() }),
  permissions: ["ticket:reply"],
  requiresFeatures: ["ai.assistant"],
  handler: async ({ ticketId }, ctx) => {
    await ctx.entitlements.requireLimit("ai.tokens.monthly", 500);

    const ticket = await ctx.db.tickets.byId(ticketId);
    const out = await ctx.agents.run("support-agent", {
      prompt: `Draft a response for ${ticket.subject}`,
      tools: ["kb.search", "tone.check"],
      budget: { maxTokens: 12000, maxToolCalls: 12 },
    });

    await ctx.billing.meterUsage({
      orgId: ctx.org.id,
      metric: "ai_tokens",
      quantity: out.usage.totalTokens,
    });

    return { draft: out.text };
  },
});
```

---

## 12. API Keys and Service Accounts

Use cases:
- machine-to-machine integrations
- CI/CD automation
- external partner access

Features:
- scoped permissions per key
- org or project scoping
- expiration and rotation
- last-used telemetry
- hashed-at-rest key storage

Example:

```ts
const key = await ctx.apiKeys.create({
  orgId: "org_01",
  name: "jira-sync",
  scopes: ["ticket:read", "ticket:write"],
  expiresAt: "2026-12-31T00:00:00Z",
});
```

---

## 13. Email Templates, Sends, and Webhooks

Template types:
- html
- react-template

Example send:

```ts
await ctx.email.send({
  template: "trial-warning",
  to: org.billingEmail,
  model: { orgName: org.name, trialEndsAt: sub.trialEndsAt.toISODate() },
});
```

Webhook behavior:
- signed payload
- retries with backoff
- dead-letter on terminal failure
- replay from Studio

---

## 14. AI Agents, Tools, and Sandboxes

Agent run:

```ts
const result = await ctx.agents.run("support-agent", {
  prompt: "Summarize ticket and propose reply",
  tools: ["tickets.get", "kb.search", "email.sendDraft"],
  budget: { maxTokens: 10000, maxToolCalls: 10 },
});
```

Sandbox execution for untrusted code:

```ts
const run = await ctx.sandbox.execute({
  runtime: "python3.12",
  timeoutMs: 5000,
  memoryMb: 256,
  cpuShares: 128,
  network: "deny",
  filesystem: "ephemeral",
  code: "print('ok')",
});
```

Guarantees:
- no host filesystem
- no unrestricted network
- hard CPU/memory/time caps
- stdout/stderr/artifact capture

---

## 15. Studio: Complete Screen Map

### 15.1 Overview
- global KPIs
- queue lag
- workflow success/failure trend
- top incidents
- active alerts

### 15.2 Runtime
- Actions: run explorer, latency and errors
- Jobs: queue depth, retries, DLQ, replay
- Scheduler: active schedules and next run
- Workflows: graph view, blocked steps, state
- Agents: model/tool usage and failures
- Sandboxes: executions, resource usage, denials

### 15.3 Platform
- Users
- Organizations
- Memberships
- Roles and Permissions
- Policy Packs
- API Keys and Service Accounts
- Billing Plans and Catalog
- Subscriptions (org and user)
- Licenses
- Entitlements and Overrides
- Feature Flags

### 15.4 Communication
- Email Templates (editor, versions, preview)
- Sends (status timeline)
- Webhooks (deliveries, retries, replay)

### 15.5 System
- Health checks
- Logs
- Metrics
- Traces
- Audit explorer
- Config and secret status
- Migration status

---

## 16. Local Development (How to Run)

Infra dependencies:
- Postgres
- Redis
- NATS
- MinIO

Commands:

```bash
pnpm install
pnpm infra:up
pnpm bunbase tenant:seed --count 3
pnpm bunbase migrate
pnpm bunbase sdk:generate
pnpm dev:gateway
pnpm dev:api
pnpm dev:worker
pnpm dev:studio
```

Smoke request:

```bash
curl -X POST http://localhost:3000/v1/actions/support.ticket.create/run \
  -H "Authorization: Bearer <token>" \
  -H "x-tenant-id: tenant_001" \
  -H "Idempotency-Key: ticket-001" \
  -H "Content-Type: application/json" \
  -d '{"orgId":"org_1","subject":"Cannot login","body":"SSO redirect loop","priority":"high"}'
```

---

## 17. Testing Strategy (Complete)

Levels:
1. unit tests (pure logic/schema/policy helpers)
2. contract tests (API/event/job/workflow compatibility)
3. integration tests (db/queue/storage adapters)
4. scenario tests (end-to-end business journeys)
5. replay tests (failed run snapshots)
6. load tests (latency, queue backpressure)
7. security tests (authz bypass, sandbox escape, key leakage)

Scenario example:

```ts
scenario("trial lifecycle", async ({ api, worker, clock }) => {
  const org = await api.orgs.create({ name: "Acme" });
  const sub = await api.billing.startTrial({ orgId: org.id, days: 14 });

  await clock.fastForward("7d");
  await worker.drain();
  await api.email.assertSent({ template: "trial-warning", orgId: org.id });

  await clock.fastForward("7d");
  await worker.drain();
  const ent = await api.entitlements.resolve({ orgId: org.id });
  expect(ent.plan).toBe("free");

  await api.billing.addPaymentMethod({ orgId: org.id });
  await worker.drain();
  const ent2 = await api.entitlements.resolve({ orgId: org.id });
  expect(ent2.plan).toBe("pro");
});
```

CI gates:
- `type-check`
- `contracts:check-breaking`
- changed-module integration tests
- migration up/down verification
- replay smoke suite

---

## 18. Deployment Topologies

### 18.1 Cloud Shared Control Plane + Isolated Tenants
- shared gateway/api/worker/studio services
- per-tenant db/storage/queue binding
- regional deployment cells

### 18.2 Dedicated Single-Tenant Cloud (Enterprise Option)
- same codebase
- dedicated infra stack per tenant
- stricter network and compliance controls

### 18.3 On-Prem
- customer-managed cluster
- offline-friendly operation
- install-time module inclusion by signed license

---

## 19. On-Prem Packaging (No Runtime Hiding)

Profile example:

```yaml
# platform/profiles/onprem-basic.yaml
include:
  - auth
  - orgs
  - rbac
  - support
  - jobs
  - workflows
exclude:
  - ai
  - billing
  - studio
```

Build command:

```bash
pnpm bunbase build:onprem --profile platform/profiles/onprem-basic.yaml --license ./license.jwt
```

Build behavior:
1. verify license signature and claims
2. resolve module dependency graph
3. package only allowed modules
4. apply only allowed migrations
5. generate routes/workers/studio menu from packaged modules

Result:
- excluded modules are absent from binaries and migration set

---

## 20. Infrastructure Blueprint (Cloud)

Components:
- ingress + gateway
- api runtime deployment
- worker deployment
- realtime broker
- job backend
- workflow state backend
- control plane + studio
- observability stack

Tenant provisioning flow:
1. signup accepted
2. terraform provisions db/storage/queue/key
3. tenant registry writes bindings
4. seed default org/admin/plan
5. tenant marked active

---

## 21. Security and Compliance Baseline

Authentication and session:
- short-lived access tokens
- secure refresh rotation
- device/session revocation

Data and secret protection:
- secrets encrypted at rest
- API keys hashed at rest
- key rotation procedures

Policy and audit:
- mutating admin actions always audited
- allow/deny decisions logged with reason
- tamper-evident audit transport

Sandbox security:
- egress deny by default
- per-run limits
- image allowlist

Enterprise controls:
- SSO/SCIM
- audit export
- data retention policies
- optional residency controls

---

## 22. Reliability and Operations Baseline

Reliability guarantees:
- idempotent mutating operations
- retry classification (transient/permanent)
- DLQ with replay
- workflow compensation for partial failures

Observability:
- trace correlation IDs across all planes
- per-tenant metrics
- queue lag and workflow SLA dashboards

Incident response:
1. detect (alert)
2. triage (trace + audit + run explorer)
3. mitigate (pause schedule/replay/rollback)
4. postmortem (timeline export)

---

## 23. Single Request Trace (Concrete Mental Model)

Request:
- `POST /v1/actions/support.ticket.aiDraft/run`

Chain:
1. Gateway resolves tenant and actor.
2. Auth validates session/API key.
3. Policy checks `ticket:reply`.
4. Entitlements verify `ai.assistant` + token quota.
5. Action reads ticket from tenant DB.
6. Agent runtime executes tools.
7. Sandbox runs untrusted transform if needed.
8. Billing meter records token usage.
9. Realtime publishes `ticket.draft.ready`.
10. Audit event stored.
11. Typed response returned.

Everything above is visible as one trace in Studio.

---

## 24. API Surface (Imagined)

Core runtime:
- `POST /v1/actions/:name/run`
- `GET /v1/runs/:id`
- `POST /v1/jobs`
- `GET /v1/jobs/:id`
- `POST /v1/workflows/:name/start`
- `GET /v1/workflows/runs/:id`

Identity and access:
- `/v1/auth/*`
- `/v1/users/*`
- `/v1/orgs/*`
- `/v1/roles/*`
- `/v1/policies/*`
- `/v1/api-keys/*`

Commercial:
- `/v1/plans/*`
- `/v1/subscriptions/*`
- `/v1/licenses/*`
- `/v1/entitlements/*`
- `/v1/feature-flags/*`

Communication:
- `/v1/email/templates/*`
- `/v1/email/sends/*`
- `/v1/webhooks/*`

System:
- `/v1/system/health`
- `/v1/system/metrics`
- `/v1/audit/events`

---

## 25. Developer Lifecycle (Day 0 to Production)

Day 0:
- scaffold project
- enable modules in config
- run local infra and migrations

Day 1:
- define first contracts
- implement first actions
- generate SDK
- ship first UI integration

Day 2-3:
- add jobs/workflows
- add realtime updates
- add email templates

Day 4-5:
- add scenario tests and load checks
- configure alerts and dashboards

Production:
- deploy cloud profile
- onboard tenants
- monitor SLOs
- iterate features by module

---

## 26. Definition of Vision Complete

Bunbase vision is achieved when:
1. teams define contracts and business logic without assembling external primitives first
2. one SDK gives typed client calls, events, realtime, and workflow payloads
3. every critical flow is traceable, replayable, and auditable
4. cloud multi-tenant and on-prem builds come from one module system
5. operators can run the platform from Studio without scripting day-to-day ops

---

## 27. Quick Start Cheat Sheet

```bash
# scaffold
pnpm create bunbase-app acme-platform

# local infra and setup
pnpm infra:up
pnpm bunbase tenant:seed --count 3
pnpm bunbase migrate
pnpm bunbase sdk:generate

# run runtime + control plane
pnpm dev:gateway
pnpm dev:api
pnpm dev:worker
pnpm dev:studio

# test and verify
pnpm test
pnpm test:integration
pnpm test:scenarios
pnpm bunbase contracts:check-breaking

# deploy cloud
pnpm deploy:cloud

# build on-prem package
pnpm bunbase build:onprem --profile platform/profiles/onprem-enterprise.yaml --license ./license.jwt
```

If this handbook matches actual developer and operator experience, the Bunbase platform vision is clear and complete.
