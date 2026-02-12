/**
 * Transport Metadata Examples
 *
 * Demonstrates the unified _meta transport metadata system that works across
 * all trigger types: HTTP, MCP Tools, Events, and Cron.
 */

import { action, guards, t, triggers, withMeta } from 'bunbase'

// ═══════════════════════════════════════════════════════════
// HTTP Transport Metadata Examples
// ═══════════════════════════════════════════════════════════

/**
 * Example 1: HTTP - Custom Status Code (201 Created)
 */
export const createUser = action(
	{
		name: 'users.create',
		description: 'Create a new user - returns 201 Created',
		input: t.Object({
			email: t.String({ format: 'email' }),
			name: t.String(),
		}),
		output: t.Object({
			id: t.String(),
			email: t.String(),
			name: t.String(),
		}),
		triggers: [triggers.api('POST', '/users')],
	},
	async (input, ctx) => {
		const user = await ctx.db.from('users').insert({
			email: input.email,
			name: input.name,
			password_hash: 'temp',
		})

		// Use withMeta helper for clean syntax
		return withMeta(
			{
				id: user.id,
				email: user.email,
				name: user.name,
			},
			{
				http: {
					status: 201,
					headers: {
						Location: `/users/${user.id}`,
					},
				},
			},
		)
	},
)

/**
 * Example 2: HTTP - File Download with Headers
 */
export const downloadFile = action(
	{
		name: 'files.download',
		description: 'Download a file with custom headers',
		input: t.Object({
			fileId: t.String(),
		}),
		output: t.Object({
			content: t.String(),
			filename: t.String(),
		}),
		triggers: [triggers.api('GET', '/files/:fileId/download')],
		guards: [guards.authenticated()],
	},
	async (input, ctx) => {
		const file = await ctx.storage.get(`files/${input.fileId}`)
		const filename = `report-${input.fileId}.pdf`

		return withMeta(
			{
				content: file.toString('base64'),
				filename,
			},
			{
				http: {
					headers: {
						'Content-Type': 'application/pdf',
						'Content-Disposition': `attachment; filename="${filename}"`,
						'Cache-Control': 'no-cache',
						'X-File-Size': file.length.toString(),
					},
				},
			},
		)
	},
)

/**
 * Example 3: HTTP - Set Secure Cookies
 */
export const login = action(
	{
		name: 'auth.login',
		description: 'Login and set secure session cookie',
		input: t.Object({
			email: t.String({ format: 'email' }),
			password: t.String(),
		}),
		output: t.Object({
			success: t.Boolean(),
			userId: t.String(),
		}),
		triggers: [triggers.api('POST', '/auth/login')],
	},
	async (input, ctx) => {
		// Authenticate user (simplified)
		const user = await ctx.db.from('users').eq('email', input.email).single()

		if (!user) {
			throw new Error('Invalid credentials')
		}

		const sessionToken = 'generated-token-here'

		return withMeta(
			{
				success: true,
				userId: user.id,
			},
			{
				http: {
					cookies: [
						{
							name: 'session',
							value: sessionToken,
							httpOnly: true,
							secure: true,
							sameSite: 'strict',
							maxAge: 60 * 60 * 24 * 7, // 7 days
							path: '/',
						},
					],
				},
			},
		)
	},
)

/**
 * Example 4: HTTP - 302 Redirect
 */
export const shortenedUrl = action(
	{
		name: 'urls.redirect',
		description: 'Redirect to original URL',
		input: t.Object({
			shortCode: t.String(),
		}),
		output: t.Object({
			url: t.String(),
		}),
		triggers: [triggers.api('GET', '/r/:shortCode')],
	},
	async (input, ctx) => {
		const link = await ctx.db
			.from('shortened_urls')
			.eq('short_code', input.shortCode)
			.single()

		if (!link) {
			return withMeta({ url: '' }, { http: { status: 404 } })
		}

		return withMeta(
			{ url: link.original_url },
			{
				http: {
					status: 302,
					headers: {
						Location: link.original_url,
					},
				},
			},
		)
	},
)

// ═══════════════════════════════════════════════════════════
// MCP Tool Transport Metadata Examples
// ═══════════════════════════════════════════════════════════

/**
 * Example 5: MCP - Structured Output with Schema
 */
export const analyzeData = action(
	{
		name: 'mcp.analyze',
		description: 'Analyze data with structured MCP output',
		input: t.Object({
			data: t.String(),
		}),
		output: t.Object({
			summary: t.String(),
			insights: t.Array(t.String()),
			score: t.Number(),
		}),
		triggers: [
			{
				type: 'tool',
				name: 'analyze',
				description: 'Analyze text data',
			},
		],
	},
	async (input, _ctx) => {
		// Simplified analysis
		return withMeta(
			{
				summary: `Analysis of: ${input.data}`,
				insights: ['Insight 1', 'Insight 2'],
				score: 8.5,
			},
			{
				mcp: {
					format: 'structured',
					includeSchema: true,
				},
			},
		)
	},
)

/**
 * Example 6: MCP - Text Format Output
 */
export const summarize = action(
	{
		name: 'mcp.summarize',
		description: 'Summarize text in plain format',
		input: t.Object({
			text: t.String(),
		}),
		output: t.Object({
			summary: t.String(),
		}),
		triggers: [
			{
				type: 'tool',
				name: 'summarize',
				description: 'Summarize long text',
			},
		],
	},
	async (input, _ctx) => {
		return withMeta(
			{
				summary: `Summary: ${input.text.slice(0, 100)}...`,
			},
			{
				mcp: {
					format: 'text', // Return as plain text instead of JSON
				},
			},
		)
	},
)

// ═══════════════════════════════════════════════════════════
// Event Transport Metadata Examples
// ═══════════════════════════════════════════════════════════

/**
 * Example 7: Event - Priority Emission
 */
export const criticalAlert = action(
	{
		name: 'alerts.critical',
		description: 'Send critical alert with high priority',
		input: t.Object({
			message: t.String(),
			severity: t.String(),
		}),
		output: t.Object({
			alerted: t.Boolean(),
			notifiedCount: t.Number(),
		}),
		triggers: [triggers.event('alert.critical')],
	},
	async (input, ctx) => {
		// Send notifications to admins
		ctx.logger.error(`CRITICAL ALERT: ${input.message}`)

		return withMeta(
			{
				alerted: true,
				notifiedCount: 5,
			},
			{
				event: {
					priority: 100, // Highest priority
					broadcast: true, // Send to all listeners
				},
			},
		)
	},
)

/**
 * Example 8: Event - Delayed Emission
 */
export const scheduleReminder = action(
	{
		name: 'reminders.schedule',
		description: 'Schedule a reminder with delay',
		input: t.Object({
			message: t.String(),
			delayMinutes: t.Number(),
		}),
		output: t.Object({
			scheduled: t.Boolean(),
		}),
		triggers: [triggers.event('reminder.schedule')],
	},
	async (input, _ctx) => {
		return withMeta(
			{
				scheduled: true,
			},
			{
				event: {
					delay: input.delayMinutes * 60 * 1000, // Convert to milliseconds
					priority: 5,
				},
			},
		)
	},
)

// ═══════════════════════════════════════════════════════════
// Cron Transport Metadata Examples
// ═══════════════════════════════════════════════════════════

/**
 * Example 9: Cron - Dynamic Rescheduling
 */
export const adaptiveBackup = action(
	{
		name: 'backup.adaptive',
		description: 'Backup with dynamic scheduling based on load',
		input: t.Object({}),
		output: t.Object({
			completed: t.Boolean(),
			nextSchedule: t.String(),
		}),
		triggers: [
			{
				type: 'cron',
				schedule: '0 2 * * *', // Default: 2 AM daily
			},
		],
	},
	async (_input, ctx) => {
		// Perform backup
		ctx.logger.info('Running adaptive backup...')

		// Check system load (simplified)
		const systemLoad = Math.random()
		const highLoad = systemLoad > 0.7

		// If system is under high load, reschedule to quieter time
		const nextSchedule = highLoad ? '0 4 * * *' : '0 2 * * *'

		return withMeta(
			{
				completed: true,
				nextSchedule,
			},
			{
				cron: {
					reschedule: nextSchedule,
				},
			},
		)
	},
)

/**
 * Example 10: Cron - One-Time Execution
 */
export const initializeSystem = action(
	{
		name: 'system.initialize',
		description: 'Initialize system (runs once)',
		input: t.Object({}),
		output: t.Object({
			initialized: t.Boolean(),
		}),
		triggers: [
			{
				type: 'cron',
				schedule: '*/5 * * * *', // Every 5 minutes (will stop after first run)
			},
		],
	},
	async (_input, ctx) => {
		// Perform one-time initialization
		ctx.logger.info('Initializing system...')

		return withMeta(
			{
				initialized: true,
			},
			{
				cron: {
					runOnce: true, // Stop after this execution
				},
			},
		)
	},
)

// ═══════════════════════════════════════════════════════════
// Multi-Trigger Examples
// ═══════════════════════════════════════════════════════════

/**
 * Example 11: Multi-Trigger - Works with HTTP and MCP
 */
export const processData = action(
	{
		name: 'data.process',
		description: 'Process data (HTTP API and MCP tool)',
		input: t.Object({
			data: t.String(),
		}),
		output: t.Object({
			processed: t.Boolean(),
			result: t.String(),
		}),
		triggers: [
			triggers.api('POST', '/process'),
			{
				type: 'tool',
				name: 'process',
				description: 'Process data',
			},
		],
		guards: [guards.authenticated()],
	},
	async (input, _ctx) => {
		// Process data
		const result = input.data.toUpperCase()

		// Return with metadata for both trigger types
		return withMeta(
			{
				processed: true,
				result,
			},
			{
				http: {
					status: 201,
					headers: {
						'X-Processing-Time': '42ms',
					},
				},
				mcp: {
					format: 'structured',
					includeSchema: false,
				},
			},
		)
	},
)

/**
 * Example 12: Complex Multi-Trigger with All Metadata
 */
export const universalAction = action(
	{
		name: 'universal.action',
		description: 'Universal action with metadata for all trigger types',
		input: t.Object({
			operation: t.String(),
		}),
		output: t.Object({
			success: t.Boolean(),
			message: t.String(),
		}),
		triggers: [
			triggers.api('POST', '/universal'),
			triggers.event('universal.trigger'),
			{
				type: 'cron',
				schedule: '0 */6 * * *', // Every 6 hours
			},
			{
				type: 'tool',
				name: 'universal',
				description: 'Universal operation',
			},
		],
	},
	async (input, ctx) => {
		ctx.logger.info(`Universal action: ${input.operation}`)

		// Return data with metadata for ALL trigger types
		return withMeta(
			{
				success: true,
				message: `Completed: ${input.operation}`,
			},
			{
				http: {
					status: 200,
					headers: {
						'X-Operation': input.operation,
					},
				},
				mcp: {
					format: 'json',
				},
				event: {
					broadcast: true,
					priority: 10,
				},
				cron: {
					// Adaptive: if operation takes too long, reduce frequency
					reschedule: '0 */12 * * *', // Every 12 hours
				},
			},
		)
	},
)
