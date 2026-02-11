import { action, guards, module, t, triggers } from 'bunbase'

const add = action(
	{
		name: 'add',
		input: t.Object({ a: t.Number(), b: t.Number() }),
		output: t.Object({ result: t.Number() }),
		triggers: [triggers.api('POST', '/add')],
		guards: [guards.authenticated()],
	},
	async (input) => {
		return { result: input.a + input.b }
	},
)

export default module({
	name: 'math',
	apiPrefix: '/math',
	actions: [add],
})
