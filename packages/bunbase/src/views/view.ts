import type { Static, TSchema } from "typebox"
import type { ActionContext, GuardFn } from "../core"
import { renderToString } from 'preact-render-to-string'
import type { VNode } from 'preact'

export interface ViewDefinition<
  P extends TSchema = TSchema,
  Q extends TSchema = TSchema
> {
  readonly name: string
  readonly path: string
  readonly paramsSchema?: P
  readonly querySchema?: Q
  readonly guards?: GuardFn[]
  readonly render: (input: {
    params: Static<P>
    query: Static<Q>
    url: URL
  }, ctx: ActionContext) => Promise<VNode> | VNode
}

export function view<
  P extends TSchema = TSchema,
  Q extends TSchema = TSchema
>(def: ViewDefinition<P, Q>): ViewDefinition<P, Q> {
  return def
}

// JSX to HTML compiler using Preact
export function renderJSX(element: VNode): string {
  return renderToString(element)
}

// Layout wrapper for consistent HTML structure
export function html(
  title: string, 
  content: string, 
  viewsConfig?: { tailwind?: boolean }
): string {
  const tailwindEnabled = viewsConfig?.tailwind !== false // default true
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  ${tailwindEnabled ? '<script src="https://cdn.tailwindcss.com"></script>' : ''}
</head>
<body class="bg-gray-50 min-h-screen">
  ${content}
</body>
</html>`
}
