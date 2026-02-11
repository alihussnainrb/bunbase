import { action, t, triggers, type ActionDefinition } from '../../'

// Get all actions with their statistics
export const getActions: ActionDefinition = action({
  name: 'studio.getActions',
  input: t.Object({
    limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
    offset: t.Optional(t.Number({ minimum: 0 })),
  }),
  output: t.Object({
    actions: t.Array(t.Object({
      id: t.String(),
      name: t.String(),
      description: t.String(),
      method: t.String(),
      path: t.String(),
      triggers: t.Number(),
      runs: t.Number(),
      successRate: t.Number(),
      avgDuration: t.Number(),
      createdAt: t.String(),
    })),
    total: t.Number(),
    hasMore: t.Boolean(),
  }),
  triggers: [triggers.api('GET', '/_studio/api/actions')],
}, async (input, ctx) => {
  // Mock data - in real implementation, fetch from registry
  const actions = [
    {
      id: '1',
      name: 'user.create',
      description: 'Create a new user account',
      method: 'POST',
      path: '/api/users',
      triggers: 1,
      runs: 342,
      successRate: 98.5,
      avgDuration: 125,
      createdAt: '2024-01-15T10:30:00Z',
    },
    {
      id: '2',
      name: 'user.update',
      description: 'Update user profile information',
      method: 'PUT',
      path: '/api/users/:id',
      triggers: 2,
      runs: 189,
      successRate: 96.8,
      avgDuration: 95,
      createdAt: '2024-01-14T15:45:00Z',
    },
    {
      id: '3',
      name: 'payment.process',
      description: 'Process payment transaction',
      method: 'POST',
      path: '/api/payments',
      triggers: 1,
      runs: 567,
      successRate: 94.2,
      avgDuration: 340,
      createdAt: '2024-01-13T09:20:00Z',
    },
  ]

  const limit = input.limit ?? 20
  const offset = input.offset ?? 0

  return {
    actions: actions.slice(offset, offset + limit),
    total: actions.length,
    hasMore: offset + limit < actions.length,
  }
})
