import { action, t, triggers, type ActionDefinition } from '../../'


// Get run details by ID
export const getRunDetails: ActionDefinition = action({
  name: 'studio.getRunDetails',
  input: t.Object({
    id: t.String(),
  }),
  output: t.Object({
    id: t.String(),
    action: t.String(),
    status: t.String(),
    duration: t.Number(),
    timestamp: t.String(),
    input: t.Any(),
    output: t.Any(),
    error: t.Optional(t.String()),
  }),
  triggers: [triggers.api('GET', '/_studio/api/runs/:id')],
}, async (input, ctx) => {
  // Mock implementation
  const run = {
    id: input.id,
    action: 'user.create',
    status: 'success',
    duration: 125,
    timestamp: new Date(Date.now() - 300000).toISOString(),
    input: { name: 'John Doe', email: 'john@example.com' },
    output: { id: '123', name: 'John Doe', email: 'john@example.com' },
  }

  return run
})
