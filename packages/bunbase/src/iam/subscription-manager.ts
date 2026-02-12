import type { DatabaseClient } from '../db/client.ts'
import type { Subscription } from './types.ts'

/**
 * Manages subscriptions and plans.
 * All data is database-backed — no in-memory defaults.
 */
export class SubscriptionManager {
	constructor(private readonly db: DatabaseClient) {}

	/**
	 * Get an organization's subscription.
	 */
	async get(orgId: string): Promise<Subscription | null> {
		const sub = await this.db
			.from('subscriptions')
			.eq('org_id', orgId)
			.maybeSingle()

		if (!sub) return null

		return {
			id: sub.id,
			orgId: sub.org_id,
			planKey: sub.plan_key,
			status: sub.status,
			currentPeriodEnd: new Date(sub.current_period_end),
		}
	}

	/**
	 * Create a subscription for an organization.
	 */
	async create(orgId: string, planKey: string): Promise<Subscription> {
		const sub = await this.db.from('subscriptions').insert({
			org_id: orgId,
			plan_key: planKey,
			status: 'active',
			current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // +30 days
		})

		const row = sub!
		return {
			id: row.id,
			orgId: row.org_id,
			planKey: row.plan_key,
			status: row.status,
			currentPeriodEnd: new Date(row.current_period_end),
		}
	}

	/**
	 * Cancel an organization's subscription.
	 */
	async cancel(orgId: string): Promise<void> {
		await this.db
			.from('subscriptions')
			.eq('org_id', orgId)
			.update({ status: 'canceled' })
	}

	/**
	 * Get features for a plan key. Queries the plans table.
	 * Returns an empty array if the plan is not found.
	 */
	async getPlanFeatures(planKey: string): Promise<string[]> {
		const plan = await this.db.from('plans').eq('key', planKey).maybeSingle()

		if (!plan) return []

		// plans.features can be a JSON array or comma-separated string
		if (Array.isArray(plan.features)) {
			return plan.features
		}
		if (typeof plan.features === 'string') {
			return plan.features.split(',').map((f: string) => f.trim())
		}

		return []
	}
}
