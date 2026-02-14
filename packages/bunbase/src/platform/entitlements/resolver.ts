/**
 * Entitlement Resolver
 * Resolves feature access based on subscriptions, plans, and overrides
 */

import type { SQL } from 'bun'
import type { Logger } from '../../logger/index.ts'
import type { UserId, OrgId, EntitlementMap, Feature } from '../core/types.ts'

export interface ResolveEntitlementsOptions {
	subjectType: 'user' | 'org'
	subjectId: string
	orgId?: OrgId
}

export interface FeatureAccess {
	hasAccess: boolean
	limit?: number
	source: 'subscription' | 'override' | 'none'
}

/**
 * Resolves entitlements for users and organizations
 * Combines plan features with manual overrides
 */
export class EntitlementResolver {
	constructor(
		private readonly sql: SQL,
		private readonly logger: Logger,
	) {}

	/**
	 * Resolve all entitlements for a subject
	 * - Returns map of feature keys to access status
	 * - Combines plan features + overrides
	 * - Overrides take precedence
	 */
	async resolve(options: ResolveEntitlementsOptions): Promise<EntitlementMap> {
		const { subjectType, subjectId, orgId } = options

		this.logger.debug('Resolving entitlements', { subjectType, subjectId, orgId })

		// Get active subscription
		const subscription = await this.getActiveSubscription(subjectType, subjectId, orgId)

		// Get plan features
		const planFeatures = subscription
			? await this.getPlanFeatures(subscription.planKey)
			: new Map<string, Feature>()

		// Get overrides
		const overrides = await this.getOverrides(subjectType, subjectId, orgId)

		// Merge features and overrides
		const entitlements: EntitlementMap = {}

		// Add all plan features
		for (const [key, feature] of planFeatures) {
			entitlements[key] = {
				enabled: true,
				source: 'plan',
			}
		}

		// Apply overrides (take precedence)
		for (const override of overrides) {
			if (override.type === 'grant') {
				entitlements[override.featureKey] = {
					enabled: true,
					limit: override.limitValue,
					source: 'override',
				}
			} else if (override.type === 'deny') {
				entitlements[override.featureKey] = {
					enabled: false,
					source: 'override',
				}
			} else if (override.type === 'limit') {
				// Keep existing access, just update limit
				entitlements[override.featureKey] = {
					enabled: entitlements[override.featureKey]?.enabled ?? true,
					limit: override.limitValue,
					source: 'override',
				}
			}
		}

		return entitlements
	}

	/**
	 * Check if subject has access to a specific feature
	 */
	async hasFeature(
		options: ResolveEntitlementsOptions,
		featureKey: string,
	): Promise<boolean> {
		const entitlements = await this.resolve(options)

		return entitlements[featureKey]?.enabled ?? false
	}

	/**
	 * Get limit for a specific feature
	 * Returns null if no limit, or the limit value
	 */
	async getLimit(
		options: ResolveEntitlementsOptions,
		featureKey: string,
	): Promise<number | null> {
		const entitlements = await this.resolve(options)

		return entitlements[featureKey]?.limit ?? null
	}

	/**
	 * Check if usage is within limit
	 */
	async withinLimit(
		options: ResolveEntitlementsOptions,
		featureKey: string,
		currentUsage: number,
	): Promise<boolean> {
		const limit = await this.getLimit(options, featureKey)

		if (limit === null) return true // No limit

		return currentUsage < limit
	}

	/**
	 * Get active subscription for subject
	 */
	private async getActiveSubscription(
		subjectType: 'user' | 'org',
		subjectId: string,
		orgId?: OrgId,
	): Promise<{ planKey: string } | null> {
		const column = subjectType === 'user' ? 'user_id' : 'org_id'
		const id = subjectType === 'org' ? orgId || subjectId : subjectId

		const rows = await this.sql.unsafe(
			`
			SELECT plan_key
			FROM subscriptions
			WHERE ${column} = $1
			  AND status IN ('active', 'trialing')
			ORDER BY created_at DESC
			LIMIT 1
		`,
			[id],
		)

		if (rows.length === 0) return null

		return { planKey: (rows[0] as { plan_key: string }).plan_key }
	}

	/**
	 * Get features for a plan
	 */
	private async getPlanFeatures(planKey: string): Promise<Map<string, Feature>> {
		const rows = await this.sql`
			SELECT
				f.id,
				f.key,
				f.name,
				f.description
			FROM features f
			INNER JOIN plan_features pf ON pf.feature_id = f.id
			INNER JOIN plans p ON p.id = pf.plan_id
			WHERE p.key = ${planKey}
		`

		const features = new Map<string, Feature>()

		for (const row of rows) {
			const feature = row as Feature
			features.set(feature.key, feature)
		}

		return features
	}

	/**
	 * Get overrides for subject
	 */
	private async getOverrides(
		subjectType: 'user' | 'org',
		subjectId: string,
		orgId?: OrgId,
	): Promise<
		Array<{
			featureKey: string
			type: 'grant' | 'deny' | 'limit'
			limitValue?: number
		}>
	> {
		const rows = await this.sql`
			SELECT
				feature_key as "featureKey",
				override_type as "type",
				limit_value as "limitValue"
			FROM entitlement_overrides
			WHERE subject_type = ${subjectType}
			  AND subject_id = ${subjectId}
			  ${orgId ? this.sql`AND org_id = ${orgId}` : this.sql`AND org_id IS NULL`}
			ORDER BY created_at DESC
		`

		return rows as Array<{
			featureKey: string
			type: 'grant' | 'deny' | 'limit'
			limitValue?: number
		}>
	}

	/**
	 * Check if user/org has an active paid subscription
	 */
	async hasPaidSubscription(options: ResolveEntitlementsOptions): Promise<boolean> {
		const subscription = await this.getActiveSubscription(
			options.subjectType,
			options.subjectId,
			options.orgId,
		)

		if (!subscription) return false

		// Check if plan is paid (price > 0)
		const plan = await this.sql`
			SELECT price_cents FROM plans WHERE key = ${subscription.planKey}
		`

		if (plan.length === 0) return false

		return (plan[0] as { price_cents: number }).price_cents > 0
	}

	/**
	 * Check if trial is active
	 */
	async hasActiveTrial(options: ResolveEntitlementsOptions): Promise<boolean> {
		const { subjectType, subjectId, orgId } = options
		const column = subjectType === 'user' ? 'user_id' : 'org_id'
		const id = subjectType === 'org' ? orgId || subjectId : subjectId

		const rows = await this.sql.unsafe(
			`
			SELECT trial_ends_at
			FROM subscriptions
			WHERE ${column} = $1
			  AND status = 'trialing'
			  AND trial_ends_at > NOW()
			ORDER BY created_at DESC
			LIMIT 1
		`,
			[id],
		)

		return rows.length > 0
	}

	/**
	 * Check if trial is active OR has paid subscription
	 */
	async trialActiveOrPaid(options: ResolveEntitlementsOptions): Promise<boolean> {
		const [hasTrial, hasPaid] = await Promise.all([
			this.hasActiveTrial(options),
			this.hasPaidSubscription(options),
		])

		return hasTrial || hasPaid
	}
}
