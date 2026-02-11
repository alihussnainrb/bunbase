import { module, type ModuleDefinition } from '../index'
import { getActions } from './actions/get-actions'
import { getActionDetails } from './actions/get-action-details'
import { getRuns } from './actions/get-runs'
import { getRunDetails } from './actions/get-run-details'

export const studioModule: ModuleDefinition = module({
  name: 'studio',
  actions: [
    getActions,
    getActionDetails,
    getRuns,
    getRunDetails,
  ],
})