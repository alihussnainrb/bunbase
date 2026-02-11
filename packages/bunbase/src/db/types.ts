// src/db/types.ts

/**
 * Central Database type — mirror your schema here.
 * Matches Supabase generated types structure.
 */
export interface Database {
	public: {
		Tables: {
			users: {
				Row: {
					id: string // uuid
					email: string
					name: string | null
					password_hash: string
					created_at: string // timestamptz as ISO string
					email_verified_at: string | null
				}
				Insert: {
					id?: string
					email: string
					name?: string | null
					password_hash: string
					created_at?: string
					email_verified_at?: string | null
				}
				Update: Partial<Database['public']['Tables']['users']['Insert']>
				Relationships: [] // add later if needed
			}

			sessions: {
				Row: {
					id: string
					user_id: string
					expires_at: string
					created_at: string
				}
				Insert: Omit<
					Database['public']['Tables']['sessions']['Row'],
					'created_at'
				>
				Update: Partial<Database['public']['Tables']['sessions']['Insert']>
				Relationships: []
			}

			// Add more tables as you go: organizations, roles, permissions, plans, etc.
			// organizations: { Row: { id: string; name: string; owner_id: string; ... }, ... }
		}

		Views: {} // if you have views
		Functions: {} // if you have pg functions
		Enums: {} // e.g. enum user_role { 'admin', 'member' }
		Composites: {}
	}
}
