# HTTP Metadata Guide

Bunbase actions can declaratively control HTTP response details by including an optional `_http` field in their return value.

## Overview

Instead of manually manipulating `ctx.response.headers` and `ctx.response.setCookie()`, you can return HTTP metadata directly from your action handler:

```typescript
export const createUser = action({...}, async (input, ctx) => {
  const user = await ctx.db.from('users').insert(input)

  return {
    // Your regular output (validated against schema)
    id: user.id,
    email: user.email,

    // Optional HTTP metadata (not validated, stripped before schema check)
    _http: {
      status: 201,
      headers: { Location: `/users/${user.id}` },
      cookies: [{ name: 'user_id', value: user.id, maxAge: 3600 }]
    }
  }
})
```

## Features

### Custom Status Codes

```typescript
return {
  userId: user.id,
  _http: {
    status: 201  // Created
  }
}
```

Common status codes:
- `200` - OK (default)
- `201` - Created
- `204` - No Content
- `301` - Moved Permanently
- `302` - Found (redirect)
- `304` - Not Modified
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `429` - Too Many Requests
- `500` - Internal Server Error

### Custom Headers

```typescript
return {
  content: fileData,
  _http: {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="report.pdf"',
      'Cache-Control': 'public, max-age=3600',
      'X-Custom-Header': 'value'
    }
  }
}
```

Common use cases:
- **File downloads**: `Content-Type`, `Content-Disposition`
- **Caching**: `Cache-Control`, `ETag`, `Last-Modified`
- **CORS**: `Access-Control-Allow-Origin`, `Access-Control-Allow-Methods`
- **Rate limiting**: `X-RateLimit-Limit`, `X-RateLimit-Remaining`
- **Redirects**: `Location`

### Cookies

```typescript
return {
  success: true,
  _http: {
    cookies: [
      {
        name: 'session_token',
        value: 'abc123',
        httpOnly: true,      // Prevent JS access (security)
        secure: true,        // HTTPS only (security)
        sameSite: 'strict',  // CSRF protection
        path: '/',
        domain: '.example.com',
        maxAge: 604800,      // 7 days in seconds
        expires: new Date('2024-12-31')
      }
    ]
  }
}
```

Cookie options:
- `name` (required): Cookie name
- `value` (required): Cookie value
- `httpOnly`: Prevent JavaScript access (security)
- `secure`: Send only over HTTPS
- `sameSite`: `'strict'`, `'lax'`, or `'none'` (CSRF protection)
- `path`: URL path where cookie is valid
- `domain`: Domain where cookie is valid
- `maxAge`: Lifetime in seconds
- `expires`: Expiration date

## Examples

### 1. Create Resource (201 Created)

```typescript
export const createArticle = action({
  name: 'articles.create',
  input: t.Object({ title: t.String(), body: t.String() }),
  output: t.Object({ id: t.String(), title: t.String() }),
  triggers: [triggers.api('POST', '/articles')]
}, async (input, ctx) => {
  const article = await ctx.db.from('articles').insert(input)

  return {
    id: article.id,
    title: article.title,
    _http: {
      status: 201,
      headers: {
        Location: `/articles/${article.id}`
      }
    }
  }
})
```

### 2. Delete Resource (204 No Content)

```typescript
export const deleteArticle = action({
  name: 'articles.delete',
  input: t.Object({ id: t.String() }),
  output: t.Object({ deleted: t.Boolean() }),
  triggers: [triggers.api('DELETE', '/articles/:id')]
}, async (input, ctx) => {
  await ctx.db.from('articles').eq('id', input.id).delete()

  return {
    deleted: true,
    _http: {
      status: 204  // No Content
    }
  }
})
```

### 3. Redirect (302 Found)

```typescript
export const redirect = action({
  name: 'urls.redirect',
  input: t.Object({ shortCode: t.String() }),
  output: t.Object({ url: t.String() }),
  triggers: [triggers.api('GET', '/r/:shortCode')]
}, async (input, ctx) => {
  const link = await ctx.db
    .from('shortened_urls')
    .eq('short_code', input.shortCode)
    .single()

  return {
    url: link.original_url,
    _http: {
      status: 302,
      headers: {
        Location: link.original_url
      }
    }
  }
})
```

### 4. File Download

```typescript
export const downloadPDF = action({
  name: 'files.download',
  input: t.Object({ fileId: t.String() }),
  output: t.Object({ content: t.String(), filename: t.String() }),
  triggers: [triggers.api('GET', '/files/:fileId')]
}, async (input, ctx) => {
  const file = await ctx.storage.get(`pdfs/${input.fileId}`)
  const filename = `report-${input.fileId}.pdf`

  return {
    content: file.toString('base64'),
    filename,
    _http: {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    }
  }
})
```

### 5. Set Authentication Cookie

```typescript
export const login = action({
  name: 'auth.login',
  input: t.Object({ email: t.String(), password: t.String() }),
  output: t.Object({ userId: t.String(), token: t.String() }),
  triggers: [triggers.api('POST', '/auth/login')]
}, async (input, ctx) => {
  // Authenticate user...
  const token = generateToken(user.id)

  return {
    userId: user.id,
    token,
    _http: {
      cookies: [
        {
          name: 'auth_token',
          value: token,
          httpOnly: true,     // Can't be accessed by JS
          secure: true,       // HTTPS only
          sameSite: 'strict', // CSRF protection
          maxAge: 604800,     // 7 days
          path: '/'
        }
      ]
    }
  }
})
```

### 6. Caching Headers

```typescript
export const getStaticContent = action({
  name: 'content.static',
  input: t.Object({ id: t.String() }),
  output: t.Object({ title: t.String(), body: t.String() }),
  triggers: [triggers.api('GET', '/content/:id')]
}, async (input, ctx) => {
  const content = await ctx.db
    .from('static_content')
    .eq('id', input.id)
    .single()

  return {
    title: content.title,
    body: content.body,
    _http: {
      headers: {
        'Cache-Control': 'public, max-age=3600, immutable',
        'ETag': `"${content.version}"`,
        'Last-Modified': new Date(content.updated_at).toUTCString()
      }
    }
  }
})
```

### 7. Rate Limit Headers

```typescript
export const apiEndpoint = action({
  name: 'api.data',
  input: t.Object({}),
  output: t.Object({ data: t.Array(t.String()) }),
  triggers: [triggers.api('GET', '/api/data')],
  guards: [guards.rateLimit({ limit: 100, windowMs: 60000 })]
}, async (input, ctx) => {
  const data = await ctx.db.from('data').select('value').exec()

  return {
    data: data.map(row => row.value),
    _http: {
      headers: {
        'X-RateLimit-Limit': '100',
        'X-RateLimit-Remaining': '95',
        'X-RateLimit-Reset': new Date(Date.now() + 60000).toISOString()
      }
    }
  }
})
```

### 8. CORS Headers

```typescript
export const publicAPI = action({
  name: 'public.endpoint',
  input: t.Object({}),
  output: t.Object({ message: t.String() }),
  triggers: [triggers.api('GET', '/public/data')]
}, async (input, ctx) => {
  return {
    message: 'Public data',
    _http: {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400'
      }
    }
  }
})
```

## How It Works

1. **Action Handler Returns Data + `_http`**:
   ```typescript
   return {
     userId: '123',
     _http: { status: 201, headers: {...}, cookies: [...] }
   }
   ```

2. **Executor Extracts Metadata**:
   - Strips `_http` field before schema validation
   - Returns clean data + metadata separately

3. **Server Applies Metadata**:
   - Sets custom status code
   - Applies custom headers
   - Sets cookies
   - Returns JSON response

## TypeScript Support

The `_http` field is typed:

```typescript
import type { HttpMetadata, ActionOutput } from 'bunbase'

// Your action output
type MyOutput = {
  userId: string
  email: string
}

// With HTTP metadata
const result: ActionOutput<MyOutput> = {
  userId: '123',
  email: 'user@example.com',
  _http: {  // Fully typed!
    status: 201,
    headers: { 'Location': '/users/123' },
    cookies: [{ name: 'id', value: '123', maxAge: 3600 }]
  }
}
```

## Best Practices

### 1. Use Semantic Status Codes

```typescript
// ✅ Good - meaningful status
return { id: user.id, _http: { status: 201 } }  // Created

// ❌ Bad - always 200
return { id: user.id }
```

### 2. Include Location Header for Created Resources

```typescript
// ✅ Good - helps clients navigate
return {
  id: article.id,
  _http: {
    status: 201,
    headers: { Location: `/articles/${article.id}` }
  }
}
```

### 3. Secure Cookies Properly

```typescript
// ✅ Good - secure session cookie
_http: {
  cookies: [{
    name: 'session',
    value: token,
    httpOnly: true,   // Prevent XSS
    secure: true,     // HTTPS only
    sameSite: 'strict' // Prevent CSRF
  }]
}

// ❌ Bad - insecure cookie
_http: {
  cookies: [{
    name: 'session',
    value: token
    // Missing security flags!
  }]
}
```

### 4. Use Caching Wisely

```typescript
// ✅ Good - static content cached
_http: {
  headers: {
    'Cache-Control': 'public, max-age=3600, immutable'
  }
}

// ❌ Bad - dynamic content cached
_http: {
  headers: {
    'Cache-Control': 'public, max-age=3600'  // User-specific data!
  }
}
```

### 5. Don't Overuse

```typescript
// ✅ Good - only when needed
return {
  data: result,
  _http: { status: 201 }  // Meaningful difference
}

// ❌ Bad - unnecessary
return {
  data: result,
  _http: { status: 200 }  // Default anyway!
}
```

## Comparison: Old vs New

### Before (_http metadata)

```typescript
export const createUser = action({...}, async (input, ctx) => {
  const user = await ctx.db.from('users').insert(input)

  // Manual response manipulation
  ctx.response?.headers.set('Location', `/users/${user.id}`)

  // But can't set status code! Had to throw error or use workaround

  return { id: user.id, email: user.email }
})
```

### After (_http metadata)

```typescript
export const createUser = action({...}, async (input, ctx) => {
  const user = await ctx.db.from('users').insert(input)

  // Declarative, all in return value
  return {
    id: user.id,
    email: user.email,
    _http: {
      status: 201,
      headers: { Location: `/users/${user.id}` }
    }
  }
})
```

## Summary

- ✅ **Declarative**: Control HTTP response from return value
- ✅ **Type-safe**: Full TypeScript support
- ✅ **Flexible**: Status, headers, cookies all supported
- ✅ **Clean**: `_http` stripped before schema validation
- ✅ **Optional**: Works alongside existing `ctx.response` API

Use `_http` metadata for cleaner, more declarative action handlers!
