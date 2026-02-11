import type {
	ActionDefinition,
	GuardFn,
	ModuleDefinition,
	TriggerConfig,
} from './types.ts'

export interface RegisteredAction {
	/** The action definition (config + handler) */
	definition: ActionDefinition
	/** Module this action belongs to (null for standalone) */
	moduleName: string | null
	/** Combined guards: module guards + action guards */
	guards: GuardFn[]
	/** All triggers with module apiPrefix applied */
	triggers: TriggerConfig[]
}

/**
 * Central registry of all actions and modules.
 * The loader populates this, and the server/scheduler reads from it.
 */
export class ActionRegistry {
	private readonly actions = new Map<string, RegisteredAction>()

	/**
	 * Register a standalone action (not in a module).
	 */
	registerAction(definition: ActionDefinition): void {
		const name = definition.config.name
		if (this.actions.has(name)) {
			throw new Error(`Action "${name}" is already registered`)
		}

		this.actions.set(name, {
			definition,
			moduleName: null,
			guards: [...(definition.config.guards ?? [])],
			triggers: [...(definition.config.triggers ?? [])],
		})
	}

	/**
	 * Register all actions from a module, applying module-level config.
	 */
	registerModule(mod: ModuleDefinition): void {
		const {
			name: moduleName,
			apiPrefix,
			guards: moduleGuards,
			actions,
		} = mod.config

		for (const definition of actions) {
			const actionName = definition.config.name
			if (this.actions.has(actionName)) {
				throw new Error(
					`Action "${actionName}" is already registered (module: ${moduleName})`,
				)
			}

			// Merge triggers — apply apiPrefix to API triggers
			const triggers: TriggerConfig[] = (definition.config.triggers ?? []).map(
				(trigger) => {
					if (trigger.type === 'api' && apiPrefix) {
						return {
							...trigger,
							path: `${apiPrefix}${trigger.path}`,
						}
					}
					if (trigger.type === 'webhook' && apiPrefix) {
						return {
							...trigger,
							path: `${apiPrefix}${trigger.path}`,
						}
					}
					return trigger
				},
			)

			// Module guards run first, then action guards
			const guards: GuardFn[] = [
				...(moduleGuards ?? []),
				...(definition.config.guards ?? []),
			]

			this.actions.set(actionName, {
				definition,
				moduleName,
				guards,
				triggers,
			})
		}
	}

	/** Get a registered action by name */
	get(name: string): RegisteredAction | undefined {
		return this.actions.get(name)
	}

	/** Get all registered actions */
	getAll(): RegisteredAction[] {
		return [...this.actions.values()]
	}

	/** Get count of registered actions */
	get size(): number {
		return this.actions.size
	}
}
