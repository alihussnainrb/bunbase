# Bunbase Basic Example

A task management API demonstrating bunbase core features:

- **Actions** with typed input/output (TypeBox validation)
- **Modules** grouping related actions with shared guards
- **API triggers** (GET, POST, PUT, DELETE with path parameters)
- **Event triggers** (task.created → onTaskCreated)
- **Guards** (authenticated endpoint protection)
- **Session management** (cookie-based auth)
- **OpenAPI** auto-generated docs
- **Studio** development dashboard
- **Structured logging** with trace IDs

## Setup

```bash
bun install
```

## Run

```bash
bun run dev
# or directly:
bunbase dev
```

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /health | No | Health check + task stats |
| POST | /auth/login | No | Login (returns session cookie) |
| GET | /auth/me | Yes | Current user profile |
| POST | /tasks/ | Yes | Create a task |
| GET | /tasks/ | Yes | List tasks (filter: ?status=pending) |
| GET | /tasks/:id | Yes | Get a single task |
| PUT | /tasks/:id | Yes | Update a task |
| DELETE | /tasks/:id | Yes | Delete a task |
| GET | /api/docs | No | OpenAPI documentation |
| GET | /api/openapi.json | No | OpenAPI JSON spec |

## Quick Test

```bash
# Health check (public)
curl http://localhost:3000/health

# Login (get session cookie)
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@example.com","password":"password123"}' \
  -c cookies.txt

# Create a task (with auth cookie)
curl -X POST http://localhost:3000/tasks/ \
  -H "Content-Type: application/json" \
  -d '{"title":"My first task","description":"Testing bunbase"}' \
  -b cookies.txt

# List tasks
curl http://localhost:3000/tasks/ -b cookies.txt

# Complete a task (replace TASK_ID)
curl -X PUT http://localhost:3000/tasks/TASK_ID \
  -H "Content-Type: application/json" \
  -d '{"status":"completed"}' \
  -b cookies.txt
```

## Project Structure

```
bunbase.config.ts            # Server configuration
src/
├── health.ts                # Standalone action (no module)
├── on-task-created.ts       # Standalone event-triggered action
├── lib/
│   └── store.ts             # In-memory data store
├── auth/
│   ├── _module.ts           # Auth module (apiPrefix: /auth)
│   ├── login.ts             # Login action
│   └── me.ts                # Get current user action
└── tasks/
    ├── _module.ts           # Tasks module (apiPrefix: /tasks, auth guard)
    ├── create-task.ts       # POST /tasks/
    ├── list-tasks.ts        # GET /tasks/
    ├── get-task.ts          # GET /tasks/:id
    ├── update-task.ts       # PUT /tasks/:id
    └── delete-task.ts       # DELETE /tasks/:id
```

The `bunbase dev` command reads `bunbase.config.ts`, scans `src/` for `_module.ts` files
and standalone actions, then starts the server automatically. No manual wiring needed.

## Features Demonstrated

### Action Definition
Every action has typed input/output schemas, triggers, and optional guards:
```typescript
export const createTaskAction = action({
  name: 'createTask',
  input: t.Object({ title: t.String({ minLength: 1 }) }),
  output: t.Object({ id: t.String() }),
  triggers: [triggers.api('POST', '/')],
}, async (input, ctx) => { ... })
```

### Module Grouping
Modules apply shared configuration to all their actions:
```typescript
export default module({
  name: 'tasks',
  apiPrefix: '/tasks',
  guards: [guards.authenticated()],
  actions: [createTask, listTasks, ...],
})
```

### Event-Driven Actions
Actions can emit events that trigger other actions:
```typescript
// In create-task.ts handler:
ctx.event.emit('task.created', { taskId, title })

// on-task-created.ts listens for this:
triggers: [triggers.event('task.created')]
```
