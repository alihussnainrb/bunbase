import { action, t, triggers, type ActionDefinition } from '../../'

// Get all runs with filtering
export const getRuns: ActionDefinition = action({
  name: 'studio.getRuns',
  input: t.Object({
    limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
    offset: t.Optional(t.Number({ minimum: 0 })),
    status: t.Optional(t.Union([t.Literal('success'), t.Literal('error'), t.Literal('all')])),
    action: t.Optional(t.String()),
  }),
  output: t.Object({
    runs: t.Array(t.Any()),
    total: t.Number(),
    hasMore: t.Boolean(),
  }),
  triggers: [triggers.api('GET', '/_studio/api/runs')],
}, async (input, ctx) => {
  // Mock data - in real implementation, fetch from database
  const runs = [
    {
      id: '1',
      action: 'user.create',
      status: 'success',
      duration: 125,
      timestamp: new Date(Date.now() - 300000).toISOString(),
      input: { name: 'John Doe', email: 'john@example.com' },
      output: { id: '123', name: 'John Doe', email: 'john@example.com' },
    },
    {
      id: '2',
      action: 'user.update',
      status: 'success',
      duration: 95,
      timestamp: new Date(Date.now() - 600000).toISOString(),
      input: { id: '123', name: 'John Smith' },
      output: { id: '123', name: 'John Smith', email: 'john@example.com' },
    },
    {
      id: '3',
      action: 'payment.process',
      status: 'error',
      duration: 340,
      timestamp: new Date(Date.now() - 900000).toISOString(),
      input: { amount: 100, currency: 'USD' },
      error: 'Insufficient funds',
    },
  ]

  const limit = input.limit ?? 20
  const offset = input.offset ?? 0
  const status = input.status ?? 'all'
  const action = input.action ?? ''

  const filteredRuns = runs.filter(run => {
    if (status !== 'all' && run.status !== status) return false
    if (action && !run.action.toLowerCase().includes(action.toLowerCase())) return false
    return true
  })

  return {
    runs: filteredRuns.slice(offset, offset + limit),
    total: filteredRuns.length,
    hasMore: offset + limit < filteredRuns.length,
  }
})

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
