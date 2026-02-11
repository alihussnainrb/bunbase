import { describe, expect, it } from 'bun:test'
import { PlanService } from '../src/saas/plans.ts'

describe('PlanService', () => {
	describe('constructor', () => {
		it('should initialize with default plans', () => {
			const service = new PlanService()

			const free = service.getPlan('free')
			const pro = service.getPlan('pro')

			expect(free).toBeDefined()
			expect(free?.key).toBe('free')
			expect(free?.name).toBe('Free')
			expect(free?.priceCents).toBe(0)
			expect(free?.features).toContain('org:create')

			expect(pro).toBeDefined()
			expect(pro?.key).toBe('pro')
			expect(pro?.name).toBe('Pro')
			expect(pro?.priceCents).toBe(2000)
			expect(pro?.features).toContain('org:create')
			expect(pro?.features).toContain('org:analytics')
		})
	})

	describe('addPlan()', () => {
		it('should add custom plan', () => {
			const service = new PlanService()

			service.addPlan({
				key: 'enterprise',
				name: 'Enterprise',
				priceCents: 5000,
				features: ['org:create', 'org:analytics', 'custom:integration'],
			})

			const enterprise = service.getPlan('enterprise')
			expect(enterprise).toBeDefined()
			expect(enterprise?.key).toBe('enterprise')
			expect(enterprise?.priceCents).toBe(5000)
			expect(enterprise?.features).toContain('custom:integration')
		})

		it('should overwrite existing plan with same key', () => {
			const service = new PlanService()

			service.addPlan({
				key: 'free',
				name: 'Free (Updated)',
				priceCents: 0,
				features: ['org:create', 'new:feature'],
			})

			const free = service.getPlan('free')
			expect(free?.name).toBe('Free (Updated)')
			expect(free?.features).toContain('new:feature')
		})
	})

	describe('getPlan()', () => {
		it('should return undefined for unknown plan', () => {
			const service = new PlanService()

			const unknown = service.getPlan('unknown')

			expect(unknown).toBeUndefined()
		})
	})
})
