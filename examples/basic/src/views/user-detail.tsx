// Example view using HTMX - pages/users/[id].tsx

import { guards, t, view } from 'bunbase'

// Define URL parameter schema (UUID validation)
const ParamsSchema = t.Object({
	id: t.String({
		pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
		description: 'User UUID',
	}),
})

// Define query parameter schema
const QuerySchema = t.Object({
	tab: t.Optional(
		t.Union([
			t.Literal('profile'),
			t.Literal('settings'),
			t.Literal('activity'),
		]),
	),
	page: t.Optional(t.Number({ minimum: 1 })),
})

// The view definition
export const userDetailView = view({
	name: 'user-detail',
	path: '/users/:id',
	paramsSchema: ParamsSchema,
	querySchema: QuerySchema,
	guards: [guards.authenticated()], // Same guards as actions
	render: async (input, ctx) => {
		// input.params is typed: { id: string }
		// input.query is typed: { tab?: 'profile' | 'settings' | 'activity'; page?: number }

		// Mock user data (in real app, fetch from database)
		const user = await ctx.db
			?.query('SELECT * FROM users WHERE id = $1', [input.params.id])
			.then((r) => r[0])

		if (!user) {
			return (
				<div className="min-h-screen bg-gray-50 flex items-center justify-center">
					<div className="bg-white p-8 rounded-lg shadow-md">
						<h1 className="text-2xl font-bold text-gray-900 mb-4">
							User Not Found
						</h1>
						<p className="text-gray-600">
							The user you're looking for doesn't exist.
						</p>
						<a
							href="/users"
							className="mt-4 inline-block bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
						>
							Back to Users
						</a>
					</div>
				</div>
			)
		}

		const tab = input.query.tab ?? 'profile'

		return (
			<div className="min-h-screen bg-gray-50">
				{/* Header */}
				<div className="bg-white shadow">
					<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
						<div className="py-6">
							<nav className="flex" aria-label="Breadcrumb">
								<ol className="flex items-center space-x-4">
									<li>
										<a href="/" className="text-gray-400 hover:text-gray-500">
											<span>Home</span>
										</a>
									</li>
									<li>
										<span className="text-gray-400">/</span>
									</li>
									<li>
										<a
											href="/users"
											className="text-gray-400 hover:text-gray-500"
										>
											<span>Users</span>
										</a>
									</li>
									<li>
										<span className="text-gray-400">/</span>
									</li>
									<li>
										<span className="text-gray-900">{user.name}</span>
									</li>
								</ol>
							</nav>
						</div>
					</div>
				</div>

				{/* Main Content */}
				<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
					<div className="bg-white shadow rounded-lg">
						{/* User Header */}
						<div className="px-6 py-8 border-b border-gray-200">
							<div className="flex items-center">
								<div className="flex-shrink-0">
									<div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center">
										<span className="text-white text-xl font-bold">
											{user.name.charAt(0).toUpperCase()}
										</span>
									</div>
								</div>
								<div className="ml-6">
									<h1 className="text-3xl font-bold text-gray-900">
										{user.name}
									</h1>
									<p className="text-gray-600">{user.email}</p>
									<p className="text-sm text-gray-500 mt-1">
										Member since{' '}
										{new Date(user.created_at).toLocaleDateString()}
									</p>
								</div>
							</div>
						</div>

						{/* Tab Navigation */}
						<div className="border-b border-gray-200">
							<nav className="-mb-px flex space-x-8 px-6">
								<a
									href={`/users/${input.params.id}?tab=profile`}
									className={`py-4 px-1 border-b-2 font-medium text-sm ${
										tab === 'profile'
											? 'border-blue-500 text-blue-600'
											: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
									}`}
									hx-get={`/users/${input.params.id}?tab=profile`}
									hx-target="#tab-content"
									hx-swap="innerHTML"
								>
									Profile
								</a>
								<a
									href={`/users/${input.params.id}?tab=settings`}
									className={`py-4 px-1 border-b-2 font-medium text-sm ${
										tab === 'settings'
											? 'border-blue-500 text-blue-600'
											: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
									}`}
									hx-get={`/users/${input.params.id}?tab=settings`}
									hx-target="#tab-content"
									hx-swap="innerHTML"
								>
									Settings
								</a>
								<a
									href={`/users/${input.params.id}?tab=activity`}
									className={`py-4 px-1 border-b-2 font-medium text-sm ${
										tab === 'activity'
											? 'border-blue-500 text-blue-600'
											: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
									}`}
									hx-get={`/users/${input.params.id}?tab=activity`}
									hx-target="#tab-content"
									hx-swap="innerHTML"
								>
									Activity
								</a>
							</nav>
						</div>

						{/* Tab Content */}
						<div id="tab-content" className="p-6">
							{tab === 'profile' && <ProfileTab user={user} />}
							{tab === 'settings' && <SettingsTab user={user} />}
							{tab === 'activity' && (
								<ActivityTab user={user} page={input.query.page ?? 1} />
							)}
						</div>
					</div>
				</div>
			</div>
		)
	},
})

// Tab Components
function ProfileTab({ user }: { user: any }) {
	return (
		<div>
			<h2 className="text-xl font-semibold text-gray-900 mb-4">
				Profile Information
			</h2>
			<div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
				<div>
					<label className="block text-sm font-medium text-gray-700">
						Full Name
					</label>
					<p className="mt-1 text-sm text-gray-900">{user.name}</p>
				</div>
				<div>
					<label className="block text-sm font-medium text-gray-700">
						Email
					</label>
					<p className="mt-1 text-sm text-gray-900">{user.email}</p>
				</div>
				<div>
					<label className="block text-sm font-medium text-gray-700">
						Role
					</label>
					<p className="mt-1 text-sm text-gray-900">{user.role || 'User'}</p>
				</div>
				<div>
					<label className="block text-sm font-medium text-gray-700">
						Status
					</label>
					<span
						className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
							user.active
								? 'bg-green-100 text-green-800'
								: 'bg-red-100 text-red-800'
						}`}
					>
						{user.active ? 'Active' : 'Inactive'}
					</span>
				</div>
			</div>
		</div>
	)
}

function SettingsTab({ user }: { user: any }) {
	return (
		<div>
			<h2 className="text-xl font-semibold text-gray-900 mb-4">
				Account Settings
			</h2>
			<form
				hx-post={`/api/users/${user.id}/settings`}
				hx-target="#settings-result"
				hx-swap="innerHTML"
				className="space-y-6"
			>
				<div>
					<label
						htmlFor="name"
						className="block text-sm font-medium text-gray-700"
					>
						Full Name
					</label>
					<input
						type="text"
						name="name"
						id="name"
						defaultValue={user.name}
						className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
					/>
				</div>

				<div>
					<label
						htmlFor="email"
						className="block text-sm font-medium text-gray-700"
					>
						Email
					</label>
					<input
						type="email"
						name="email"
						id="email"
						defaultValue={user.email}
						className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
					/>
				</div>

				<div>
					<button
						type="submit"
						className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
					>
						Save Changes
					</button>
				</div>

				<div id="settings-result"></div>
			</form>
		</div>
	)
}

function ActivityTab({ user, page }: { user: any; page: number }) {
	// Mock activity data
	const activities = [
		{ id: 1, action: 'Logged in', timestamp: new Date().toISOString() },
		{
			id: 2,
			action: 'Updated profile',
			timestamp: new Date(Date.now() - 86400000).toISOString(),
		},
		{
			id: 3,
			action: 'Changed password',
			timestamp: new Date(Date.now() - 172800000).toISOString(),
		},
	]

	return (
		<div>
			<h2 className="text-xl font-semibold text-gray-900 mb-4">
				Recent Activity
			</h2>
			<div className="space-y-4">
				{activities.map((activity) => (
					<div
						key={activity.id}
						className="flex items-center justify-between py-3 border-b border-gray-200"
					>
						<div>
							<p className="text-sm font-medium text-gray-900">
								{activity.action}
							</p>
							<p className="text-sm text-gray-500">
								{new Date(activity.timestamp).toLocaleString()}
							</p>
						</div>
					</div>
				))}
			</div>

			{/* Pagination */}
			<div className="mt-6 flex justify-between">
				<button
					disabled={page <= 1}
					className="bg-gray-200 text-gray-700 px-3 py-1 rounded disabled:opacity-50"
					hx-get={`/users/${user.id}?tab=activity&page=${page - 1}`}
					hx-target="#tab-content"
					hx-swap="innerHTML"
				>
					Previous
				</button>
				<span className="text-sm text-gray-700">Page {page}</span>
				<button
					className="bg-gray-200 text-gray-700 px-3 py-1 rounded"
					hx-get={`/users/${user.id}?tab=activity&page=${page + 1}`}
					hx-target="#tab-content"
					hx-swap="innerHTML"
				>
					Next
				</button>
			</div>
		</div>
	)
}
