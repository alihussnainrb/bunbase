import { ArrowRight, Blocks, ShieldCheck, Sparkles, Workflow, Zap } from 'lucide-react'
import { IBM_Plex_Mono, Syne } from 'next/font/google'
import Link from 'next/link'
import styles from './page.module.css'

const display = Syne({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
})

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
})

const badges = ['actions', 'guards', 'oauth', 'orgs', 'billing', 'otlp']

const features = [
  {
    icon: Workflow,
    title: 'Action Fabric',
    text: 'One action can power HTTP, event bus, queues, cron, and internal tooling without duplicate logic.',
  },
  {
    icon: ShieldCheck,
    title: 'Policy Surface',
    text: 'Tenant-aware guards run consistently so platform security boundaries are explicit and auditable.',
  },
  {
    icon: Blocks,
    title: 'Platform Modules',
    text: 'Compose users, orgs, subscriptions, and entitlements as backend primitives under `ctx.platform`.',
  },
]

export default function NebulaLandingPage() {
  return (
    <main className={styles.page}>
      <div className={styles.grid} aria-hidden />
      <div className={styles.glowA} aria-hidden />
      <div className={styles.glowB} aria-hidden />
      <div className={styles.beam} aria-hidden />

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 pb-16 pt-8 md:px-10">
        <header className={styles.nav}>
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-cyan-300/18 text-cyan-200">
              <Sparkles size={15} />
            </span>
            <span className={`${display.className} text-sm font-semibold tracking-wide text-zinc-100`}>Bunbase</span>
          </div>

          <nav className="hidden items-center gap-2 md:flex">
            <Link href="/" className={styles.ghostButton}>
              Variant Hub
            </Link>
            <Link href="/landing/next" className={styles.ghostButton}>
              Next Rhythm
            </Link>
            <Link href="/docs" className={styles.primaryButton}>
              Start
              <ArrowRight size={14} />
            </Link>
          </nav>
        </header>

        <section className="mt-16 text-center">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-cyan-200/30 bg-cyan-300/10 px-3 py-1 text-xs tracking-wide text-cyan-100">
            <Zap size={13} />
            Aceternity-inspired cinematic layout
          </p>

          <h1
            className={`${display.className} mx-auto mt-6 max-w-4xl text-balance text-5xl leading-tight text-zinc-50 md:text-7xl`}
          >
            Engineer your product backend as a single runtime constellation.
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-300">
            Bunbase links triggers, execution policies, and SaaS platform modules into one coherent action graph.
          </p>

          <div className={`${styles.command} ${mono.className} mx-auto mt-10 max-w-2xl`}>
            <span className="text-zinc-500">$</span>
            <span className="text-zinc-100">bun add bunbase</span>
            <Link href="/docs" className="ml-auto inline-flex items-center gap-1 text-cyan-200 hover:text-cyan-100">
              docs
              <ArrowRight size={12} />
            </Link>
          </div>

          <div className="mx-auto mt-5 flex max-w-2xl flex-wrap items-center justify-center gap-2">
            {badges.map((badge) => (
              <span key={badge} className={`${mono.className} ${styles.badge}`}>
                {badge}
              </span>
            ))}
          </div>
        </section>

        <section className="mt-16 grid gap-4 md:grid-cols-3">
          {features.map(({ icon: Icon, title, text }) => (
            <article key={title} className={styles.card}>
              <span className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-amber-300/18 text-amber-100">
                <Icon size={18} />
              </span>
              <h2 className={`${display.className} text-2xl text-zinc-50`}>{title}</h2>
              <p className="mt-3 text-zinc-300">{text}</p>
            </article>
          ))}
        </section>

        <section className={`${styles.panel} mt-16 grid gap-6 p-6 md:grid-cols-[1.05fr_0.95fr] md:p-8`}>
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-cyan-100/90">Runtime sequence</p>
            <h3 className={`${display.className} mt-3 text-3xl text-zinc-50`}>Action → Guard → Context → Transport</h3>
            <p className="mt-3 max-w-xl text-zinc-300">
              Keep business logic centralized and route it through every channel with deterministic policy checks.
            </p>
          </div>

          <pre className={`${mono.className} ${styles.codeBlock}`}>
            <code>{`export const createSubscription = action({
  name: 'billing.createSubscription',
  triggers: [triggers.api('POST', '/billing/subscriptions')],
  guards: [
    guards.authenticated(),
    guards.platform.can('billing.write'),
  ],
}, async (input, ctx) => {
  const org = await ctx.platform.orgs.require()
  return ctx.platform.billing.subscriptions.create({
    orgId: org.id,
    ...input,
  })
})`}</code>
          </pre>
        </section>
      </div>
    </main>
  )
}
