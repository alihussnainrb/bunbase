import {
	isWrappedGuards,
	type WrappedGuards,
} from './guards/execution.ts'
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
	/** Registry key (namespaced for module actions: "module.action", bare for standalone) */
	registryKey: string
}

/**
 * Registry lifecycle states for managing mutations and hot reload.
 */
export type RegistryState = 'loading' | 'locked' | 'reloading'

/**
 * Central registry of all actions and modules.
 * The loader populates this, and the server/scheduler reads from it.
 */
export class ActionRegistry {
	private readonly actions = new Map<string, RegisteredAction>()
	private state: RegistryState = 'loading'
	private snapshot: Map<string, RegisteredAction> | null = null

	/**
	 * Register a standalone action (not in a module).
	 */
	registerAction(definition: ActionDefinition): void {
		if (this.state === 'locked') {
			throw new Error(
				'Registry is locked. Cannot register actions in production mode.',
			)
		}

		const name = definition.config.name
		if (this.actions.has(name)) {
			throw new Error(`Action "${name}" is already registered`)
		}

		// Unwrap guards if needed
		const unwrapGuards = (
			g: GuardFn[] | WrappedGuards | undefined,
		): GuardFn[] => {
			if (!g) return []
			return isWrappedGuards(g) ? g.guards : g
		}

		this.actions.set(name, {
			definition,
			moduleName: null,
			guards: unwrapGuards(definition.config.guards),
			triggers: [...(definition.config.triggers ?? [])],
			registryKey: name, // Same as name for standalone actions
		})
	}

	/**
	 * Register all actions from a module, applying module-level config.
	 */
	registerModule(mod: ModuleDefinition): void {
		if (this.state === 'locked') {
			throw new Error(
				'Registry is locked. Cannot register modules in production mode.',
			)
		}

		const {
			name: moduleName,
			apiPrefix,
			guards: moduleGuards,
			actions,
		} = mod.config

		for (const definition of actions) {
			// Auto-namespace module actions: moduleName.actionName
			const actionName = `${moduleName}.${definition.config.name}`
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

			// Unwrap guards if needed before merging
			const unwrapGuards = (
				g: GuardFn[] | WrappedGuards | undefined,
			): GuardFn[] => {
				if (!g) return []
				return isWrappedGuards(g) ? g.guards : g
			}

			// Module guards run first, then action guards
			const guards: GuardFn[] = [
				...unwrapGuards(moduleGuards),
				...unwrapGuards(definition.config.guards),
			]

			this.actions.set(actionName, {
				definition,
				moduleName,
				guards,
				triggers,
				registryKey: actionName, // Store the namespaced key
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

	/** Clear all registered actions (used for hot reload) */
	clear(): void {
		if (this.state === 'locked') {
			throw new Error(
				'Registry is locked. Cannot clear actions in production mode.',
			)
		}
		this.actions.clear()
	}

	/**
	 * Lock the registry to prevent further mutations.
	 * Used in production to prevent accidental modifications after startup.
	 */
	lock(): void {
		if (this.state === 'locked') {
			return // Already locked
		}
		this.state = 'locked'
	}

	/**
	 * Begin a reload operation by taking a snapshot of current state.
	 * Used in dev mode for safe hot reload with rollback support.
	 */
	beginReload(): void {
		if (this.state === 'locked') {
			throw new Error('Cannot reload in production mode (registry is locked)')
		}

		// Take snapshot of current registry
		this.snapshot = new Map(this.actions)
		this.state = 'reloading'

		// Clear actions for fresh reload
		this.actions.clear()
	}

	/**
	 * Commit a successful reload, discarding the snapshot.
	 */
	commitReload(): void {
		if (this.state !== 'reloading') {
			throw new Error('No reload in progress')
		}

		// Discard snapshot
		this.snapshot = null
		this.state = 'loading'
	}

	/**
	 * Rollback a failed reload, restoring from snapshot.
	 */
	rollbackReload(): void {
		if (this.state !== 'reloading') {
			throw new Error('No reload in progress')
		}

		if (!this.snapshot) {
			throw new Error('No snapshot available for rollback')
		}

		// Restore from snapshot
		this.actions.clear()
		for (const [key, action] of this.snapshot) {
			this.actions.set(key, action)
		}

		// Clean up
		this.snapshot = null
		this.state = 'loading'
	}

	/**
	 * Get current registry state.
	 */
	getState(): RegistryState {
		return this.state
	}

	/**
	 * Check if registry is locked.
	 */
	isLocked(): boolean {
		return this.state === 'locked'
	}
}
