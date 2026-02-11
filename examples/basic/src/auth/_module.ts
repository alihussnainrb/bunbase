import { module } from 'bunbase'
import { login } from './login.ts'
import { me } from './me.ts'

/**
 * Auth module — groups authentication actions under /auth prefix.
 * No module-level guards since login must be public.
 */
export default module({
	name: 'auth',
	description: 'Authentication endpoints',
	apiPrefix: '/auth',
	actions: [login, me],
})
