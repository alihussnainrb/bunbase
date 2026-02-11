import { action, t, triggers } from 'bunbase'

export const hello = action({
  name: 'hello',
  description: 'A simple hello world action',
  input: t.Object({
    name: t.Optional(t.String()),
  }),
  output: t.Object({
    message: t.String(),
  }),
  triggers: [triggers.api('GET', '/hello')],
}, async (input) => {
  return {
    message: `Hello, ${input.name ?? 'World'}!`,
  }
})
