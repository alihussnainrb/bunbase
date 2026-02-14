/**
 * Subscription Management
 * Handles subscription lifecycle for users and organizations
 */

import type { SQL } from 'bun'
import type { Logger } from '../../logger/index.ts'
import type {
	Subscription,
	SubscriptionId,
	SubscriptionStatus,
	UserId,
	OrgId,
	PlanId,
} from '../core/types.ts'
import { SubscriptionNotFoundError, PlanNotFoundError } from '../core/errors.ts'
import { newSubscriptionId } from '../core/ids.ts'

export interface CreateSubscriptionData {
	planKey: string
	userId?: UserId
	orgId?: OrgId
	status?: SubscriptionStatus
	currentPeriodEnd?: Date
	trialEndsAt?: Date
}

export interface UpdateSubscriptionData {
	planKey?: string
	status?: SubscriptionStatus
	currentPeriodEnd?: Date
	cancelAtPeriodEnd?: boolean
}

export interface ListSubscriptionsOptions {
	userId?: UserId
	orgId?: OrgId
	status?: SubscriptionStatus
	limit?: number
	offset?: number
}

/**
 * Manages subscriptions for users and organizations
 */
export class SubscriptionManager {
	constructor(
		private readonly sql: SQL,
		private readonly logger: Logger,
	) {}

	/**
	 * Create a new subscription
	 * - Either userId or orgId must be provided (not both)
	 * - Default status: active
	 * - Default period: 30 days
	 */
	async create(data: CreateSubscriptionData): Promise<Subscription> {
		if (!data.userId && !data.orgId) {
			throw new Error('Either userId or orgId must be provided')
		}

		if (data.userId && data.orgId) {
			throw new Error('Cannot specify both userId and orgId')
		}

		this.logger.info('Creating subscription', {
			planKey: data.planKey,
			userId: data.userId,
			orgId: data.orgId,
		})

		const subscriptionId = newSubscriptionId()
		const status = data.status || 'active'
		const currentPeriodEnd =
			data.currentPeriodEnd || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

		try {
			await this.sql`
				INSERT INTO subscriptions (
					id,
					user_id,
					org_id,
					plan_key,
					status,
					current_period_end,
					trial_ends_at,
					created_at,
					updated_at
				)
				VALUES (
					${subscriptionId},
					${data.userId || null},
					${data.orgId || null},
					${data.planKey},
					${status},
					${currentPeriodEnd.toISOString()},
					${data.trialEndsAt?.toISOString() || null},
					NOW(),
					NOW()
				)
			`

			this.logger.info('Subscription created', { subscriptionId })

			return {
				id: subscriptionId,
				userId: data.userId,
				orgId: data.orgId,
				planKey: data.planKey,
				status,
				currentPeriodEnd: currentPeriodEnd.toISOString(),
				trialEndsAt: data.trialEndsAt?.toISOString(),
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			}
		} catch (err) {
			this.logger.error('Failed to create subscription', { error: err })
			throw err
		}
	}

	/**
	 * Get subscription by ID
	 */
	async get(subscriptionId: SubscriptionId): Promise<Subscription | null> {
		const rows = await this.sql`
			SELECT
				id,
				user_id as "userId",
				org_id as "orgId",
				plan_key as "planKey",
				status,
				current_period_end as "currentPeriodEnd",
				trial_ends_at as "trialEndsAt",
				cancel_at_period_end as "cancelAtPeriodEnd",
				created_at as "createdAt",
				updated_at as "updatedAt"
			FROM subscriptions
			WHERE id = ${subscriptionId}
		`

		if (rows.length === 0) return null

		return rows[0] as Subscription
	}

	/**
	 * Get active subscription for user
	 */
	async getForUser(userId: UserId): Promise<Subscription | null> {
		const rows = await this.sql`
			SELECT
				id,
				user_id as "userId",
				org_id as "orgId",
				plan_key as "planKey",
				status,
				current_period_end as "currentPeriodEnd",
				trial_ends_at as "trialEndsAt",
				cancel_at_period_end as "cancelAtPeriodEnd",
				created_at as "createdAt",
				updated_at as "updatedAt"
			FROM subscriptions
			WHERE user_id = ${userId}
			  AND status IN ('active', 'trialing')
			ORDER BY created_at DESC
			LIMIT 1
		`

		if (rows.length === 0) return null

		return rows[0] as Subscription
	}

	/**
	 * Get active subscription for organization
	 */
	async getForOrg(orgId: OrgId): Promise<Subscription | null> {
		const rows = await this.sql`
			SELECT
				id,
				user_id as "userId",
				org_id as "orgId",
				plan_key as "planKey",
				status,
				current_period_end as "currentPeriodEnd",
				trial_ends_at as "trialEndsAt",
				cancel_at_period_end as "cancelAtPeriodEnd",
				created_at as "createdAt",
				updated_at as "updatedAt"
			FROM subscriptions
			WHERE org_id = ${orgId}
			  AND status IN ('active', 'trialing')
			ORDER BY created_at DESC
			LIMIT 1
		`

		if (rows.length === 0) return null

		return rows[0] as Subscription
	}

	/**
	 * Update subscription
	 */
	async update(subscriptionId: SubscriptionId, data: UpdateSubscriptionData): Promise<Subscription> {
		const subscription = await this.get(subscriptionId)
		if (!subscription) throw new SubscriptionNotFoundError(subscriptionId)

		const updates: string[] = []
		const values: unknown[] = []

		if (data.planKey !== undefined) {
			updates.push(`plan_key = $${updates.length + 1}`)
			values.push(data.planKey)
		}

		if (data.status !== undefined) {
			updates.push(`status = $${updates.length + 1}`)
			values.push(data.status)
		}

		if (data.currentPeriodEnd !== undefined) {
			updates.push(`current_period_end = $${updates.length + 1}`)
			values.push(data.currentPeriodEnd.toISOString())
		}

		if (data.cancelAtPeriodEnd !== undefined) {
			updates.push(`cancel_at_period_end = $${updates.length + 1}`)
			values.push(data.cancelAtPeriodEnd)
		}

		if (updates.length === 0) {
			// No updates needed
			return subscription
		}

		updates.push('updated_at = NOW()')
		values.push(subscriptionId)

		const sql = `UPDATE subscriptions SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING *`

		const rows = await this.sql.unsafe(sql, values)

		this.logger.info('Subscription updated', { subscriptionId, updates: Object.keys(data) })

		const updated = rows[0] as {
			id: string
			user_id?: string
			org_id?: string
			plan_key: string
			status: SubscriptionStatus
			current_period_end: string
			trial_ends_at?: string
			cancel_at_period_end?: boolean
			created_at: string
			updated_at: string
		}

		return {
			id: updated.id as SubscriptionId,
			userId: updated.user_id as UserId | undefined,
			orgId: updated.org_id as OrgId | undefined,
			planKey: updated.plan_key,
			status: updated.status,
			currentPeriodEnd: updated.current_period_end,
			trialEndsAt: updated.trial_ends_at,
			cancelAtPeriodEnd: updated.cancel_at_period_end,
			createdAt: updated.created_at,
			updatedAt: updated.updated_at,
		}
	}

	/**
	 * Change subscription plan
	 */
	async changePlan(subscriptionId: SubscriptionId, newPlanKey: string): Promise<Subscription> {
		return this.update(subscriptionId, { planKey: newPlanKey })
	}

	/**
	 * Cancel subscription
	 * - Set cancel_at_period_end flag
	 * - Subscription remains active until period end
	 */
	async cancel(subscriptionId: SubscriptionId, immediately = false): Promise<Subscription> {
		if (immediately) {
			return this.update(subscriptionId, {
				status: 'canceled',
				cancelAtPeriodEnd: false,
			})
		}

		return this.update(subscriptionId, {
			cancelAtPeriodEnd: true,
		})
	}

	/**
	 * Reactivate canceled subscription
	 */
	async reactivate(subscriptionId: SubscriptionId): Promise<Subscription> {
		return this.update(subscriptionId, {
			status: 'active',
			cancelAtPeriodEnd: false,
		})
	}

	/**
	 * List subscriptions
	 */
	async list(options: ListSubscriptionsOptions = {}): Promise<Subscription[]> {
		const limit = options.limit || 50
		const offset = options.offset || 0

		let query = this.sql`
			SELECT
				id,
				user_id as "userId",
				org_id as "orgId",
				plan_key as "planKey",
				status,
				current_period_end as "currentPeriodEnd",
				trial_ends_at as "trialEndsAt",
				cancel_at_period_end as "cancelAtPeriodEnd",
				created_at as "createdAt",
				updated_at as "updatedAt"
			FROM subscriptions
			WHERE 1=1
		`

		if (options.userId) {
			query = this.sql`${query} AND user_id = ${options.userId}`
		}

		if (options.orgId) {
			query = this.sql`${query} AND org_id = ${options.orgId}`
		}

		if (options.status) {
			query = this.sql`${query} AND status = ${options.status}`
		}

		const rows = await this.sql`
			${query}
			ORDER BY created_at DESC
			LIMIT ${limit}
			OFFSET ${offset}
		`

		return rows as Subscription[]
	}

	/**
	 * Check if subscription is active
	 * - Status must be 'active' or 'trialing'
	 * - Trial not expired (if trialing)
	 */
	async isActive(subscriptionId: SubscriptionId): Promise<boolean> {
		const subscription = await this.get(subscriptionId)
		if (!subscription) return false

		if (subscription.status !== 'active' && subscription.status !== 'trialing') {
			return false
		}

		if (subscription.status === 'trialing' && subscription.trialEndsAt) {
			const trialEnd = new Date(subscription.trialEndsAt)
			if (trialEnd < new Date()) {
				return false
			}
		}

		return true
	}

	/**
	 * Check if user/org has active subscription
	 */
	async hasActiveSubscription(userId?: UserId, orgId?: OrgId): Promise<boolean> {
		if (!userId && !orgId) return false

		const subscription = userId ? await this.getForUser(userId) : await this.getForOrg(orgId!)

		if (!subscription) return false

		return this.isActive(subscription.id)
	}

	/**
	 * Process expired trials
	 * - Update status from 'trialing' to 'past_due' or 'canceled'
	 */
	async processExpiredTrials(): Promise<number> {
		const result = await this.sql`
			UPDATE subscriptions
			SET status = 'past_due', updated_at = NOW()
			WHERE status = 'trialing'
			  AND trial_ends_at <= NOW()
			RETURNING id
		`

		this.logger.info('Expired trials processed', { count: result.length })

		return result.length
	}

	/**
	 * Process pending cancellations
	 * - Cancel subscriptions where period has ended and cancel_at_period_end is true
	 */
	async processPendingCancellations(): Promise<number> {
		const result = await this.sql`
			UPDATE subscriptions
			SET status = 'canceled', updated_at = NOW()
			WHERE status = 'active'
			  AND cancel_at_period_end = true
			  AND current_period_end <= NOW()
			RETURNING id
		`

		this.logger.info('Pending cancellations processed', { count: result.length })

		return result.length
	}
}
