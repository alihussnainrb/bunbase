import type { TSchema, Static } from './typebox'
import type { ActionGuard } from './types'

export interface ViewDefinition<
  P extends TSchema = TSchema,
  Q extends TSchema = TSchema
> {
  name: string
  path: string
  paramsSchema?: P
  querySchema?: Q
  guards?: ActionGuard[]
  render: (input: {
    params: P extends TSchema ? Static<P> : Record<string, string>
    query: Q extends TSchema ? Static<Q> : Record<string, string>
  }, ctx: ActionContext) => Promise<JSX.Element> | JSX.Element
}

export function view<
  P extends TSchema = TSchema,
  Q extends TSchema = TSchema
>(def: ViewDefinition<P, Q>): ViewDefinition<P, Q> {
  return def
}

// JSX to HTML compiler (simple implementation)
export function renderJSX(element: JSX.Element): string {
  if (typeof element === 'string') return element
  if (typeof element === 'number') return element.toString()
  if (element === null || element === undefined) return ''

  const { type, props } = element as any
  const children = props?.children || []

  if (typeof type === 'string') {
    // HTML element
    const attrs = Object.entries(props || {})
      .filter(([key]) => key !== 'children')
      .map(([key, value]) => {
        // Handle HTMX attributes (hx-*)
        if (key.startsWith('hx-')) {
          return `${key}="${String(value).replace(/"/g, '&quot;')}"`
        }
        // Handle data attributes
        if (key.startsWith('data-')) {
          return `${key}="${String(value).replace(/"/g, '&quot;')}"`
        }
        // Handle className
        if (key === 'className') {
          return `class="${String(value).replace(/"/g, '&quot;')}"`
        }
        // Handle boolean attributes
        if (typeof value === 'boolean') {
          return value ? key : ''
        }
        // Handle other attributes
        return `${key}="${String(value).replace(/"/g, '&quot;')}"`
      })
      .filter(Boolean)
      .join(' ')

    const childrenHtml = Array.isArray(children)
      ? children.map(renderJSX).join('')
      : renderJSX(children)

    // Self-closing tags
    if (['br', 'img', 'input', 'meta', 'link', 'hr'].includes(type)) {
      return `<${type}${attrs ? ' ' + attrs : ''} />`
    }

    return `<${type}${attrs ? ' ' + attrs : ''}>${childrenHtml}</${type}>`
  }

  // Function component
  if (typeof type === 'function') {
    return renderJSX(type(props))
  }

  return ''
}

// Layout wrapper for consistent HTML structure
export function html(title: string, content: JSX.Element): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <script src="https://unpkg.com/htmx.org@1.9.10"></script>
  <script src="https://unpkg.com/htmx.org/dist/ext/ws.js"></script>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-50 min-h-screen">
  ${renderJSX(content)}
</body>
</html>`
}
