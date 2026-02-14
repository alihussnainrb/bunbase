import { Database, Lock, Radio, RefreshCw, Shield, Terminal } from 'lucide-react'
import type React from 'react'

const features: FeatureCardProps[] = [
  {
    icon: <Shield className="h-5 w-5" />,
    title: 'Type-safe by Default',
    description:
      'Full TypeScript inference from database schema to API response. Catch every error at compile time.',
    codeLines: [
      { text: 'const user = await ctx.db', dim: false },
      { text: '  .from(\'users\')', dim: false },
      { text: '  .where(\'id\', userId)', dim: false },
      { text: '  .single()', dim: false },
      { text: '// user is fully typed ✓', dim: true },
    ],
    accentColor: '#22d3ee',
    className: 'lg:col-span-2',
  },
  {
    icon: <Lock className="h-5 w-5" />,
    title: 'Guards & Middleware',
    description:
      'Stack authentication, rate limiting, and custom validation at action or module level.',
    codeLines: [
      { text: 'guards: [', dim: false },
      { text: '  authenticated(),', dim: false },
      { text: '  rateLimit(100),', dim: false },
      { text: '  hasRole(\'admin\')', dim: false },
      { text: ']', dim: false },
    ],
    accentColor: '#a78bfa',
    className: 'lg:col-span-1',
  },
  {
    icon: <Database className="h-5 w-5" />,
    title: 'Fluent Database Client',
    description:
      'Type-safe PostgreSQL queries with a chainable API. Autocomplete for tables, columns, and joins.',
    codeLines: [
      { text: 'ctx.db.from(\'orders\')', dim: false },
      { text: '  .where(\'status\', \'pending\')', dim: false },
      { text: '  .orderBy(\'created_at\', \'desc\')', dim: false },
      { text: '  .limit(10)', dim: false },
    ],
    accentColor: '#34d399',
    className: 'lg:col-span-1',
  },
  {
    icon: <Radio className="h-5 w-5" />,
    title: 'Queue & Events',
    description:
      'Background jobs with retry logic, pub/sub event bus, and cron scheduling. All built in, no external deps.',
    codeLines: [
      { text: 'ctx.events.emit(\'order.paid\', order)', dim: false },
      { text: 'ctx.queue.push(\'sendEmail\', {', dim: false },
      { text: '  to: user.email', dim: false },
      { text: '})', dim: false },
    ],
    accentColor: '#fbbf24',
    className: 'lg:col-span-2',
  },
  {
    icon: <Terminal className="h-5 w-5" />,
    title: 'Powerful CLI',
    description:
      'Scaffold projects, generate code, run migrations, and start the dev server from one command.',
    codeLines: [
      { text: '$ bunbase init my-app', dim: false },
      { text: '$ bunbase generate action', dim: false },
      { text: '$ bunbase migrate', dim: false },
      { text: '$ bunbase dev', dim: false },
    ],
    accentColor: '#60a5fa',
    className: 'lg:col-span-2',
  },
  {
    icon: <RefreshCw className="h-5 w-5" />,
    title: 'Automatic Retries',
    description:
      'Configurable retry strategies with exponential or fixed backoff for resilient external calls.',
    codeLines: [
      { text: 'retry: {', dim: false },
      { text: '  attempts: 3,', dim: false },
      { text: '  backoff: \'exponential\'', dim: false },
      { text: '}', dim: false },
    ],
    accentColor: '#fb7185',
    className: 'lg:col-span-1',
  },
]

export function FeaturesSection() {
  return (
    <section className="relative overflow-hidden py-32 md:py-44">
      {/* Section background */}
      <div className="absolute inset-0 bg-gradient-to-b from-zinc-950 via-zinc-900/50 to-zinc-950" />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `radial-gradient(ellipse 50% 60% at 50% 0%, rgba(34, 211, 238, 0.04) 0%, transparent 70%)`,
        }}
      />

      <div className="relative mx-auto max-w-7xl px-6 md:px-10">
        {/* Section Header */}
        <div className="mb-20 text-center">
          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400">
            Developer Experience
          </p>
          <h2 className="font-display text-4xl font-bold text-zinc-50 md:text-5xl lg:text-6xl">
            Batteries included
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg text-zinc-500">
            Everything you need for production-ready backends, nothing you don&apos;t
          </p>
        </div>

        {/* Feature Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─── Feature Card ─── */

type CodeLine = { text: string; dim: boolean }

type FeatureCardProps = {
  icon: React.ReactNode
  title: string
  description: string
  codeLines: CodeLine[]
  accentColor: string
  className?: string
}

function FeatureCard({
  icon,
  title,
  description,
  codeLines,
  accentColor,
  className = '',
}: FeatureCardProps) {
  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-b from-zinc-900/80 to-zinc-950/80 p-8 transition-all duration-500 hover:border-white/[0.12] hover:shadow-2xl ${className}`}
      style={{ '--card-accent': accentColor } as React.CSSProperties}
    >
      {/* Gradient accent line at top */}
      <div
        className="absolute inset-x-0 top-0 h-px opacity-50 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background: `linear-gradient(to right, transparent, ${accentColor}, transparent)`,
        }}
      />

      {/* Glow on hover */}
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-0 blur-[80px] transition-opacity duration-700 group-hover:opacity-100"
        style={{ backgroundColor: `${accentColor}15` }}
      />

      {/* Icon */}
      <div className="relative mb-6 inline-flex">
        <div
          className="absolute inset-0 rounded-xl opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-100"
          style={{ backgroundColor: `${accentColor}25` }}
        />
        <div className="relative flex h-12 w-12 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03]">
          <div style={{ color: accentColor }}>{icon}</div>
        </div>
      </div>

      {/* Content */}
      <h3 className="mb-3 text-lg font-semibold text-zinc-100">{title}</h3>
      <p className="mb-6 text-sm leading-relaxed text-zinc-500">{description}</p>

      {/* Code hint */}
      <div className="overflow-hidden rounded-xl border border-white/[0.04] bg-zinc-950/60 p-4">
        <pre className="font-mono text-xs leading-6">
          <code>
            {codeLines.map((line, i) => (
              <span
                key={i}
                className={line.dim ? 'text-zinc-600' : 'text-zinc-400'}
              >
                {line.text}
                {i < codeLines.length - 1 ? '\n' : ''}
              </span>
            ))}
          </code>
        </pre>
      </div>
    </div>
  )
}
