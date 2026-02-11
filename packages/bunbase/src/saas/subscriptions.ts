export interface Subscription {
	id: string
	orgId: string
	planKey: string
	status: 'active' | 'trialing' | 'canceled' | 'past_due'
	currentPeriodEnd: Date
}

export class SubscriptionService {
	constructor(private readonly db: any) {}

	async getSubscription(orgId: string): Promise<Subscription | null> {
		const sub = await this.db
			.from('subscriptions')
			.eq('org_id', orgId)
			.single()

		if (!sub) return null

		return {
			id: sub.id,
			orgId: sub.org_id,
			planKey: sub.plan_key,
			status: sub.status,
			currentPeriodEnd: new Date(sub.current_period_end),
		}
	}

	async createSubscription(
		orgId: string,
		planKey: string,
	): Promise<Subscription> {
		const sub = await this.db
			.from('subscriptions')
			.insert({
				org_id: orgId,
				plan_key: planKey,
				status: 'active',
				current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // +30 days
			})

		return {
			id: sub.id,
			orgId: sub.org_id,
			planKey: sub.plan_key,
			status: sub.status,
			currentPeriodEnd: new Date(sub.current_period_end),
		}
	}
}
