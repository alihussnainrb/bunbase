import { module } from 'bunbase'
import { login } from './login.action.ts'
import { me } from './me.action.ts'

/**
 * Auth module - Super admin authentication
 */
export default module({
	name: 'auth',
	description: 'Super admin authentication',
	apiPrefix: '/auth',
	actions: [login, me],
})
