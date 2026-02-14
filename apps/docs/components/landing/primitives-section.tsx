import { Code2, Package, Zap } from 'lucide-react'
import { BentoGrid, BentoGridItem } from '../ui/bento-grid'

const features = [
  {
    icon: <Zap className="h-8 w-8 text-orange-400" />,
    title: 'Actions',
    description: 'Validated, reusable functions with input/output schemas, guards, and automatic OpenAPI documentation. The atomic units of your backend.',
    className: 'lg:col-span-2',
  },
  {
    icon: <Package className="h-8 w-8 text-green-400" />,
    title: 'Modules',
    description: 'Group related actions with shared configuration, guards, and API prefixes. Keep your code organized and DRY.',
    className: 'lg:col-span-1',
  },
  {
    icon: <Code2 className="h-8 w-8 text-blue-400" />,
    title: 'Triggers',
    description: 'Connect actions to HTTP APIs, cron schedules, webhooks, events, or MCP tools. One action, multiple entry points.',
    className: 'lg:col-span-1',
  },
]

export function PrimitivesSection() {
  return (
    <section className="relative overflow-hidden bg-zinc-950 px-6 py-24 md:px-10 md:py-32">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-16 text-center">
          <h2 className="mb-4 font-display text-4xl font-bold text-zinc-50 md:text-5xl lg:text-6xl">
            Three Core Primitives
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-zinc-400">
            Simple building blocks that compose into powerful, type-safe backends
          </p>
        </div>

        {/* Bento Grid */}
        <BentoGrid>
          {features.map((feature) => (
            <BentoGridItem
              key={feature.title}
              title={feature.title}
              description={feature.description}
              icon={feature.icon}
              className={feature.className}
            />
          ))}
        </BentoGrid>
      </div>
    </section>
  )
}
