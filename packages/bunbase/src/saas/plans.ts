import type { Plan } from './types.ts'

export class PlanService {
	private plans = new Map<string, Plan>()

	constructor() {
		// Default plans
		this.addPlan({
			key: 'free',
			name: 'Free',
			priceCents: 0,
			features: ['org:create'],
		})
		this.addPlan({
			key: 'pro',
			name: 'Pro',
			priceCents: 2000,
			features: ['org:create', 'org:analytics'],
		})
	}

	addPlan(plan: Plan): void {
		this.plans.set(plan.key, plan)
	}

	getPlan(key: string): Plan | undefined {
		return this.plans.get(key)
	}
}

export const defaultPlanService: PlanService = new PlanService()
