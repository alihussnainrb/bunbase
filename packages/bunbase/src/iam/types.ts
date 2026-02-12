// ── Organization Types ─────────────────────────────────────

export interface Organization {
	id: string
	name: string
	slug: string
	ownerId: string
	createdAt: Date
	updatedAt: Date
}

export interface OrgMembership {
	id: string
	userId: string
	orgId: string
	role: string
	joinedAt: Date
}

// ── Subscription Types ────────────────────────────────────

export interface Subscription {
	id: string
	orgId: string
	planKey: string
	status: 'active' | 'trialing' | 'canceled' | 'past_due'
	currentPeriodEnd: Date
}

// ── Internal Session Tracking ─────────────────────────────

export interface SessionAction {
	type: 'create' | 'destroy'
	token?: string
}
