# Bunbase Studio API Specification (v1)

This document defines concrete request/response contracts for Studio APIs under `/_studio/api/v1/*`.

## 1. Conventions

### 1.1 Base URL
- Studio UI: `/_studio`
- Studio API: `/_studio/api/v1`

### 1.2 Authentication
- Session cookie or bearer token accepted.
- All endpoints require an authenticated principal.

### 1.3 Response Envelope

```ts
type CursorMeta = {
  cursor?: string;
  nextCursor?: string;
  total?: number;
};

type ApiError = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

type ApiResponse<TData, TMeta = CursorMeta> = {
  data: TData | null;
  meta: TMeta;
  error: ApiError | null;
  traceId: string;
};
```

### 1.4 Shared Query Types

```ts
type PaginationQuery = {
  cursor?: string;
  limit?: number; // 1..100, default 20
};

type TimeRangeQuery = {
  from?: string; // ISO datetime
  to?: string;   // ISO datetime
};
```

### 1.5 Shared Value Types

```ts
type ID = string;
type ISODateTime = string;

type PrincipalType = "user" | "org";
type Status = "active" | "inactive" | "suspended";
type TemplateType = "html" | "react_email" | "text";
```

## 2. Runtime APIs

## 2.1 `GET /v1/actions`
Permission: `studio.read`

```ts
type Query = PaginationQuery & {
  q?: string;
  trigger?: "http" | "event" | "queue" | "cron";
  hasGuard?: boolean;
};

type ActionSummary = {
  name: string;
  trigger: "http" | "event" | "queue" | "cron";
  guards: string[];
  lastRunAt?: ISODateTime;
  successRate24h?: number; // 0..1
  p95Ms?: number;
};

type Response = ApiResponse<{ items: ActionSummary[] }>;
```

## 2.2 `GET /v1/actions/:name`
Permission: `studio.read`

```ts
type ActionDetail = ActionSummary & {
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  errorSchema?: Record<string, unknown>;
  recentRuns: { id: ID; status: "success" | "failed" | "running"; startedAt: ISODateTime }[];
};

type Response = ApiResponse<ActionDetail>;
```

## 2.3 `POST /v1/actions/:name/test`
Permission: `studio.runtime.manage`

```ts
type Body = {
  input: Record<string, unknown>;
  context?: {
    userId?: ID;
    orgId?: ID;
    dryRun?: boolean;
  };
};

type Response = ApiResponse<{
  runId: ID;
  status: "queued" | "running" | "success" | "failed";
  output?: Record<string, unknown>;
  error?: { code: string; message: string; stack?: string };
}>;
```

## 2.4 `GET /v1/runs`
Permission: `studio.read`

```ts
type Query = PaginationQuery & TimeRangeQuery & {
  action?: string;
  status?: "queued" | "running" | "success" | "failed" | "cancelled";
  trigger?: "http" | "event" | "queue" | "cron";
  traceId?: string;
};

type RunSummary = {
  id: ID;
  action: string;
  status: "queued" | "running" | "success" | "failed" | "cancelled";
  trigger: "http" | "event" | "queue" | "cron";
  startedAt: ISODateTime;
  finishedAt?: ISODateTime;
  durationMs?: number;
  traceId: string;
};

type Response = ApiResponse<{ items: RunSummary[] }>;
```

## 2.5 `GET /v1/runs/:id`
Permission: `studio.read`

```ts
type Response = ApiResponse<RunSummary & {
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: { code: string; message: string; stack?: string };
  retries: { id: ID; status: string; createdAt: ISODateTime }[];
  metadata?: Record<string, unknown>;
}>;
```

## 2.6 `GET /v1/queue/jobs`
Permission: `studio.read`

```ts
type Query = PaginationQuery & {
  queue?: string;
  status?: "pending" | "running" | "retrying" | "dead";
};

type QueueJob = {
  id: ID;
  queue: string;
  action: string;
  status: "pending" | "running" | "retrying" | "dead";
  attempts: number;
  maxAttempts: number;
  nextRunAt?: ISODateTime;
  createdAt: ISODateTime;
};

type Response = ApiResponse<{ items: QueueJob[] }>;
```

## 2.7 `POST /v1/queue/jobs/:id/retry`
Permission: `studio.runtime.manage`

```ts
type Body = { reason?: string };
type Response = ApiResponse<{ jobId: ID; status: "pending" }>;
```

## 2.8 `POST /v1/queue/jobs/:id/cancel`
Permission: `studio.runtime.manage`

```ts
type Body = { reason?: string };
type Response = ApiResponse<{ jobId: ID; status: "cancelled" }>;
```

## 2.9 `GET /v1/scheduler/jobs`
Permission: `studio.read`

```ts
type SchedulerJob = {
  name: string;
  schedule: string; // cron
  enabled: boolean;
  timezone?: string;
  nextRunAt?: ISODateTime;
  lastRunAt?: ISODateTime;
  lastRunStatus?: "success" | "failed";
};

type Response = ApiResponse<{ items: SchedulerJob[] }>;
```

## 2.10 `POST /v1/scheduler/jobs/:name/trigger`
Permission: `studio.runtime.manage`

```ts
type Body = { reason?: string };
type Response = ApiResponse<{ runId: ID; status: "queued" | "running" }>;
```

## 3. Platform APIs

## 3.1 Users

### `GET /v1/users`
Permission: `studio.read`

```ts
type Query = PaginationQuery & {
  q?: string;
  status?: Status;
  orgId?: ID;
};

type User = {
  id: ID;
  email: string;
  name?: string;
  status: Status;
  mfaEnabled: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
};

type Response = ApiResponse<{ items: User[] }>;
```

### `GET /v1/users/:id`
Permission: `studio.read`

```ts
type Response = ApiResponse<User & {
  orgMemberships: { orgId: ID; role: string }[];
  sessions: { id: ID; createdAt: ISODateTime; lastSeenAt?: ISODateTime; ip?: string }[];
}>;
```

### `PATCH /v1/users/:id`
Permission: `studio.platform.manage`

```ts
type Body = {
  name?: string;
  status?: Status;
  metadata?: Record<string, unknown>;
};

type Response = ApiResponse<User>;
```

## 3.2 Organizations

### `GET /v1/orgs`
Permission: `studio.read`

```ts
type Query = PaginationQuery & { q?: string; status?: Status };
type Org = {
  id: ID;
  slug: string;
  name: string;
  status: Status;
  ownerUserId: ID;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
};
type Response = ApiResponse<{ items: Org[] }>;
```

### `GET /v1/orgs/:id`
Permission: `studio.read`

```ts
type Response = ApiResponse<Org & {
  members: { userId: ID; role: string; joinedAt: ISODateTime }[];
  invitations: { id: ID; email: string; role: string; status: string; expiresAt: ISODateTime }[];
}>;
```

### `PATCH /v1/orgs/:id`
Permission: `studio.platform.manage`

```ts
type Body = {
  name?: string;
  slug?: string;
  status?: Status;
  metadata?: Record<string, unknown>;
};
type Response = ApiResponse<Org>;
```

## 3.3 RBAC

### `GET /v1/rbac/roles`
Permission: `studio.read`

```ts
type Role = { id: ID; key: string; name: string; permissions: string[]; system: boolean };
type Response = ApiResponse<{ items: Role[] }>;
```

### `GET /v1/rbac/permissions`
Permission: `studio.read`

```ts
type Permission = { key: string; description?: string };
type Response = ApiResponse<{ items: Permission[] }>;
```

### `POST /v1/rbac/assignments`
Permission: `studio.platform.manage`

```ts
type Body = {
  principalType: PrincipalType;
  principalId: ID;
  roleKey: string;
  orgId?: ID;
};
type Response = ApiResponse<{
  assignmentId: ID;
  principalType: PrincipalType;
  principalId: ID;
  roleKey: string;
  orgId?: ID;
  assignedAt: ISODateTime;
}>;
```

## 3.4 Billing

### `GET /v1/billing/plans`
Permission: `studio.read`

```ts
type Plan = {
  id: ID;
  key: string;
  name: string;
  interval: "month" | "year";
  amount: number; // smallest currency unit
  currency: string;
  active: boolean;
};
type Response = ApiResponse<{ items: Plan[] }>;
```

### `POST /v1/billing/plans`
Permission: `studio.platform.manage`

```ts
type Body = {
  key: string;
  name: string;
  interval: "month" | "year";
  amount: number;
  currency: string;
  trialDays?: number;
  features?: { key: string; enabled: boolean; limit?: number | null }[];
};
type Response = ApiResponse<Plan & { trialDays?: number }>;
```

### `GET /v1/billing/subscriptions`
Permission: `studio.read`

```ts
type Query = PaginationQuery & {
  principalType?: PrincipalType;
  principalId?: ID;
  status?: "trialing" | "active" | "past_due" | "cancelled";
};

type Subscription = {
  id: ID;
  principalType: PrincipalType;
  principalId: ID;
  planKey: string;
  status: "trialing" | "active" | "past_due" | "cancelled";
  currentPeriodStart: ISODateTime;
  currentPeriodEnd: ISODateTime;
  cancelAtPeriodEnd: boolean;
};

type Response = ApiResponse<{ items: Subscription[] }>;
```

### `PATCH /v1/billing/subscriptions/:id`
Permission: `studio.platform.manage`

```ts
type Body = {
  planKey?: string;
  status?: "trialing" | "active" | "past_due" | "cancelled";
  cancelAtPeriodEnd?: boolean;
};
type Response = ApiResponse<Subscription>;
```

## 3.5 Entitlements

### `GET /v1/entitlements/resolve`
Permission: `studio.read`

```ts
type Query = {
  principalType: PrincipalType;
  principalId: ID;
  orgId?: ID;
};

type Entitlement = {
  key: string;
  enabled: boolean;
  limit?: number | null;
  source: "plan" | "override";
};

type Response = ApiResponse<{
  principalType: PrincipalType;
  principalId: ID;
  entitlements: Entitlement[];
}>;
```

### `POST /v1/entitlements/overrides`
Permission: `studio.platform.manage`

```ts
type Body = {
  principalType: PrincipalType;
  principalId: ID;
  key: string;
  mode: "grant" | "deny" | "limit" | "remove";
  value?: boolean | number | null;
  reason?: string;
};
type Response = ApiResponse<{
  overrideId: ID;
  principalType: PrincipalType;
  principalId: ID;
  key: string;
  mode: "grant" | "deny" | "limit" | "remove";
  value?: boolean | number | null;
}>;
```

## 3.6 Invitations

### `GET /v1/invitations`
Permission: `studio.read`

```ts
type Query = PaginationQuery & {
  orgId?: ID;
  status?: "pending" | "accepted" | "revoked" | "expired";
  email?: string;
};

type Invitation = {
  id: ID;
  orgId: ID;
  email: string;
  role: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  expiresAt: ISODateTime;
  createdAt: ISODateTime;
};

type Response = ApiResponse<{ items: Invitation[] }>;
```

### `POST /v1/invitations`
Permission: `studio.platform.manage`

```ts
type Body = {
  orgId: ID;
  email: string;
  role: string;
  expiresInDays?: number; // default 7
};
type Response = ApiResponse<Invitation>;
```

### `POST /v1/invitations/:id/resend`
Permission: `studio.platform.manage`

```ts
type Body = { reason?: string };
type Response = ApiResponse<{ id: ID; resentAt: ISODateTime }>;
```

## 3.7 API Keys

### `GET /v1/api-keys`
Permission: `studio.read`

```ts
type Query = PaginationQuery & {
  principalType?: PrincipalType;
  principalId?: ID;
  status?: "active" | "revoked" | "expired";
};

type ApiKey = {
  id: ID;
  name: string;
  prefix: string; // safe display prefix
  principalType: PrincipalType;
  principalId: ID;
  scopes: string[];
  status: "active" | "revoked" | "expired";
  lastUsedAt?: ISODateTime;
  expiresAt?: ISODateTime;
  createdAt: ISODateTime;
};

type Response = ApiResponse<{ items: ApiKey[] }>;
```

### `POST /v1/api-keys`
Permission: `studio.platform.api_keys.manage`

```ts
type Body = {
  name: string;
  principalType: PrincipalType;
  principalId: ID;
  scopes: string[];
  expiresAt?: ISODateTime;
};

type Response = ApiResponse<{
  apiKey: ApiKey;
  secret: string; // returned once
  warning: "Store this secret now. It cannot be retrieved again.";
}>;
```

### `POST /v1/api-keys/:id/rotate`
Permission: `studio.platform.api_keys.manage`

```ts
type Body = {
  reason?: string;
  rotateImmediately?: boolean; // default true
};

type Response = ApiResponse<{
  apiKey: ApiKey;
  secret: string; // new secret, returned once
}>;
```

### `POST /v1/api-keys/:id/revoke`
Permission: `studio.platform.api_keys.manage`

```ts
type Body = { reason?: string };
type Response = ApiResponse<{ id: ID; status: "revoked"; revokedAt: ISODateTime }>;
```

## 4. Communication APIs

## 4.1 Email Templates

### `GET /v1/email/templates`
Permission: `studio.read`

```ts
type Query = PaginationQuery & {
  q?: string;
  status?: "draft" | "published" | "archived";
  type?: TemplateType;
  locale?: string;
};

type EmailTemplate = {
  id: ID;
  key: string;
  name: string;
  type: TemplateType;
  locale: string;
  status: "draft" | "published" | "archived";
  version: number;
  updatedAt: ISODateTime;
};

type Response = ApiResponse<{ items: EmailTemplate[] }>;
```

### `POST /v1/email/templates`
Permission: `studio.platform.manage`

```ts
type Body = {
  key: string;
  name: string;
  type: TemplateType;
  locale: string;
  subject: string;
  source: string;
  variablesSchema?: Record<string, unknown>;
};
type Response = ApiResponse<EmailTemplate & {
  subject: string;
  source: string;
  variablesSchema?: Record<string, unknown>;
}>;
```

### `PATCH /v1/email/templates/:id`
Permission: `studio.platform.manage`

```ts
type Body = {
  name?: string;
  subject?: string;
  source?: string;
  variablesSchema?: Record<string, unknown>;
  status?: "draft" | "published" | "archived";
};
type Response = ApiResponse<EmailTemplate>;
```

### `POST /v1/email/templates/:id/preview`
Permission: `studio.platform.manage`

```ts
type Body = {
  variables: Record<string, unknown>;
  channel?: "email";
};
type Response = ApiResponse<{
  subject: string;
  html?: string;
  text?: string;
  warnings?: string[];
}>;
```

## 4.2 Email Sends

### `GET /v1/email/sends`
Permission: `studio.read`

```ts
type Query = PaginationQuery & TimeRangeQuery & {
  status?: "queued" | "sent" | "delivered" | "bounced" | "failed";
  templateKey?: string;
  provider?: string;
  recipient?: string;
};

type EmailSend = {
  id: ID;
  templateKey?: string;
  recipient: string;
  status: "queued" | "sent" | "delivered" | "bounced" | "failed";
  provider?: string;
  providerMessageId?: string;
  error?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
};

type Response = ApiResponse<{ items: EmailSend[] }>;
```

## 4.3 Webhooks

### `GET /v1/webhooks/endpoints`
Permission: `studio.read`

```ts
type WebhookEndpoint = {
  id: ID;
  url: string;
  events: string[];
  status: "enabled" | "disabled";
  createdAt: ISODateTime;
};
type Response = ApiResponse<{ items: WebhookEndpoint[] }>;
```

### `POST /v1/webhooks/endpoints`
Permission: `studio.platform.manage`

```ts
type Body = {
  url: string;
  events: string[];
  secret?: string; // optional user-provided, otherwise generated
  enabled?: boolean;
};
type Response = ApiResponse<WebhookEndpoint>;
```

### `GET /v1/webhooks/deliveries`
Permission: `studio.read`

```ts
type Query = PaginationQuery & TimeRangeQuery & {
  endpointId?: ID;
  event?: string;
  status?: "success" | "failed" | "retrying";
};

type WebhookDelivery = {
  id: ID;
  endpointId: ID;
  event: string;
  status: "success" | "failed" | "retrying";
  attempt: number;
  nextRetryAt?: ISODateTime;
  responseStatus?: number;
  createdAt: ISODateTime;
};

type Response = ApiResponse<{ items: WebhookDelivery[] }>;
```

### `POST /v1/webhooks/deliveries/:id/replay`
Permission: `studio.platform.manage`

```ts
type Body = { reason?: string };
type Response = ApiResponse<{ id: ID; replayDeliveryId: ID; status: "queued" }>;
```

## 5. System APIs

## 5.1 `GET /v1/system/health`
Permission: `studio.read`

```ts
type Response = ApiResponse<{
  status: "ok" | "degraded" | "down";
  checks: {
    db: "ok" | "down";
    queue: "ok" | "down";
    cache?: "ok" | "down";
  };
  timestamp: ISODateTime;
}>;
```

## 5.2 `GET /v1/system/metrics`
Permission: `studio.read`

```ts
type Query = TimeRangeQuery & { step?: "1m" | "5m" | "15m" | "1h" };
type Response = ApiResponse<{
  series: {
    key: string;
    points: { ts: ISODateTime; value: number }[];
  }[];
}>;
```

## 5.3 `GET /v1/system/logs`
Permission: `studio.system.admin`

```ts
type Query = PaginationQuery & TimeRangeQuery & {
  level?: "debug" | "info" | "warn" | "error";
  service?: string;
  traceId?: string;
  q?: string;
};

type Response = ApiResponse<{
  items: {
    id: ID;
    ts: ISODateTime;
    level: "debug" | "info" | "warn" | "error";
    message: string;
    traceId?: string;
    context?: Record<string, unknown>;
  }[];
}>;
```

## 5.4 `GET /v1/audit/events`
Permission: `studio.system.admin`

```ts
type Query = PaginationQuery & TimeRangeQuery & {
  actorId?: ID;
  action?: string;
  resourceType?: string;
  resourceId?: ID;
};

type AuditEvent = {
  id: ID;
  ts: ISODateTime;
  actorId?: ID;
  action: string;
  resourceType: string;
  resourceId?: ID;
  metadata?: Record<string, unknown>;
  ip?: string;
};

type Response = ApiResponse<{ items: AuditEvent[] }>;
```

## 6. Error Codes

```ts
type ErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "validation_error"
  | "conflict"
  | "rate_limited"
  | "internal_error";
```

### Validation Error Details

```ts
type ValidationErrorDetails = {
  fields: {
    path: string;
    code: string;
    message: string;
  }[];
};
```

