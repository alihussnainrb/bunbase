import { module } from 'bunbase'
import { createFramework } from './create-framework.action.ts'
import { listFrameworks } from './list-frameworks.action.ts'
import { getFramework } from './get-framework.action.ts'
import { updateFramework } from './update-framework.action.ts'
import { deleteFramework } from './delete-framework.action.ts'
import { addVersion } from './add-version.action.ts'
import { listVersions } from './list-versions.action.ts'
import { uploadVersionContent } from './upload-version-content.action.ts'

/**
 * Frameworks module - Manage compliance frameworks and versions
 */
export default module({
	name: 'frameworks',
	description: 'Compliance framework management',
	apiPrefix: '/frameworks',
	actions: [
		createFramework,
		listFrameworks,
		getFramework,
		updateFramework,
		deleteFramework,
		addVersion,
		listVersions,
		uploadVersionContent,
	],
})
