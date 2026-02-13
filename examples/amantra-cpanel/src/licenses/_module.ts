import { module } from 'bunbase'
import { downloadLicense } from './download-license.action.ts'
import { generateLicense } from './generate-license.action.ts'
import { getLicense } from './get-license.action.ts'
import { listLicenses } from './list-licenses.action.ts'
import { reactivateLicense } from './reactivate-license.action.ts'
import { revokeLicense } from './revoke-license.action.ts'

/**
 * Licenses module - Manage organization licenses
 */
export default module({
	name: 'licenses',
	description: 'License management',
	apiPrefix: '/licenses',
	actions: [
		generateLicense,
		listLicenses,
		getLicense,
		reactivateLicense,
		revokeLicense,
		downloadLicense,
	],
})
