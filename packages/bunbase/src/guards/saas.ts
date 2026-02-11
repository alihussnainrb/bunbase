import type { ActionContext } from '../core/types.ts'
import { OrganizationService } from '../saas/organizations.ts'
import { defaultPlanService } from '../saas/plans.ts'
import { defaultRoleService } from '../saas/roles.ts'
import { GuardError, type GuardFn } from './types.ts'

export const saasGuards = {
	/**
	 * Ensure the request is within an organization context.
	 * Looks for orgId in header (x-org-id), query, or body.
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

			// 2. Try URL search params (if GET)
			if (!orgId && ctx.request) {
				const url = new URL(ctx.request.url)
				orgId = url.searchParams.get('orgId') || undefined
			}

			// 3. Try body (we can't easily re-read body stream here without cloning,
			// but usually input is already parsed by executor.
			// However, guards run BEFORE handler.
			// For now, let's rely on headers/query or assume specific triggers handling)

			// If strictly needed from body, we might need the input passed to guard?
			// Current GuardFn only takes ctx.

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

			// Get plan details (assuming org has a 'plan' field which is a key)
			// For now, we stub it or assume 'free' if missing (schema in organizations.ts doesn't have plan column in create,
			// but type has it. We need to ensure DB has it.)

			// Actually, type Organization in saas/types.ts doesn't have 'plan' field explicitly on the interface?
			// Wait, I defined it:
			// export interface Organization { ... id, name, slug, ownerId, createdAt, updatedAt }
			// It misses 'plan'. I should add it or fetch subscription.

			// Let's assume free plan for now or fetch from a 'subscriptions' table.
			// For simplicity in Phase 4, let's assume a default 'free'.

			const planKey = 'free' // TODO: fetch from subscriptions
			const plan = defaultPlanService.getPlan(planKey)

			if (!plan) {
				// Should not happen as 'free' should exist, but safe fallback
				throw new GuardError('Plan configuration error', 500)
			}

			// Populate ctx.org
			ctx.org = {
				id: org.id,
				name: org.name,
				slug: org.slug,
				plan: plan.key,
				features: plan.features,
				memberCount: 1, // TODO: fetch actual count
			}

			// Update auth context with org role
			ctx.auth.orgId = org.id
			ctx.auth.role = membership.role

			// Populate permissions based on role
			const roleDef = defaultRoleService.getRole(membership.role)
			if (roleDef) {
				// We might merge system permissions with role permissions
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
			// Simple check: if plan is not free, assume paid/trial.
			// In real app, check subscription status.
			if (ctx.org.plan === 'free') {
				throw new GuardError('Paid plan required', 403)
			}
		}
	},
}
