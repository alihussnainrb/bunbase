import { useEffect, useState } from 'react'
import { api, type Stats } from '../api/client'
import { Activity, Zap, Clock, AlertCircle } from 'lucide-react'

function Overview() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getStats().then(setStats).finally(() => setLoading(false))
    const interval = setInterval(() => {
      api.getStats().then(setStats)
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  const statCards = [
    { label: 'Actions', value: stats?.actions ?? 0, icon: Zap, color: 'bg-blue-500' },
    { label: 'Total Runs', value: stats?.runs ?? 0, icon: Activity, color: 'bg-green-500' },
    { label: 'Pending Jobs', value: stats?.jobs ?? 0, icon: Clock, color: 'bg-yellow-500' },
    { label: 'Errors (24h)', value: stats?.errors ?? 0, icon: AlertCircle, color: 'bg-red-500' },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-6">Overview</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((card) => {
          const Icon = card.icon
          return (
            <div key={card.label} className="bg-dark-800 rounded-xl p-6 border border-dark-600">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">{card.label}</p>
                  <p className="text-3xl font-bold text-white mt-2">{card.value}</p>
                </div>
                <div className={`${card.color} p-3 rounded-lg`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default Overview
