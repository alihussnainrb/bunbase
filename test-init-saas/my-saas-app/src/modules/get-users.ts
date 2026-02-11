import { action, t, triggers } from 'bunbase'

export const getUsers = action({
  name: 'users.getAll',
  description: 'Get all users',
  input: t.Object({
    limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
  }),
  output: t.Object({
    users: t.Array(t.Object({
      id: t.String(),
      name: t.String(),
    })),
  }),
  triggers: [triggers.api('GET', '/')],
}, async (input, ctx) => {
  // Example using ctx.db (when database is configured):
  // const users = await ctx.db.from('users').limit(input.limit ?? 10).exec()
  return {
    users: [
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ],
  }
})
