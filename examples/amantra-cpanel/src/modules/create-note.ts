import { action, t, triggers } from 'bunbase'

export const createNote = action({
  name: 'users.createNote',
  description: 'Store a note in the KV store',
  input: t.Object({
    key: t.String(),
    content: t.String(),
    ttl: t.Optional(t.Number({ description: 'TTL in seconds' })),
  }),
  output: t.Object({
    success: t.Boolean(),
    key: t.String(),
  }),
  triggers: [triggers.api('POST', '/notes')],
}, async (input, ctx) => {
  await ctx.kv.set(`note:${input.key}`, { content: input.content }, {
    ttl: input.ttl,
  })
  return { success: true, key: input.key }
})
