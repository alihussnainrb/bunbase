import { module } from 'bunbase'
import { createOrganization } from './create-organization.action.ts'
import { deleteOrganization } from './delete-organization.action.ts'
import { getOrganization } from './get-organization.action.ts'
import { listOrganizations } from './list-organizations.action.ts'
import { notifyAdmin } from './notify-admin.action.ts'
import { updateOrganization } from './update-organization.action.ts'
import { uploadLogo } from './upload-logo.action.ts'

/**
 * Organizations module - Manage client organizations
 */
export default module({
	name: 'organizations',
	description: 'Client organization management',
	apiPrefix: '/organizations',
	actions: [
		createOrganization,
		listOrganizations,
		getOrganization,
		updateOrganization,
		deleteOrganization,
		uploadLogo,
		notifyAdmin,
	],
})
