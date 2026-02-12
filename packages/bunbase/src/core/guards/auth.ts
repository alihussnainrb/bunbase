import type { ActionContext } from '../types.ts'
import { GuardError, type GuardFn } from './types.ts'

export const authGuards = {
	/**
	 * Ensure the request is within an organization context.
	 * Looks for orgId in header (x-org-id) or query params.
	 * Uses ctx.iam.orgs and ctx.iam.subscriptions for all lookups.
	 *
	 * Populates on ctx.auth:
	 * - orgId, role (from membership)
	 * - _orgPlan (plan key string)
	 * - _orgFeatures (string[] of plan features)
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

			// Fetch org via IAM
			const org = await ctx.iam.orgs.getById(orgId)
			if (!org) {
				throw new GuardError('Organization not found', 404)
			}

			// Check membership
			const membership = await ctx.iam.orgs.getMembership(
				orgId,
				ctx.auth.userId,
			)
			if (!membership) {
				throw new GuardError('Not a member of this organization', 403)
			}

			// Get plan from subscription
			let planKey = 'free'
			try {
				const subscription = await ctx.iam.subscriptions.get(orgId)
				if (
					subscription &&
					(subscription.status === 'active' ||
						subscription.status === 'trialing')
				) {
					planKey = subscription.planKey
				}
			} catch {
				// Subscription query failed, fall back to free
			}

			// Get plan features from DB
			let features: string[] = []
			try {
				features = await ctx.iam.subscriptions.getPlanFeatures(planKey)
			} catch {
				// Plan features query failed
			}

			// Update auth context with org data
			ctx.auth.orgId = orgId
			ctx.auth.role = membership.role
			// Store plan/features for downstream guards (hasFeature, trialActiveOrPaid)
			ctx.auth._orgPlan = planKey
			ctx.auth._orgFeatures = features
		}
	},

	/**
	 * Ensure the organization has a specific feature enabled.
	 * Must be used after inOrg().
	 */
	hasFeature: (feature: string): GuardFn => {
		return (ctx: ActionContext) => {
			const features = ctx.auth._orgFeatures as string[] | undefined
			if (!features) {
				throw new GuardError(
					'Organization context required (use inOrg guard)',
					500,
				)
			}
			if (!features.includes(feature)) {
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
			const plan = ctx.auth._orgPlan as string | undefined
			if (!plan) {
				throw new GuardError('Organization context required', 500)
			}
			if (plan === 'free') {
				throw new GuardError('Paid plan required', 403)
			}
		}
	},
}
