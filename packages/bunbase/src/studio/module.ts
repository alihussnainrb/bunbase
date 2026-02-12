import { module } from '../core/module.ts'
import type { ModuleDefinition } from '../core/types.ts'
import { getActionDetails } from './actions/get-action-details'
import { getActions } from './actions/get-actions'
import { getRunDetails } from './actions/get-run-details'
import { getRuns } from './actions/get-runs'

export const studioModule: ModuleDefinition = module({
	name: 'studio',
	actions: [getActions, getActionDetails, getRuns, getRunDetails],
})
