import { Clock, LayoutDashboard, PlayCircle, Settings, Zap } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'

interface LayoutProps {
	children: ReactNode
}

function Layout({ children }: LayoutProps) {
	const location = useLocation()

	const navItems = [
		{ path: '/', label: 'Overview', icon: LayoutDashboard },
		{ path: '/actions', label: 'Actions', icon: Zap },
		{ path: '/runs', label: 'Runs', icon: PlayCircle },
		{ path: '/jobs', label: 'Jobs', icon: Clock },
	]

	return (
		<div className="min-h-screen bg-dark-900 text-gray-100">
			{/* Header */}
			<header className="bg-dark-800 border-b border-dark-600">
				<div className="px-6 py-4 flex items-center justify-between">
					<div className="flex items-center gap-3">
						<div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center">
							<span className="text-white font-bold text-sm">B</span>
						</div>
						<h1 className="text-xl font-semibold text-white">
							Bunbase Dashboard
						</h1>
					</div>
					<button className="p-2 hover:bg-dark-700 rounded-lg transition-colors">
						<Settings className="w-5 h-5" />
					</button>
				</div>
			</header>

			<div className="flex">
				{/* Sidebar */}
				<aside className="w-64 bg-dark-800 border-r border-dark-600 min-h-[calc(100vh-73px)]">
					<nav className="p-4 space-y-1">
						{navItems.map((item) => {
							const Icon = item.icon
							const isActive = location.pathname === item.path
							return (
								<Link
									key={item.path}
									to={item.path}
									className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
										isActive
											? 'bg-primary-600 text-white'
											: 'text-gray-400 hover:bg-dark-700 hover:text-white'
									}`}
								>
									<Icon className="w-5 h-5" />
									<span className="font-medium">{item.label}</span>
								</Link>
							)
						})}
					</nav>
				</aside>

				{/* Main Content */}
				<main className="flex-1 p-6 overflow-auto">{children}</main>
			</div>
		</div>
	)
}

export default Layout
