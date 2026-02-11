import { default as t } from 'typebox'
import { action } from '../../core/action.ts'
import type { ActionDefinition } from '../../core/types.ts'
import { triggers } from '../../triggers/index.ts'

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
  const limit = input.limit ?? 20
  const offset = input.offset ?? 0
  const status = input.status ?? 'all'
  const actionFilter = input.action ?? ''

  // Try to fetch from DB
  if (ctx.db) {
    try {
      let query = ctx.db.from('action_runs' as any)
        .orderBy('started_at' as any, 'DESC')

      if (status !== 'all') {
        query = query.eq('status' as any, status)
      }

      if (actionFilter) {
        query = query.ilike('action_name' as any, `%${actionFilter}%`)
      }

      const allRuns = await query.exec()
      const sliced = allRuns.slice(offset, offset + limit)

      const runs = sliced.map((r: any) => ({
        id: r.id,
        action: r.action_name,
        status: r.status,
        duration: r.duration_ms,
        timestamp: new Date(r.started_at).toISOString(),
        input: r.input ? JSON.parse(r.input) : null,
        output: r.output ? JSON.parse(r.output) : null,
        error: r.error,
      }))

      return {
        runs,
        total: allRuns.length,
        hasMore: offset + limit < allRuns.length,
      }
    } catch {
      // DB not available, return empty
    }
  }

  return {
    runs: [],
    total: 0,
    hasMore: false,
  }
})
