import { module } from 'bunbase'
import { addVersion } from './add-version.action.ts'
import { getVersion } from './get-version.action.ts'
import { listVersions } from './list-versions.action.ts'
import { updateVersion } from './update-version.action.ts'

/**
 * Version Registry module - Track AMANTRA product versions
 */
export default module({
	name: 'versions',
	description: 'AMANTRA product version registry',
	apiPrefix: '/versions',
	actions: [addVersion, listVersions, getVersion, updateVersion],
})
