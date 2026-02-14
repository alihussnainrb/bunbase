/**
 * Plan Management
 * CRUD operations for billing plans
 */

import type { SQL } from 'bun'
import type { Logger } from '../../logger/index.ts'
import type { Plan, PlanId, Feature } from '../core/types.ts'
import { PlanNotFoundError } from '../core/errors.ts'
import { newPlanId } from '../core/ids.ts'

export interface CreatePlanData {
	key: string
	name: string
	priceCents: number
	description?: string
	features?: string[]
}

export interface UpdatePlanData {
	name?: string
	priceCents?: number
	description?: string
}

export interface ListPlansOptions {
	limit?: number
	offset?: number
}

/**
 * Manages billing plans
 */
export class PlanManager {
	constructor(
		private readonly sql: SQL,
		private readonly logger: Logger,
	) {}

	/**
	 * Create a new plan
	 * - Key must be unique (e.g., 'free', 'pro', 'enterprise')
	 * - Price in cents (e.g., 2900 = $29.00)
	 * - Optionally link features
	 */
	async create(data: CreatePlanData): Promise<Plan> {
		this.logger.info('Creating plan', { key: data.key })

		const planId = newPlanId()

		try {
			await this.sql.begin(async (tx) => {
				// Create plan
				await tx`
					INSERT INTO plans (id, key, name, price_cents, description, created_at)
					VALUES (
						${planId},
						${data.key},
						${data.name},
						${data.priceCents},
						${data.description || null},
						NOW()
					)
				`

				// Link features if provided
				if (data.features && data.features.length > 0) {
					for (const featureKey of data.features) {
						await tx`
							INSERT INTO plan_features (plan_id, feature_id)
							SELECT ${planId}, id FROM features WHERE key = ${featureKey}
						`
					}
				}
			})

			this.logger.info('Plan created', { planId, key: data.key })

			return {
				id: planId,
				key: data.key,
				name: data.name,
				priceCents: data.priceCents,
				description: data.description,
				createdAt: new Date().toISOString(),
			}
		} catch (err) {
			this.logger.error('Failed to create plan', { error: err })
			throw err
		}
	}

	/**
	 * Get plan by ID
	 */
	async get(planId: PlanId): Promise<Plan | null> {
		const rows = await this.sql`
			SELECT
				id,
				key,
				name,
				price_cents as "priceCents",
				description,
				created_at as "createdAt"
			FROM plans
			WHERE id = ${planId}
		`

		if (rows.length === 0) return null

		return rows[0] as Plan
	}

	/**
	 * Get plan by key
	 */
	async getByKey(key: string): Promise<Plan | null> {
		const rows = await this.sql`
			SELECT
				id,
				key,
				name,
				price_cents as "priceCents",
				description,
				created_at as "createdAt"
			FROM plans
			WHERE key = ${key}
		`

		if (rows.length === 0) return null

		return rows[0] as Plan
	}

	/**
	 * Update plan
	 */
	async update(planId: PlanId, data: UpdatePlanData): Promise<Plan> {
		const plan = await this.get(planId)
		if (!plan) throw new PlanNotFoundError(planId)

		const updates: string[] = []
		const values: unknown[] = []

		if (data.name !== undefined) {
			updates.push(`name = $${updates.length + 1}`)
			values.push(data.name)
		}

		if (data.priceCents !== undefined) {
			updates.push(`price_cents = $${updates.length + 1}`)
			values.push(data.priceCents)
		}

		if (data.description !== undefined) {
			updates.push(`description = $${updates.length + 1}`)
			values.push(data.description)
		}

		if (updates.length === 0) {
			// No updates needed
			return plan
		}

		values.push(planId)

		const sql = `UPDATE plans SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING *`

		const rows = await this.sql.unsafe(sql, values)

		this.logger.info('Plan updated', { planId, updates: Object.keys(data) })

		const updated = rows[0] as {
			id: string
			key: string
			name: string
			price_cents: number
			description?: string
			created_at: string
		}

		return {
			id: updated.id as PlanId,
			key: updated.key,
			name: updated.name,
			priceCents: updated.price_cents,
			description: updated.description,
			createdAt: updated.created_at,
		}
	}

	/**
	 * Delete plan
	 * - Soft delete: mark as archived instead of deleting
	 * - Existing subscriptions remain unaffected
	 */
	async delete(planId: PlanId): Promise<void> {
		const plan = await this.get(planId)
		if (!plan) throw new PlanNotFoundError(planId)

		await this.sql`DELETE FROM plans WHERE id = ${planId}`

		this.logger.info('Plan deleted', { planId })
	}

	/**
	 * List all plans
	 */
	async list(options: ListPlansOptions = {}): Promise<Plan[]> {
		const limit = options.limit || 50
		const offset = options.offset || 0

		const rows = await this.sql`
			SELECT
				id,
				key,
				name,
				price_cents as "priceCents",
				description,
				created_at as "createdAt"
			FROM plans
			ORDER BY price_cents ASC
			LIMIT ${limit}
			OFFSET ${offset}
		`

		return rows as Plan[]
	}

	/**
	 * Get plan with its features
	 */
	async getPlanWithFeatures(planId: PlanId): Promise<
		| (Plan & {
				features: Feature[]
		  })
		| null
	> {
		const plan = await this.get(planId)
		if (!plan) return null

		const featureRows = await this.sql`
			SELECT
				f.id,
				f.key,
				f.name,
				f.description
			FROM features f
			INNER JOIN plan_features pf ON pf.feature_id = f.id
			WHERE pf.plan_id = ${planId}
			ORDER BY f.name
		`

		return {
			...plan,
			features: featureRows as Feature[],
		}
	}

	/**
	 * Add feature to plan
	 */
	async addFeature(planId: PlanId, featureKey: string): Promise<void> {
		this.logger.info('Adding feature to plan', { planId, featureKey })

		await this.sql`
			INSERT INTO plan_features (plan_id, feature_id)
			SELECT ${planId}, id FROM features WHERE key = ${featureKey}
			ON CONFLICT DO NOTHING
		`

		this.logger.info('Feature added to plan', { planId, featureKey })
	}

	/**
	 * Remove feature from plan
	 */
	async removeFeature(planId: PlanId, featureKey: string): Promise<void> {
		this.logger.info('Removing feature from plan', { planId, featureKey })

		await this.sql`
			DELETE FROM plan_features
			WHERE plan_id = ${planId}
			  AND feature_id = (SELECT id FROM features WHERE key = ${featureKey})
		`

		this.logger.info('Feature removed from plan', { planId, featureKey })
	}

	/**
	 * Get features for a plan
	 */
	async getFeatures(planId: PlanId): Promise<Feature[]> {
		const rows = await this.sql`
			SELECT
				f.id,
				f.key,
				f.name,
				f.description
			FROM features f
			INNER JOIN plan_features pf ON pf.feature_id = f.id
			WHERE pf.plan_id = ${planId}
			ORDER BY f.name
		`

		return rows as Feature[]
	}
}
