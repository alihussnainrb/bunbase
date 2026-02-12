import { OrganizationService } from '../../saas/organizations.ts'
import { defaultPlanService } from '../../saas/plans.ts'
import { defaultRoleService } from '../../saas/roles.ts'
import { SubscriptionService } from '../../saas/subscriptions.ts'
import type { ActionContext } from '../types.ts'
import { GuardError, type GuardFn } from './types.ts'

export const saasGuards = {
	/**
	 * Ensure the request is within an organization context.
	 * Looks for orgId in header (x-org-id) or query params.
	 */
	inOrg: (): GuardFn => {
		return async (ctx: ActionContext) => {
			if (!ctx.auth.userId) {
				throw new GuardError('Unauthorized', 401)
			}

			let orgId: string | undefined

			// 1. Try header
			if (ctx.request) {
				orgId = ctx.request.headers.get('x-org-id') || undefined
			}

			// 2. Try URL search params
			if (!orgId && ctx.request) {
				const url = new URL(ctx.request.url)
				orgId = url.searchParams.get('orgId') || undefined
			}

			if (!orgId) {
				throw new GuardError('Organization ID required', 400)
			}

			const orgService = new OrganizationService(ctx.db)
			const org = await orgService.getById(orgId)

			if (!org) {
				throw new GuardError('Organization not found', 404)
			}

			// Check membership
			const membership = await orgService.getMembership(orgId, ctx.auth.userId)
			if (!membership) {
				throw new GuardError('Not a member of this organization', 403)
			}

			// Get plan from subscription if DB is available
			let planKey = 'free'
			if (ctx.db) {
				try {
					const subService = new SubscriptionService(ctx.db)
					const subscription = await subService.getSubscription(orgId)
					if (
						subscription &&
						(subscription.status === 'active' ||
							subscription.status === 'trialing')
					) {
						planKey = subscription.planKey
					}
				} catch {
					// DB query failed, fall back to free
				}
			}

			const plan = defaultPlanService.getPlan(planKey)

			if (!plan) {
				throw new GuardError('Plan configuration error', 500)
			}

			// Get actual member count
			let memberCount = 1
			try {
				memberCount = await orgService.getMemberCount(orgId)
			} catch {
				// Fall back to 1
			}

			// Populate ctx.org
			ctx.org = {
				id: org.id,
				name: org.name,
				slug: org.slug,
				plan: plan.key,
				features: plan.features,
				memberCount,
			}

			// Update auth context with org role
			ctx.auth.orgId = org.id
			ctx.auth.role = membership.role

			// Populate permissions based on role
			const roleDef = defaultRoleService.getRole(membership.role)
			if (roleDef) {
				ctx.auth.permissions = roleDef.permissions
			}
		}
	},

	/**
	 * Ensure the organization has a specific feature enabled.
	 * Must be used after inOrg().
	 */
	hasFeature: (feature: string): GuardFn => {
		return (ctx: ActionContext) => {
			if (!ctx.org) {
				throw new GuardError(
					'Organization context required (use inOrg guard)',
					500,
				)
			}
			if (!ctx.org.features.includes(feature)) {
				throw new GuardError(`Upgrade required for feature: ${feature}`, 403)
			}
		}
	},

	/**
	 * Ensure the organization has an active trial or paid plan.
	 * Must be used after inOrg().
	 */
	trialActiveOrPaid: (): GuardFn => {
		return (ctx: ActionContext) => {
			if (!ctx.org) {
				throw new GuardError('Organization context required', 500)
			}
			if (ctx.org.plan === 'free') {
				throw new GuardError('Paid plan required', 403)
			}
		}
	},
}
