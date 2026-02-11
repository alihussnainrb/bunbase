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
				Relationships: []
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

			organizations: {
				Row: {
					id: string
					name: string
					slug: string
					owner_id: string
					created_at: string
					updated_at: string
				}
				Insert: {
					id?: string
					name: string
					slug: string
					owner_id: string
					created_at?: string
					updated_at?: string
				}
				Update: Partial<Database['public']['Tables']['organizations']['Insert']>
				Relationships: []
			}

			org_memberships: {
				Row: {
					id: string
					org_id: string
					user_id: string
					role: string
					joined_at: string
				}
				Insert: {
					id?: string
					org_id: string
					user_id: string
					role?: string
					joined_at?: string
				}
				Update: Partial<Database['public']['Tables']['org_memberships']['Insert']>
				Relationships: []
			}

			org_invitations: {
				Row: {
					id: string
					org_id: string
					email: string
					role: string
					invited_by: string
					status: string
					created_at: string
					expires_at: string
				}
				Insert: {
					id?: string
					org_id: string
					email: string
					role?: string
					invited_by: string
					status?: string
					created_at?: string
					expires_at?: string
				}
				Update: Partial<Database['public']['Tables']['org_invitations']['Insert']>
				Relationships: []
			}

			roles: {
				Row: {
					id: string
					key: string
					name: string
					description: string | null
					created_at: string
				}
				Insert: {
					id?: string
					key: string
					name: string
					description?: string | null
					created_at?: string
				}
				Update: Partial<Database['public']['Tables']['roles']['Insert']>
				Relationships: []
			}

			permissions: {
				Row: {
					id: string
					key: string
					name: string
					description: string | null
					created_at: string
				}
				Insert: {
					id?: string
					key: string
					name: string
					description?: string | null
					created_at?: string
				}
				Update: Partial<Database['public']['Tables']['permissions']['Insert']>
				Relationships: []
			}

			role_permissions: {
				Row: {
					role_id: string
					permission_id: string
				}
				Insert: {
					role_id: string
					permission_id: string
				}
				Update: Partial<Database['public']['Tables']['role_permissions']['Insert']>
				Relationships: []
			}

			plans: {
				Row: {
					id: string
					key: string
					name: string
					price_cents: number
					created_at: string
				}
				Insert: {
					id?: string
					key: string
					name: string
					price_cents?: number
					created_at?: string
				}
				Update: Partial<Database['public']['Tables']['plans']['Insert']>
				Relationships: []
			}

			features: {
				Row: {
					id: string
					key: string
					name: string
					description: string | null
				}
				Insert: {
					id?: string
					key: string
					name: string
					description?: string | null
				}
				Update: Partial<Database['public']['Tables']['features']['Insert']>
				Relationships: []
			}

			plan_features: {
				Row: {
					plan_id: string
					feature_id: string
				}
				Insert: {
					plan_id: string
					feature_id: string
				}
				Update: Partial<Database['public']['Tables']['plan_features']['Insert']>
				Relationships: []
			}

			subscriptions: {
				Row: {
					id: string
					org_id: string
					plan_key: string
					status: string
					current_period_end: string
					created_at: string
					updated_at: string
				}
				Insert: {
					id?: string
					org_id: string
					plan_key: string
					status?: string
					current_period_end: string
					created_at?: string
					updated_at?: string
				}
				Update: Partial<Database['public']['Tables']['subscriptions']['Insert']>
				Relationships: []
			}

			action_runs: {
				Row: {
					id: string
					action_name: string
					module_name: string | null
					trace_id: string
					trigger_type: string
					status: string
					input: string | null
					output: string | null
					error: string | null
					duration_ms: number
					started_at: number
					created_at: string
				}
				Insert: {
					id?: string
					action_name: string
					module_name?: string | null
					trace_id: string
					trigger_type: string
					status: string
					input?: string | null
					output?: string | null
					error?: string | null
					duration_ms: number
					started_at: number
					created_at?: string
				}
				Update: Partial<Database['public']['Tables']['action_runs']['Insert']>
				Relationships: []
			}

			action_logs: {
				Row: {
					id: string
					run_id: string
					level: string
					message: string
					meta: string | null
					created_at: number
				}
				Insert: {
					id?: string
					run_id: string
					level: string
					message: string
					meta?: string | null
					created_at: number
				}
				Update: Partial<Database['public']['Tables']['action_logs']['Insert']>
				Relationships: []
			}

			job_queue: {
				Row: {
					id: string
					name: string
					data: string
					status: string
					priority: number
					attempts: number
					max_attempts: number
					run_at: string
					last_error: string | null
					trace_id: string | null
					created_at: string
					updated_at: string
				}
				Insert: {
					id?: string
					name: string
					data?: string
					status?: string
					priority?: number
					attempts?: number
					max_attempts?: number
					run_at?: string
					last_error?: string | null
					trace_id?: string | null
					created_at?: string
					updated_at?: string
				}
				Update: Partial<Database['public']['Tables']['job_queue']['Insert']>
				Relationships: []
			}

			job_failures: {
				Row: {
					id: string
					name: string
					data: string
					error: string
					attempts: number
					failed_at: string
					trace_id: string | null
				}
				Insert: {
					id: string
					name: string
					data: string
					error: string
					attempts: number
					failed_at?: string
					trace_id?: string | null
				}
				Update: Partial<Database['public']['Tables']['job_failures']['Insert']>
				Relationships: []
			}

			kv_store: {
				Row: {
					key: string
					value: unknown
					expires_at: string | null
				}
				Insert: {
					key: string
					value: unknown
					expires_at?: string | null
				}
				Update: Partial<Database['public']['Tables']['kv_store']['Insert']>
				Relationships: []
			}
		}

		Views: {}
		Functions: {}
		Enums: {}
		Composites: {}
	}
}
