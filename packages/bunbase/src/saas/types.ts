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

export interface Role {
	key: string
	name: string
	description?: string
	permissions: string[]
}

export interface Permission {
	key: string
	name: string
	description?: string
}

export interface Plan {
	key: string
	name: string
	priceCents: number
	features: string[]
}
