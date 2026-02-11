import type { ModuleDefinition } from '../core'
import type { ViewDefinition } from './view'

export class ViewRegistry {
  private views = new Map<string, ViewDefinition>()

  register(view: ViewDefinition): void {
    this.views.set(view.name, view)
  }

  registerModule(mod: ModuleDefinition): void {
    for (const view of mod.config.views ?? []) {
      this.register(view)
    }
  }

  get(name: string): ViewDefinition | undefined {
    return this.views.get(name)
  }

  getAll(): ViewDefinition[] {
    return Array.from(this.views.values())
  }

  findByPath(path: string): ViewDefinition | undefined {
    return this.getAll().find(view => {
      // Simple path matching - could use more sophisticated routing
      return path === view.path || path.startsWith(view.path.replace(/:\w+/g, ''))
    })
  }
}
