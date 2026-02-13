# @bunbase/react

Fully-typed React client for Bunbase backends with TanStack Query integration and automatic HTTP field routing.

## Features

- 🎯 **End-to-end type safety** - Generated types from your Bunbase backend with full IntelliSense
- 🚀 **Automatic HTTP field routing** - Fields automatically routed to body, headers, query, cookies, path based on backend schema
- ⚡ **TanStack Query integration** - Optimized data fetching with caching, refetching, and mutations
- 🔌 **Direct API client** - Use without hooks for server-side or non-React code
- 🎨 **tRPC-like DX** - Call actions naturally without manual HTTP plumbing
- 🔄 **Automatic retries** - Built-in retry logic for failed requests
- 🔒 **Interceptors** - Request/response interceptors for auth, logging, etc.
- 📝 **TypeScript-first** - Full IntelliSense support for actions, inputs, and outputs

## Installation

```bash
bun add @bunbase/react @tanstack/react-query
```

## Quick Start

### 1. Generate Types from Backend

First, make sure your Bunbase backend is running, then generate types:

```bash
bunbase typegen:react --url http://localhost:3000
```

This fetches the schema from your Bunbase backend and generates:

- TypeScript types in `.bunbase/api.d.ts`
- Runtime schema object (`bunbaseAPISchema`) for automatic HTTP field routing

### 2. Create Bunbase Client

```tsx
// src/lib/bunbase.ts
import { createBunbaseClient } from '@bunbase/react'
import type { BunbaseAPI } from '../.bunbase/api'
import { bunbaseAPISchema } from '../.bunbase/api'

export const bunbase = createBunbaseClient<BunbaseAPI>({
  baseUrl: 'http://localhost:3000',
  schema: bunbaseAPISchema, // Enables automatic HTTP field routing
})
```

**Important:** Pass the `bunbaseAPISchema` runtime object to enable automatic HTTP field routing. This allows fields to be automatically routed to the correct HTTP locations (body, headers, query, cookies, path parameters) based on your backend action definitions.

### 3. Setup Query Provider

```tsx
// src/App.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { bunbase } from './lib/bunbase'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60000, // 1 minute
      retry: 3,
    },
  },
})

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <YourApp />
    </QueryClientProvider>
  )
}

export default App
```

### 4. Use in Components

```tsx
import { bunbase } from './lib/bunbase'

function TaskList() {
  const { data, isLoading } = bunbase.useQuery('list-tasks', {
    status: 'active',
  })

  const createTask = bunbase.useMutation('create-task')

  if (isLoading) return <div>Loading...</div>

  return (
    <div>
      {data?.tasks.map((task) => (
        <div key={task.id}>{task.title}</div>
      ))}

      <button onClick={() => createTask.mutate({ title: 'New task' })}>
        Add Task
      </button>
    </div>
  )
}
```

## Automatic HTTP Field Routing

The killer feature of `@bunbase/react` is **automatic HTTP field routing**. When you pass the `schema` option, the client understands your backend's HTTP field mappings and routes fields automatically.

### How It Works

Define fields in your backend action:

```typescript
// Backend: src/auth/login.action.ts
import { action, t, triggers, http } from 'bunbase'

export const advancedLogin = action({
  name: 'advanced-login',
  input: t.Object({
    // Regular fields → JSON body
    email: t.String({ format: 'email' }),
    password: t.String(),

    // HTTP field mappings
    apiKey: http.Header(t.String(), 'X-API-Key'),
    remember: http.Query(t.Boolean()),
    deviceId: http.Cookie(t.String()),
  }),
  output: t.Object({
    // Regular fields ← JSON body
    user: t.Object({ id: t.String(), email: t.String() }),
    token: t.String(),

    // Extract from response headers/cookies
    userId: http.Header(t.String(), 'X-User-ID'),
    refreshToken: http.Cookie(t.String(), 'refresh_token', {
      httpOnly: true,
      secure: true,
      maxAge: 7 * 24 * 60 * 60, // 7 days
    }),
  }),
  triggers: [triggers.api('POST', '/auth/login')],
}, async ({ input, ctx }) => {
  // All fields available in input
  const user = await authenticateUser(input.email, input.password)
  const token = generateToken(user.id)

  return {
    user: { id: user.id, email: user.email },
    token,
    userId: user.id,
    refreshToken: generateRefreshToken(user.id),
  }
})
```

Call it naturally from the frontend:

```tsx
// Frontend - just pass all fields!
const { data } = await bunbase.call('advanced-login', {
  email: 'user@example.com',
  password: 'secret',
  apiKey: 'my-api-key',
  remember: true,
  deviceId: 'device-123',
})

// The client automatically:
// ✅ Sends email/password in JSON body
// ✅ Sends apiKey as 'X-API-Key' header
// ✅ Sends remember as '?remember=true' query parameter
// ✅ Sends deviceId as cookie
// ✅ Extracts userId from 'X-User-ID' response header
// ✅ Extracts refreshToken from 'Set-Cookie' header
// ✅ Returns: { user, token, userId, refreshToken }
```

### Path Parameters

Path parameters are also handled automatically:

```typescript
// Backend
export const getTask = action({
  name: 'get-task',
  input: t.Object({
    id: http.Path(t.String()), // Extract from URL path
  }),
  triggers: [triggers.api('GET', '/tasks/:id')],
})

// Frontend
const task = await bunbase.call('get-task', {
  id: 'task-123', // Automatically replaces :id in URL
})
// → GET /tasks/task-123
```

### Query Parameters

Query parameters are automatically appended to the URL:

```typescript
// Backend
export const searchTasks = action({
  name: 'search-tasks',
  input: t.Object({
    q: http.Query(t.String()),
    status: http.Query(t.Optional(t.String())),
    limit: http.Query(t.Number({ default: 20 })),
  }),
  triggers: [triggers.api('GET', '/tasks/search')],
})

// Frontend
const results = await bunbase.call('search-tasks', {
  q: 'urgent',
  status: 'active',
  limit: 50,
})
// → GET /tasks/search?q=urgent&status=active&limit=50
```

### Benefits

- **No manual HTTP plumbing** - No need to manually construct URLs, headers, or query strings
- **Type safety** - TypeScript knows exactly which fields go where
- **tRPC-like experience** - Call backend actions like local functions
- **Single source of truth** - HTTP mappings defined once in backend, used everywhere
- **Reduced boilerplate** - Write less code, focus on business logic

## Usage

### Query Actions (GET)

Use `useQuery` for fetching data:

```tsx
import { bunbase } from './lib/bunbase'

function TaskList() {
  const { data, isLoading, error, refetch } = bunbase.useQuery(
    'list-tasks',
    { status: 'active' },
    {
      refetchInterval: 5000, // Refetch every 5 seconds
      enabled: true,         // Only run when true
      staleTime: 60000,      // Consider data fresh for 1 minute
    }
  )

  if (isLoading) return <div>Loading tasks...</div>
  if (error) return <div>Error: {error.message}</div>

  return (
    <div>
      <button onClick={() => refetch()}>Refresh</button>
      <ul>
        {data?.tasks.map((task) => (
          <li key={task.id}>
            {task.title} - {task.status}
          </li>
        ))}
      </ul>
    </div>
  )
}
```

### Mutation Actions (POST, PATCH, DELETE)

Use `useMutation` for creating, updating, or deleting data:

```tsx
import { bunbase } from './lib/bunbase'
import { useQueryClient } from '@tanstack/react-query'

function CreateTaskForm() {
  const queryClient = useQueryClient()

  const createTask = bunbase.useMutation('create-task', {
    onSuccess: (data) => {
      // Invalidate and refetch tasks list
      queryClient.invalidateQueries({ queryKey: ['list-tasks'] })
      console.log('Task created:', data.id)
    },
    onError: (error) => {
      console.error('Failed to create task:', error.message)
    },
  })

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)

    createTask.mutate({
      title: formData.get('title') as string,
      description: formData.get('description') as string,
      assigneeId: formData.get('assignee') as string,
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      <input name="title" placeholder="Task title" required />
      <textarea name="description" placeholder="Description" />
      <input name="assignee" placeholder="Assignee ID" />

      <button type="submit" disabled={createTask.isPending}>
        {createTask.isPending ? 'Creating...' : 'Create Task'}
      </button>

      {createTask.error && (
        <div className="error">Error: {createTask.error.message}</div>
      )}

      {createTask.isSuccess && (
        <div className="success">Task created successfully!</div>
      )}
    </form>
  )
}
```

### Direct API Calls (Without Hooks)

Use `call()` for imperative API calls outside React components:

```tsx
import { bunbase } from './lib/bunbase'

// In async functions
async function fetchUserTasks(userId: string) {
  const result = await bunbase.call('list-tasks', {
    assigneeId: userId,
    status: 'active',
  })
  return result.tasks
}

// In event handlers
async function handleTaskComplete(taskId: string) {
  try {
    await bunbase.call('update-task', {
      id: taskId,
      status: 'completed',
    })
    console.log('Task completed')
  } catch (error) {
    console.error('Failed to complete task:', error)
  }
}

// In server-side code or utilities
export async function createTasksBatch(tasks: TaskInput[]) {
  const results = await Promise.all(
    tasks.map((task) => bunbase.call('create-task', task))
  )
  return results
}
```

## Advanced Usage

### Optimistic Updates

Immediately update the UI before the server responds:

```tsx
import { bunbase } from './lib/bunbase'
import { useQueryClient } from '@tanstack/react-query'

function TaskItem({ task }) {
  const queryClient = useQueryClient()

  const updateTask = bunbase.useMutation('update-task', {
    onMutate: async (newData) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['get-task', task.id] })

      // Snapshot current value
      const previousTask = queryClient.getQueryData(['get-task', task.id])

      // Optimistically update
      queryClient.setQueryData(['get-task', task.id], (old) => ({
        ...old,
        ...newData,
      }))

      return { previousTask }
    },
    onError: (err, newData, context) => {
      // Rollback on error
      queryClient.setQueryData(
        ['get-task', task.id],
        context?.previousTask
      )
    },
    onSettled: () => {
      // Refetch after error or success
      queryClient.invalidateQueries({ queryKey: ['get-task', task.id] })
    },
  })

  return (
    <div>
      <h3>{task.title}</h3>
      <button onClick={() => updateTask.mutate({ id: task.id, status: 'completed' })}>
        Complete
      </button>
    </div>
  )
}
```

### Authentication & Authorization

#### Automatic Header Management

```tsx
import { createBunbaseClient } from '@bunbase/react'
import type { BunbaseAPI } from './.bunbase/api'
import { bunbaseAPISchema } from './.bunbase/api'

// Set initial auth token
let authToken = localStorage.getItem('auth_token')

export const bunbase = createBunbaseClient<BunbaseAPI>({
  baseUrl: 'http://localhost:3000',
  schema: bunbaseAPISchema,
  headers: {
    Authorization: authToken ? `Bearer ${authToken}` : '',
  },
  onError: (error) => {
    if (error.status === 401) {
      // Token expired, redirect to login
      authToken = null
      localStorage.removeItem('auth_token')
      window.location.href = '/login'
    }
  },
})

// Update token dynamically
export function setAuthToken(token: string) {
  authToken = token
  localStorage.setItem('auth_token', token)
  bunbase.setHeaders({ Authorization: `Bearer ${token}` })
}

export function clearAuthToken() {
  authToken = null
  localStorage.removeItem('auth_token')
  bunbase.setHeaders({ Authorization: '' })
}
```

#### Request Interceptor for Auth

```tsx
export const bunbase = createBunbaseClient<BunbaseAPI>({
  baseUrl: 'http://localhost:3000',
  schema: bunbaseAPISchema,
  beforeRequest: async (action, input, init) => {
    // Fetch fresh token if needed
    const token = await refreshTokenIfNeeded()

    return {
      ...init,
      headers: {
        ...init.headers,
        Authorization: `Bearer ${token}`,
      },
    }
  },
})
```

### Request/Response Interceptors

Intercept and modify requests or responses:

```tsx
export const bunbase = createBunbaseClient<BunbaseAPI>({
  baseUrl: 'http://localhost:3000',
  schema: bunbaseAPISchema,

  // Before request is sent
  beforeRequest: async (action, input, init) => {
    console.log(`[${action}] Request:`, input)

    // Add correlation ID
    return {
      ...init,
      headers: {
        ...init.headers,
        'X-Request-ID': crypto.randomUUID(),
      },
    }
  },

  // After response is received
  afterResponse: async (action, response) => {
    console.log(`[${action}] Response:`, response.status)

    // Log slow requests
    const duration = response.headers.get('X-Duration')
    if (duration && parseInt(duration) > 1000) {
      console.warn(`Slow request: ${action} took ${duration}ms`)
    }

    return response
  },

  // On any error
  onError: (error) => {
    // Send to error tracking service
    if (error.status >= 500) {
      errorTracker.captureException(error)
    }

    // Show toast notification
    toast.error(`${error.action} failed: ${error.message}`)
  },
})
```

### Custom Fetch Implementation

Use a custom fetch implementation (useful for testing or special requirements):

```tsx
import { createBunbaseClient } from '@bunbase/react'
import type { BunbaseAPI } from './.bunbase/api'
import { bunbaseAPISchema } from './.bunbase/api'

// Custom fetch with timeout
const fetchWithTimeout = async (
  url: string,
  init?: RequestInit,
  timeout = 30000
): Promise<Response> => {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    })
    return response
  } finally {
    clearTimeout(timeoutId)
  }
}

export const bunbase = createBunbaseClient<BunbaseAPI>({
  baseUrl: 'http://localhost:3000',
  schema: bunbaseAPISchema,
  fetch: (url, init) => fetchWithTimeout(url, init, 10000), // 10s timeout
})
```

### Conditional Queries

Only run queries when certain conditions are met:

```tsx
function UserProfile({ userId }: { userId: string | null }) {
  const { data, isLoading } = bunbase.useQuery(
    'get-user',
    { id: userId! },
    {
      enabled: !!userId, // Only run when userId is not null
    }
  )

  if (!userId) return <div>Please select a user</div>
  if (isLoading) return <div>Loading...</div>

  return <div>{data?.name}</div>
}
```

### Dependent Queries

Run queries that depend on results from other queries:

```tsx
function TaskDetails({ taskId }: { taskId: string }) {
  // First query
  const { data: task } = bunbase.useQuery('get-task', { id: taskId })

  // Second query depends on first
  const { data: assignee } = bunbase.useQuery(
    'get-user',
    { id: task?.assigneeId! },
    {
      enabled: !!task?.assigneeId, // Only run when assigneeId is available
    }
  )

  return (
    <div>
      <h2>{task?.title}</h2>
      {assignee && <p>Assigned to: {assignee.name}</p>}
    </div>
  )
}
```

### Parallel Queries

Run multiple queries in parallel:

```tsx
function Dashboard() {
  const tasksQuery = bunbase.useQuery('list-tasks', { status: 'active' })
  const statsQuery = bunbase.useQuery('get-stats', {})
  const userQuery = bunbase.useQuery('me', {})

  if (tasksQuery.isLoading || statsQuery.isLoading || userQuery.isLoading) {
    return <div>Loading...</div>
  }

  return (
    <div>
      <h1>Welcome, {userQuery.data?.name}</h1>
      <Stats data={statsQuery.data} />
      <TaskList tasks={tasksQuery.data?.tasks} />
    </div>
  )
}
```

### Polling

Automatically refetch data at intervals:

```tsx
function LiveTaskList() {
  const { data } = bunbase.useQuery(
    'list-tasks',
    { status: 'active' },
    {
      refetchInterval: 5000, // Poll every 5 seconds
      refetchIntervalInBackground: true, // Continue polling when tab is not active
    }
  )

  return <TaskList tasks={data?.tasks} />
}
```

### Manual Query Invalidation

Manually trigger refetches after mutations:

```tsx
import { useQueryClient } from '@tanstack/react-query'

function TaskManager() {
  const queryClient = useQueryClient()

  const deleteTask = bunbase.useMutation('delete-task', {
    onSuccess: () => {
      // Invalidate all queries that start with 'list-tasks'
      queryClient.invalidateQueries({ queryKey: ['list-tasks'] })

      // Or invalidate specific query
      queryClient.invalidateQueries({
        queryKey: ['get-task', deletedTaskId],
      })
    },
  })

  return <div>...</div>
}
```

## Type Safety

All action names, inputs, and outputs are fully typed based on your backend:

```tsx
// ✅ TypeScript knows this action exists
bunbase.useQuery('list-tasks', { status: 'active' })

// ❌ TypeScript error: Unknown action
bunbase.useQuery('invalid-action', {})

// ❌ TypeScript error: Wrong input type
bunbase.useQuery('list-tasks', { invalid: 'field' })

// ✅ Full autocomplete for response data
const { data } = bunbase.useQuery('list-tasks', {})
data?.tasks.forEach((task) => {
  console.log(task.id)    // ✅ TypeScript knows task shape
  console.log(task.title) // ✅ Full IntelliSense
  console.log(task.foo)   // ❌ TypeScript error: Property doesn't exist
})

// ✅ Mutation input is fully typed
const createTask = bunbase.useMutation('create-task')
createTask.mutate({
  title: 'New task',      // ✅ Required field
  description: 'Details', // ✅ Optional field
  invalid: 'field',       // ❌ TypeScript error: Unknown field
})
```

## Error Handling

Bunbase errors include status codes and action context:

```tsx
import { BunbaseError } from '@bunbase/react'

try {
  const result = await bunbase.call('create-task', { title: 'New task' })
} catch (error) {
  if (error instanceof BunbaseError) {
    console.error(`Action ${error.action} failed`)
    console.error(`Status: ${error.status}`)
    console.error(`Message: ${error.message}`)
    console.error(`Details:`, error.details)

    // Handle specific status codes
    switch (error.status) {
      case 401:
        redirectToLogin()
        break
      case 403:
        showForbiddenMessage()
        break
      case 429:
        showRateLimitMessage()
        break
      case 500:
        showServerErrorMessage()
        break
    }
  }
}
```

### Global Error Handler

Set up a global error handler for all API calls:

```tsx
export const bunbase = createBunbaseClient<BunbaseAPI>({
  baseUrl: 'http://localhost:3000',
  schema: bunbaseAPISchema,
  onError: (error) => {
    // Log all errors
    console.error(`[${error.action}] Error:`, error.message)

    // Handle specific errors globally
    if (error.status === 401) {
      window.location.href = '/login'
    } else if (error.status === 429) {
      toast.error('Too many requests. Please slow down.')
    } else if (error.status >= 500) {
      toast.error('Server error. Please try again later.')
    }
  },
})
```

## API Reference

### `createBunbaseClient<API>(options)`

Creates a typed Bunbase client with hooks and methods.

**Type Parameters:**

- `API` - Generated API type from `.bunbase/api.d.ts`

**Options:**

| Option | Type | Required | Description |
| ------ | ---- | -------- | ----------- |
| `baseUrl` | `string` | ✅ | Backend URL (e.g., `http://localhost:3000`) |
| `schema` | `API` | ❌ | Runtime schema for automatic HTTP field routing |
| `headers` | `Record<string, string>` | ❌ | Default headers for all requests |
| `beforeRequest` | `(action, input, init) => RequestInit \| Promise<RequestInit>` | ❌ | Intercept and modify requests before sending |
| `afterResponse` | `(action, response) => Response \| Promise<Response>` | ❌ | Intercept and modify responses after receiving |
| `onError` | `(error: BunbaseError) => void` | ❌ | Global error handler |
| `fetch` | `typeof fetch` | ❌ | Custom fetch implementation |

**Returns:**

Client object with:

- `useQuery` - React hook for query actions
- `useMutation` - React hook for mutation actions
- `call` - Direct API call method
- `setHeaders` - Update default headers
- `getHeaders` - Get current headers
- `setBaseUrl` - Update base URL
- `getBaseUrl` - Get current base URL

**Example:**

```tsx
import { createBunbaseClient } from '@bunbase/react'
import type { BunbaseAPI } from './.bunbase/api'
import { bunbaseAPISchema } from './.bunbase/api'

export const bunbase = createBunbaseClient<BunbaseAPI>({
  baseUrl: import.meta.env.VITE_API_URL,
  schema: bunbaseAPISchema,
  headers: {
    'X-Client-Version': '1.0.0',
  },
})
```

### `bunbase.useQuery<Action>(action, input?, options?)`

React hook for fetching data (GET actions).

**Type Parameters:**

- `Action` - Action name (auto-completed from your API)

**Parameters:**

- `action` - Action name (typed string)
- `input` - Action input (typed based on action, optional)
- `options` - TanStack Query options ([see docs](https://tanstack.com/query/latest/docs/framework/react/reference/useQuery))

**Returns:** [TanStack Query result](https://tanstack.com/query/latest/docs/framework/react/reference/useQuery)

**Example:**

```tsx
const { data, isLoading, error, refetch } = bunbase.useQuery(
  'list-tasks',
  { status: 'active', limit: 50 },
  {
    refetchInterval: 5000,
    staleTime: 60000,
    enabled: true,
  }
)
```

### `bunbase.useMutation<Action>(action, options?)`

React hook for creating, updating, or deleting data (POST, PATCH, DELETE actions).

**Type Parameters:**

- `Action` - Action name (auto-completed from your API)

**Parameters:**

- `action` - Action name (typed string)
- `options` - TanStack Query mutation options ([see docs](https://tanstack.com/query/latest/docs/framework/react/reference/useMutation))

**Returns:** [TanStack Query mutation result](https://tanstack.com/query/latest/docs/framework/react/reference/useMutation)

**Example:**

```tsx
const createTask = bunbase.useMutation('create-task', {
  onSuccess: (data) => {
    console.log('Created:', data.id)
    queryClient.invalidateQueries({ queryKey: ['list-tasks'] })
  },
  onError: (error) => {
    console.error('Failed:', error.message)
  },
})

// Use in component
<button onClick={() => createTask.mutate({ title: 'New task' })}>
  Create
</button>
```

### `bunbase.call<Action>(action, input?)`

Direct API call without React hooks. Useful for imperative calls, server-side code, or utilities.

**Type Parameters:**

- `Action` - Action name (auto-completed from your API)

**Parameters:**

- `action` - Action name (typed string)
- `input` - Action input (typed based on action, optional)

**Returns:** `Promise<Output>` - Typed promise with action output

**Example:**

```tsx
// In async function
const tasks = await bunbase.call('list-tasks', { status: 'active' })

// In event handler
async function handleDelete(id: string) {
  await bunbase.call('delete-task', { id })
  console.log('Deleted')
}

// In utility function
export async function exportTasks() {
  const { tasks } = await bunbase.call('list-tasks', {})
  return convertToCSV(tasks)
}
```

### Utility Methods

```tsx
// Update headers (e.g., after login)
bunbase.setHeaders({ Authorization: `Bearer ${token}` })

// Get current headers
const headers = bunbase.getHeaders()

// Update base URL
bunbase.setBaseUrl('https://api.production.com')

// Get current base URL
const url = bunbase.getBaseUrl()
```

## Best Practices

### 1. Colocation

Keep the client instance in a shared location:

```text
src/
  lib/
    bunbase.ts      # Client instance
  .bunbase/
    api.d.ts        # Generated types
```

### 2. Environment Variables

Use environment variables for API URLs:

```tsx
// .env.development
VITE_API_URL=http://localhost:3000

// .env.production
VITE_API_URL=https://api.yourdomain.com

// src/lib/bunbase.ts
export const bunbase = createBunbaseClient<BunbaseAPI>({
  baseUrl: import.meta.env.VITE_API_URL,
  schema: bunbaseAPISchema,
})
```

### 3. Query Key Factories

Create factories for consistent query keys:

```tsx
export const queryKeys = {
  tasks: {
    all: ['tasks'] as const,
    lists: () => [...queryKeys.tasks.all, 'list'] as const,
    list: (filters: string) => [...queryKeys.tasks.lists(), { filters }] as const,
    details: () => [...queryKeys.tasks.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.tasks.details(), id] as const,
  },
}

// Use in components
const { data } = bunbase.useQuery('list-tasks', filters, {
  queryKey: queryKeys.tasks.list(JSON.stringify(filters)),
})
```

### 4. Centralized Error Handling

Create a centralized error handler:

```tsx
// src/lib/error-handler.ts
import type { BunbaseError } from '@bunbase/react'
import { toast } from './toast'

export function handleBunbaseError(error: BunbaseError) {
  switch (error.status) {
    case 400:
      toast.error(`Invalid request: ${error.message}`)
      break
    case 401:
      toast.error('Please log in to continue')
      window.location.href = '/login'
      break
    case 403:
      toast.error('You do not have permission to perform this action')
      break
    case 404:
      toast.error('Resource not found')
      break
    case 429:
      toast.error('Too many requests. Please slow down.')
      break
    case 500:
    case 502:
    case 503:
      toast.error('Server error. Please try again later.')
      break
    default:
      toast.error(`An error occurred: ${error.message}`)
  }
}

// Use in client
export const bunbase = createBunbaseClient<BunbaseAPI>({
  baseUrl: import.meta.env.VITE_API_URL,
  schema: bunbaseAPISchema,
  onError: handleBunbaseError,
})
```

### 5. Type Regeneration

Add a script to regenerate types easily:

```json
{
  "scripts": {
    "types": "bunbase typegen:react --url http://localhost:3000"
  }
}
```

Run after backend changes:

```bash
bun run types
```

## Testing

### Mocking with MSW (Mock Service Worker)

```tsx
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

const server = setupServer(
  http.post('http://localhost:3000/api/create-task', () => {
    return HttpResponse.json({
      data: {
        id: 'test-task-id',
        title: 'Test Task',
        createdAt: new Date().toISOString(),
      },
    })
  })
)

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

test('creates a task', async () => {
  const result = await bunbase.call('create-task', {
    title: 'Test Task',
  })
  expect(result.id).toBe('test-task-id')
})
```

### Testing with React Testing Library

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TaskList } from './TaskList'

test('displays tasks', async () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  render(
    <QueryClientProvider client={queryClient}>
      <TaskList />
    </QueryClientProvider>
  )

  await waitFor(() => {
    expect(screen.getByText('Test Task')).toBeInTheDocument()
  })
})
```

## Troubleshooting

### Types Not Updating

If your types aren't reflecting backend changes:

1. Regenerate types: `bunbase typegen:react --url http://localhost:3000`
2. Restart TypeScript server in your IDE
3. Check `.bunbase/api.d.ts` was updated

### CORS Errors

If you're getting CORS errors:

1. Check your backend CORS configuration in `bunbase.config.ts`:

   ```typescript
   export default defineConfig({
     cors: {
       origin: ['http://localhost:5173'], // Your frontend URL
       credentials: true,
     },
   })
   ```

2. Ensure you're using the correct `baseUrl` in your client

### HTTP Field Routing Not Working

If fields aren't being routed correctly:

1. Ensure you're passing `schema: bunbaseAPISchema` to `createBunbaseClient`
2. Regenerate types to get the latest schema
3. Check that the backend action has HTTP field mappings (e.g., `http.Header()`)

### Authentication Issues

If you're having auth problems:

1. Check that cookies are being sent with `credentials: 'include'` (enabled by default)
2. Verify CORS allows credentials
3. Use browser DevTools Network tab to inspect request/response headers

## Related Packages

- **[bunbase](../bunbase)** - Main Bunbase backend framework
- **[@tanstack/react-query](https://tanstack.com/query/latest)** - Data fetching and caching

## Examples

See the [Basic Example](../../examples/basic) for a complete working application using `@bunbase/react`.

## License

MIT

---

Built with ❤️ for the Bunbase ecosystem
