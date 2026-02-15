/**
 * Entitlement Override Management
 * Grant, deny, or limit features for specific users/orgs
 */

import type { SQL } from 'bun'
import type { Logger } from '../../logger/index.ts'
import type { UserId, OrgId, EntitlementOverride, OverrideType } from '../core/types.ts'

export interface GrantOverrideData {
	subjectType: 'user' | 'org'
	subjectId: string
	featureKey: string
	limitValue?: number
	reason?: string
	orgId?: OrgId
}

export interface DenyOverrideData {
	subjectType: 'user' | 'org'
	subjectId: string
	featureKey: string
	reason?: string
	orgId?: OrgId
}

export interface LimitOverrideData {
	subjectType: 'user' | 'org'
	subjectId: string
	featureKey: string
	limitValue: number
	reason?: string
	orgId?: OrgId
}

export interface RemoveOverrideData {
	subjectType: 'user' | 'org'
	subjectId: string
	featureKey: string
	orgId?: OrgId
}

export interface ListOverridesOptions {
	subjectType?: 'user' | 'org'
	subjectId?: string
	featureKey?: string
	orgId?: OrgId
	limit?: number
	offset?: number
}

/**
 * Manages entitlement overrides
 * Allows manual grants, denials, or limits beyond subscription plans
 */
export class OverrideManager {
	constructor(
		private readonly sql: SQL,
		private readonly logger: Logger,
	) {}

	/**
	 * Grant feature access to a subject
	 * - Overrides subscription plan
	 * - Optionally set usage limit
	 */
	async grant(data: GrantOverrideData): Promise<EntitlementOverride> {
		const { subjectType, subjectId, featureKey, limitValue, reason, orgId } = data

		this.logger.info('Granting feature override', { subjectType, subjectId, featureKey })

		// Remove existing override for this subject + feature
		await this.remove({
			subjectType,
			subjectId,
			featureKey,
			orgId,
		})

		// Create new grant override
		const id = crypto.randomUUID()
		await this.sql`
			INSERT INTO entitlement_overrides (
				id,
				subject_type,
				subject_id,
				feature_key,
				override_type,
				limit_value,
				reason,
				org_id,
				created_at
			)
			VALUES (
				${id},
				${subjectType},
				${subjectId},
				${featureKey},
				'grant',
				${limitValue || null},
				${reason || null},
				${orgId || null},
				NOW()
			)
		`

		this.logger.info('Feature access granted', { subjectType, subjectId, featureKey })

		return {
			id,
			subjectType,
			subjectId,
			featureKey,
			overrideType: 'grant',
			limitValue: limitValue ?? null,
			reason: reason ?? null,
			orgId: orgId ?? null,
			createdAt: new Date(),
		}
	}

	/**
	 * Deny feature access to a subject
	 * - Overrides subscription plan
	 * - Blocks access even if plan includes the feature
	 */
	async deny(data: DenyOverrideData): Promise<EntitlementOverride> {
		const { subjectType, subjectId, featureKey, reason, orgId } = data

		this.logger.info('Denying feature override', { subjectType, subjectId, featureKey })

		// Remove existing override
		await this.remove({
			subjectType,
			subjectId,
			featureKey,
			orgId,
		})

		// Create new deny override
		const id = crypto.randomUUID()
		await this.sql`
			INSERT INTO entitlement_overrides (
				id,
				subject_type,
				subject_id,
				feature_key,
				override_type,
				reason,
				org_id,
				created_at
			)
			VALUES (
				${id},
				${subjectType},
				${subjectId},
				${featureKey},
				'deny',
				${reason || null},
				${orgId || null},
				NOW()
			)
		`

		this.logger.info('Feature access denied', { subjectType, subjectId, featureKey })

		return {
			id,
			subjectType,
			subjectId,
			featureKey,
			overrideType: 'deny',
			limitValue: null,
			reason: reason ?? null,
			orgId: orgId ?? null,
			createdAt: new Date(),
		}
	}

	/**
	 * Set usage limit for a feature
	 * - Overrides plan limit
	 * - Does not affect access (only limit)
	 */
	async limit(data: LimitOverrideData): Promise<EntitlementOverride> {
		const { subjectType, subjectId, featureKey, limitValue, reason, orgId } = data

		this.logger.info('Setting feature limit override', {
			subjectType,
			subjectId,
			featureKey,
			limitValue,
		})

		// Remove existing override
		await this.remove({
			subjectType,
			subjectId,
			featureKey,
			orgId,
		})

		// Create new limit override
		const id = crypto.randomUUID()
		await this.sql`
			INSERT INTO entitlement_overrides (
				id,
				subject_type,
				subject_id,
				feature_key,
				override_type,
				limit_value,
				reason,
				org_id,
				created_at
			)
			VALUES (
				${id},
				${subjectType},
				${subjectId},
				${featureKey},
				'limit',
				${limitValue},
				${reason || null},
				${orgId || null},
				NOW()
			)
		`

		this.logger.info('Feature limit set', { subjectType, subjectId, featureKey, limitValue })

		return {
			id,
			subjectType,
			subjectId,
			featureKey,
			overrideType: 'limit',
			limitValue,
			reason: reason ?? null,
			orgId: orgId ?? null,
			createdAt: new Date(),
		}
	}

	/**
	 * Remove override for a subject + feature
	 */
	async remove(data: RemoveOverrideData): Promise<void> {
		const { subjectType, subjectId, featureKey, orgId } = data

		this.logger.info('Removing feature override', { subjectType, subjectId, featureKey })

		await this.sql`
			DELETE FROM entitlement_overrides
			WHERE subject_type = ${subjectType}
			  AND subject_id = ${subjectId}
			  AND feature_key = ${featureKey}
			  ${orgId ? this.sql`AND org_id = ${orgId}` : this.sql`AND org_id IS NULL`}
		`

		this.logger.info('Feature override removed', { subjectType, subjectId, featureKey })
	}

	/**
	 * Get override for a specific subject + feature
	 */
	async get(
		subjectType: 'user' | 'org',
		subjectId: string,
		featureKey: string,
		orgId?: OrgId,
	): Promise<EntitlementOverride | null> {
		const rows = await this.sql`
			SELECT
				subject_type as "subjectType",
				subject_id as "subjectId",
				feature_key as "featureKey",
				override_type as "overrideType",
				limit_value as "limitValue",
				reason: reason ?? null,
				org_id as "orgId",
				created_at as "createdAt"
			FROM entitlement_overrides
			WHERE subject_type = ${subjectType}
			  AND subject_id = ${subjectId}
			  AND feature_key = ${featureKey}
			  ${orgId ? this.sql`AND org_id = ${orgId}` : this.sql`AND org_id IS NULL`}
		`

		if (rows.length === 0) return null

		return rows[0] as EntitlementOverride
	}

	/**
	 * List overrides
	 */
	async list(options: ListOverridesOptions = {}): Promise<EntitlementOverride[]> {
		const limit = options.limit || 50
		const offset = options.offset || 0

		let query = this.sql`
			SELECT
				subject_type as "subjectType",
				subject_id as "subjectId",
				feature_key as "featureKey",
				override_type as "overrideType",
				limit_value as "limitValue",
				reason: reason ?? null,
				org_id as "orgId",
				created_at as "createdAt"
			FROM entitlement_overrides
			WHERE 1=1
		`

		if (options.subjectType) {
			query = this.sql`${query} AND subject_type = ${options.subjectType}`
		}

		if (options.subjectId) {
			query = this.sql`${query} AND subject_id = ${options.subjectId}`
		}

		if (options.featureKey) {
			query = this.sql`${query} AND feature_key = ${options.featureKey}`
		}

		if (options.orgId) {
			query = this.sql`${query} AND org_id = ${options.orgId}`
		}

		const rows = await this.sql`
			${query}
			ORDER BY created_at DESC
			LIMIT ${limit}
			OFFSET ${offset}
		`

		return rows as EntitlementOverride[]
	}

	/**
	 * List all overrides for a subject
	 */
	async listForSubject(
		subjectType: 'user' | 'org',
		subjectId: string,
		orgId?: OrgId,
	): Promise<EntitlementOverride[]> {
		const rows = await this.sql`
			SELECT
				subject_type as "subjectType",
				subject_id as "subjectId",
				feature_key as "featureKey",
				override_type as "overrideType",
				limit_value as "limitValue",
				reason: reason ?? null,
				org_id as "orgId",
				created_at as "createdAt"
			FROM entitlement_overrides
			WHERE subject_type = ${subjectType}
			  AND subject_id = ${subjectId}
			  ${orgId ? this.sql`AND org_id = ${orgId}` : this.sql`AND org_id IS NULL`}
			ORDER BY created_at DESC
		`

		return rows as EntitlementOverride[]
	}

	/**
	 * Remove all overrides for a subject
	 */
	async removeAllForSubject(
		subjectType: 'user' | 'org',
		subjectId: string,
		orgId?: OrgId,
	): Promise<number> {
		const result = await this.sql`
			DELETE FROM entitlement_overrides
			WHERE subject_type = ${subjectType}
			  AND subject_id = ${subjectId}
			  ${orgId ? this.sql`AND org_id = ${orgId}` : this.sql`AND org_id IS NULL`}
			RETURNING id
		`

		this.logger.info('All overrides removed for subject', {
			subjectType,
			subjectId,
			count: result.length,
		})

		return result.length
	}
}
