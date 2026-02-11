import { action, t, triggers, type ActionDefinition } from '../../'

// Get action details by ID
export const getActionDetails: ActionDefinition = action({
  name: 'studio.getActionDetails',
  input: t.Object({
    id: t.String(),
  }),
  output: t.Object({
    id: t.String(),
    name: t.String(),
    description: t.String(),
    method: t.String(),
    path: t.String(),
    triggers: t.Array(t.Any()),
    runs: t.Array(t.Any()),
    stats: t.Object({
      totalRuns: t.Number(),
      successRate: t.Number(),
      avgDuration: t.Number(),
      lastRun: t.String(),
    }),
  }),
  triggers: [triggers.api('GET', '/_studio/api/actions/:id')],
}, async (input, ctx) => {
  // Mock implementation - fetch from registry
  const action = {
    id: input.id,
    name: 'user.create',
    description: 'Create a new user account',
    method: 'POST',
    path: '/api/users',
    triggers: [
      { type: 'api', config: { method: 'POST', path: '/api/users' } },
    ],
    runs: [
      {
        id: '1',
        status: 'success',
        duration: 125,
        timestamp: new Date(Date.now() - 300000).toISOString(),
        input: { name: 'John Doe', email: 'john@example.com' },
        output: { id: '123', name: 'John Doe', email: 'john@example.com' },
      },
      {
        id: '2',
        status: 'error',
        duration: 340,
        timestamp: new Date(Date.now() - 600000).toISOString(),
        input: { name: 'Jane Doe', email: 'jane@example.com' },
        error: 'Email already exists',
      },
    ],
    stats: {
      totalRuns: 342,
      successRate: 98.5,
      avgDuration: 125,
      lastRun: new Date(Date.now() - 300000).toISOString(),
    },
  }

  return action
})
