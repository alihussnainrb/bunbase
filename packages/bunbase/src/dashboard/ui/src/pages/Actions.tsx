import { Shield, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import { type ActionInfo, api } from '../api/client'

function Actions() {
	const [actions, setActions] = useState<ActionInfo[]>([])
	const [loading, setLoading] = useState(true)

	useEffect(() => {
		api
			.getActions()
			.then(setActions)
			.finally(() => setLoading(false))
	}, [])

	if (loading) {
		return (
			<div className="flex items-center justify-center h-64">
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
			</div>
		)
	}

	return (
		<div>
			<h2 className="text-2xl font-bold text-white mb-6">Registered Actions</h2>
			<div className="bg-dark-800 rounded-xl border border-dark-600 overflow-hidden">
				<table className="w-full">
					<thead className="bg-dark-700">
						<tr>
							<th className="px-6 py-4 text-left text-sm font-medium text-gray-400">
								Name
							</th>
							<th className="px-6 py-4 text-left text-sm font-medium text-gray-400">
								Module
							</th>
							<th className="px-6 py-4 text-left text-sm font-medium text-gray-400">
								Triggers
							</th>
							<th className="px-6 py-4 text-left text-sm font-medium text-gray-400">
								Guards
							</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-dark-600">
						{actions.map((action) => (
							<tr key={action.name} className="hover:bg-dark-700/50">
								<td className="px-6 py-4">
									<div className="flex items-center gap-2">
										<Zap className="w-4 h-4 text-primary-500" />
										<span className="text-white font-medium">
											{action.name}
										</span>
									</div>
									{action.description && (
										<p className="text-gray-400 text-sm mt-1">
											{action.description}
										</p>
									)}
								</td>
								<td className="px-6 py-4 text-gray-300">
									{action.module || '-'}
								</td>
								<td className="px-6 py-4">
									<div className="flex gap-2">
										{action.triggers.map((t) => (
											<span
												key={t}
												className="px-2 py-1 bg-dark-700 text-xs rounded text-gray-300"
											>
												{t}
											</span>
										))}
									</div>
								</td>
								<td className="px-6 py-4">
									<div className="flex items-center gap-1 text-gray-300">
										<Shield className="w-4 h-4" />
										<span>{action.guards}</span>
									</div>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	)
}

export default Actions
