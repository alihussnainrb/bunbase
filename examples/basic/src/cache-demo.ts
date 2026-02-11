import { action, t, triggers } from 'bunbase'

/**
 * Cache demo actions showcasing ctx.kv usage.
 * Demonstrates: Key-value store, TTL, prefix listing.
 */

export const setCache = action(
	{
		name: 'setCache',
		description: 'Store a value in the KV cache with optional TTL',
		input: t.Object({
			key: t.String(),
			value: t.Any(),
			ttl: t.Optional(t.Number({ description: 'TTL in seconds' })),
		}),
		output: t.Object({
			success: t.Boolean(),
			key: t.String(),
		}),
		triggers: [triggers.api('POST', '/cache')],
	},
	async (input, ctx) => {
		ctx.logger.info('Setting cache', { key: input.key })

		await ctx.kv.set(input.key, input.value, { ttl: input.ttl })

		return { success: true, key: input.key }
	},
)

export const getCache = action(
	{
		name: 'getCache',
		description: 'Retrieve a value from the KV cache',
		input: t.Object({
			key: t.String(),
		}),
		output: t.Object({
			key: t.String(),
			value: t.Any(),
			found: t.Boolean(),
		}),
		triggers: [triggers.api('GET', '/cache/:key')],
	},
	async (input, ctx) => {
		ctx.logger.info('Getting cache', { key: input.key })

		const value = await ctx.kv.get(input.key)

		return {
			key: input.key,
			value,
			found: value !== null,
		}
	},
)

export const listCacheKeys = action(
	{
		name: 'listCacheKeys',
		description: 'List all cache keys with an optional prefix',
		input: t.Object({
			prefix: t.Optional(t.String()),
		}),
		output: t.Object({
			keys: t.Array(t.String()),
			count: t.Number(),
		}),
		triggers: [triggers.api('GET', '/cache')],
	},
	async (input, ctx) => {
		ctx.logger.info('Listing cache keys', { prefix: input.prefix })

		const keys = await ctx.kv.list(input.prefix)

		return {
			keys,
			count: keys.length,
		}
	},
)
