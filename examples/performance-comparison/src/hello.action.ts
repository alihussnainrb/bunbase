import { action, t, triggers } from 'bunbase'

/**
 * Simple hello world endpoint for Bunbase performance testing
 */
export default action(
	{
		name: 'hello',
		description: 'Simple hello world endpoint',
		input: t.Object({}),
		output: t.Object({
			message: t.String(),
		}),
		triggers: [triggers.api('GET', '/hello')],
	},
	async () => {
		return { message: 'Hello World' }
	},
)
