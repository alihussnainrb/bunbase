import { Glob } from 'bun'
import type { ActionRegistry } from '../core/registry.ts'
import type { ActionDefinition, ModuleDefinition } from '../core/types.ts'
import type { Logger } from '../logger/index.ts'

/**
 * Auto-discovers modules (`_module.ts`) and standalone actions from a directory.
 *
 * Scan order:
 *   1. Find all `_module.ts` files → register as modules
 *   2. Find remaining `.ts` files that default-export an action → register standalone
 */
export async function loadActions(
    dir: string,
    registry: ActionRegistry,
    logger: Logger,
): Promise<void> {
    const session = logger.session('Loading actions')
    const resolvedDir = await Bun.resolve(dir, process.cwd()).catch(() => dir)

    // 1. Discover and register modules
    const moduleGlob = new Glob('**/_module.ts')
    const moduleFiles: string[] = []

    console.log(`[Loader] Scanning for modules in ${resolvedDir}`)

    for await (const path of moduleGlob.scan({
        cwd: resolvedDir,
        absolute: true,
    })) {
        console.log(`[Loader] Found module file: ${path}`)
        moduleFiles.push(path)
    }

    for (const filePath of moduleFiles) {
        try {
            const mod = await import(filePath)
            const moduleExport: ModuleDefinition | undefined =
                mod.default ?? mod.module

            if (moduleExport?.config?.actions) {
                registry.registerModule(moduleExport)
                session.success(
                    `Module: ${moduleExport.config.name}`,
                    `${moduleExport.config.actions.length} actions`,
                )
            }
        } catch (err) {
            session.error(
                `Failed to load module: ${filePath}`,
                err instanceof Error ? err.message : String(err),
            )
        }
    }

    // 2. Discover standalone action files (skip _module.ts and files in module dirs)
    const moduleDirs = moduleFiles.map((f) => f.replace(/[\\/]_module\.ts$/, ''))

    const actionGlob = new Glob('**/*.ts')

    for await (const path of actionGlob.scan({
        cwd: resolvedDir,
        absolute: true,
    })) {
        // Skip module files
        if (path.endsWith('_module.ts')) continue

        // Skip files inside module directories (already registered via module)
        const isInModule = moduleDirs.some((dir) => path.startsWith(dir))
        if (isInModule) continue

        try {
            const mod = await import(path)
            const actionExport: ActionDefinition | undefined =
                mod.default ?? mod.action

            if (actionExport?.config?.name) {
                // if (actionExport?.config?.name && actionExport.handler) {
                registry.registerAction(actionExport)
                session.success(`Action: ${actionExport.config.name}`)
            }
        } catch (err) {
            session.error(
                `Failed to load action: ${path}`,
                err instanceof Error ? err.message : String(err),
            )
        }
    }

    session.end(`${registry.size} actions registered`)
}
