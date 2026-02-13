# @bunbase/react

Fully-typed React client for Bunbase backends with TanStack Query integration.

## Features

- 🎯 **End-to-end type safety** - Generated types from your Bunbase backend
- 🚀 **Automatic HTTP field routing** - Fields automatically routed to body, headers, query, cookies, path based on backend schema
- ⚡ **TanStack Query integration** - Optimized data fetching with caching, refetching, and mutations
- 🔌 **Direct API client** - Use without hooks for server-side or non-React code
- 🔄 **Automatic retries** - Built-in retry logic for failed requests
- 📝 **TypeScript-first** - Full IntelliSense support

## Installation

```bash
bun add @bunbase/react @tanstack/react-query
```

## Setup

### 1. Generate Types from Backend

In your React project root:

```bash
bunbase typegen:react --url http://localhost:3000
```

This fetches the schema from your Bunbase backend and generates:

- TypeScript types in `.bunbase/api.d.ts`
- Runtime schema object for automatic HTTP field routing

### 2. Create Bunbase Client

```tsx
// src/api/client.ts
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
import { bunbase } from './api/client'

const queryClient = new QueryClient()

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <YourApp />
    </QueryClientProvider>
  )
}
```

## Automatic HTTP Field Routing

When you pass the `schema` option to `createBunbaseClient`, the client automatically routes fields to the correct HTTP locations based on your backend action definitions:

```tsx
// Backend action with HTTP field mappings
export const advancedLogin = action({
  name: 'advanced-login',
  input: t.Object({
    email: t.String({ format: 'email' }),      // → body
    password: t.String(),                       // → body
    apiKey: http.Header(t.String(), 'X-API-Key'), // → header
    remember: http.Query(t.Boolean()),          // → query param
    deviceId: http.Cookie(t.String()),          // → cookie
  }),
  output: t.Object({
    user: t.Object({ id: t.String(), email: t.String() }), // → body
    token: t.String(),                                       // → body
    userId: http.Header(t.String(), 'X-User-ID'),           // → response header
    refreshToken: http.Cookie(t.String(), 'refresh_token', {
      httpOnly: true,
      secure: true,
      maxAge: 7 * 24 * 60 * 60
    }), // → Set-Cookie header
  }),
  triggers: [triggers.api('POST', '/auth/advanced-login')],
}, async ({ input }) => {
  // Implementation
})

// Frontend - just pass all fields naturally!
const { data } = await bunbase.call('advanced-login', {
  email: 'user@example.com',
  password: 'secret',
  apiKey: 'my-key',
  remember: true,
  deviceId: 'device123'
})

// Client automatically:
// - Sends email/password in JSON body
// - Sends apiKey as X-API-Key header
// - Sends remember as ?remember=true query parameter
// - Sends deviceId as cookie
// - Extracts userId from response X-User-ID header
// - Extracts refreshToken from Set-Cookie header
// - Returns: { user, token, userId, refreshToken }
```

This deep integration with Bunbase eliminates manual HTTP plumbing and provides a tRPC-like developer experience with full type safety.

## Usage

### Using Hooks (Recommended)

#### Query Actions (GET)

```tsx
import { bunbase } from './api/client'

function TaskList() {
  const { data, isLoading, error } = bunbase.useQuery('list-tasks', {
    status: 'active',
  })

  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>

  return (
    <ul>
      {data?.tasks.map((task) => (
        <li key={task.id}>{task.title}</li>
      ))}
    </ul>
  )
}
```

#### Mutation Actions (POST, PATCH, DELETE)

```tsx
import { bunbase } from './api/client'

function CreateTaskForm() {
  const createTask = bunbase.useMutation('create-task', {
    onSuccess: () => {
      // Invalidate and refetch tasks
      queryClient.invalidateQueries({ queryKey: ['list-tasks'] })
    },
  })

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)

    createTask.mutate({
      title: formData.get('title') as string,
      description: formData.get('description') as string,
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      <input name="title" required />
      <textarea name="description" />
      <button disabled={createTask.isPending}>
        {createTask.isPending ? 'Creating...' : 'Create Task'}
      </button>
      {createTask.error && <div>Error: {createTask.error.message}</div>}
    </form>
  )
}
```

### Direct API Calls (Without Hooks)

```tsx
import { bunbase } from './api/client'

// In async functions or server-side code
async function fetchTasks() {
  const result = await bunbase.call('list-tasks', { status: 'active' })
  return result.tasks
}

async function createTask(title: string) {
  const result = await bunbase.call('create-task', { title })
  return result
}
```

## Advanced Usage

### Query Options

```tsx
const { data } = bunbase.useQuery('get-task',
  { id: taskId },
  {
    enabled: !!taskId, // Only run when taskId exists
    refetchInterval: 5000, // Refetch every 5 seconds
    staleTime: 60000, // Consider data fresh for 1 minute
  }
)
```

### Optimistic Updates

```tsx
const updateTask = bunbase.useMutation('update-task', {
  onMutate: async (newData) => {
    // Cancel outgoing refetches
    await queryClient.cancelQueries({ queryKey: ['get-task', newData.id] })

    // Snapshot previous value
    const previousTask = queryClient.getQueryData(['get-task', newData.id])

    // Optimistically update
    queryClient.setQueryData(['get-task', newData.id], newData)

    return { previousTask }
  },
  onError: (err, newData, context) => {
    // Rollback on error
    queryClient.setQueryData(
      ['get-task', newData.id],
      context?.previousTask
    )
  },
  onSettled: (data, error, variables) => {
    // Refetch after error or success
    queryClient.invalidateQueries({ queryKey: ['get-task', variables.id] })
  },
})
```

### Custom Headers & Authentication

```tsx
export const bunbase = createBunbaseClient<BunbaseAPI>({
  baseUrl: 'http://localhost:3000',
  headers: {
    'Authorization': `Bearer ${getAuthToken()}`,
  },
  onError: (error) => {
    if (error.status === 401) {
      // Handle unauthorized
      redirectToLogin()
    }
  },
})
```

### Request/Response Interceptors

```tsx
export const bunbase = createBunbaseClient<BunbaseAPI>({
  baseUrl: 'http://localhost:3000',
  beforeRequest: async (action, input, init) => {
    // Add auth token
    const token = await getAuthToken()
    return {
      ...init,
      headers: {
        ...init.headers,
        'Authorization': `Bearer ${token}`,
      },
    }
  },
  afterResponse: async (action, response) => {
    // Log responses
    console.log(`[${action}]`, response.status)
    return response
  },
})
```

## Type Safety

All action names, inputs, and outputs are fully typed:

```tsx
// ✅ TypeScript knows this action exists
bunbase.useQuery('list-tasks', { status: 'active' })

// ❌ TypeScript error: unknown action
bunbase.useQuery('invalid-action', {})

// ❌ TypeScript error: wrong input type
bunbase.useQuery('list-tasks', { invalid: 'field' })

// ✅ Full autocomplete for response data
const { data } = bunbase.useQuery('list-tasks', {})
data?.tasks.forEach(task => {
  console.log(task.title) // ✅ TypeScript knows task shape
})
```

## API Reference

### `createBunbaseClient<API>(options)`

Creates a typed Bunbase client.

**Options:**
- `baseUrl` (required): Backend URL
- `schema`: Runtime schema object for automatic HTTP field routing (import `bunbaseAPISchema` from generated types)
- `headers`: Default headers for all requests
- `beforeRequest`: Intercept requests before sending
- `afterResponse`: Intercept responses after receiving
- `onError`: Global error handler
- `fetch`: Custom fetch implementation (defaults to global fetch)

**Returns:** Client with `useQuery`, `useMutation`, `call`, and helper methods

### `bunbase.useQuery<Action>(action, input?, options?)`

React hook for query actions (GET).

**Parameters:**
- `action`: Action name (typed)
- `input`: Action input (typed, optional)
- `options`: TanStack Query options

**Returns:** TanStack Query result

### `bunbase.useMutation<Action>(action, options?)`

React hook for mutation actions (POST, PATCH, DELETE).

**Parameters:**
- `action`: Action name (typed)
- `options`: TanStack Query mutation options

**Returns:** TanStack Query mutation result

### `bunbase.call<Action>(action, input?)`

Direct API call without hooks.

**Parameters:**
- `action`: Action name (typed)
- `input`: Action input (typed, optional)

**Returns:** Promise with typed response

## License

MIT
