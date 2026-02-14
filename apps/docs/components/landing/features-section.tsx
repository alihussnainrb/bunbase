import { Database, Lock, Repeat, Shield, Terminal, Zap } from 'lucide-react'

const features = [
  {
    icon: <Shield className="h-6 w-6" />,
    title: 'Type-safe by Default',
    description: 'Full TypeScript support with automatic database type generation from your PostgreSQL schema.',
  },
  {
    icon: <Lock className="h-6 w-6" />,
    title: 'Built-in Guards',
    description: 'Authentication, authorization, rate limiting, and custom validation out of the box.',
  },
  {
    icon: <Database className="h-6 w-6" />,
    title: 'Fluent Database Client',
    description: 'Type-safe PostgreSQL query builder with autocomplete for tables and columns.',
  },
  {
    icon: <Repeat className="h-6 w-6" />,
    title: 'Automatic Retries',
    description: 'Configurable retry logic with exponential or fixed backoff for external API calls.',
  },
  {
    icon: <Terminal className="h-6 w-6" />,
    title: 'Powerful CLI',
    description: 'Project scaffolding, code generation, migrations, and type generation commands.',
  },
  {
    icon: <Zap className="h-6 w-6" />,
    title: 'Queue & Scheduler',
    description: 'Background jobs, delayed execution, and cron-based scheduling included.',
  },
]

export function FeaturesSection() {
  return (
    <section className="relative overflow-hidden bg-zinc-900 px-6 py-24 md:px-10 md:py-32">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-16 text-center">
          <h2 className="mb-4 font-display text-4xl font-bold text-zinc-50 md:text-5xl">
            Everything You Need
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-zinc-400">
            Batteries included for building production-ready backends
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="group relative rounded-xl border border-white/10 bg-white/5 p-6 transition-all hover:border-cyan-500/30 hover:bg-white/8"
            >
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400 transition-colors group-hover:bg-cyan-500/20">
                {feature.icon}
              </div>
              <h3 className="mb-2 text-lg font-semibold text-zinc-50">
                {feature.title}
              </h3>
              <p className="text-sm text-zinc-400">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
