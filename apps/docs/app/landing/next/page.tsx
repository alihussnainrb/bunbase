import { ArrowRight, Check, CirclePlay, Sparkles } from 'lucide-react'
import { IBM_Plex_Mono, Manrope } from 'next/font/google'
import Link from 'next/link'
import styles from './page.module.css'

const display = Manrope({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
})

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
})

const pillars = [
  {
    title: 'Action Runtime',
    text: 'Transport-agnostic actions for API, queue, cron, and event execution.',
  },
  {
    title: 'Platform Layer',
    text: 'Use one contract for auth, orgs, plans, subscriptions, and billing.',
  },
  {
    title: 'Observability',
    text: 'Native runtime signals and OTLP support without custom plumbing.',
  },
  {
    title: 'Safety by Design',
    text: 'Guards and policy hooks enforce tenant and permission boundaries.',
  },
]

const checks = ['Type-safe action contracts', 'Context-driven guard pipeline', 'Docs and OpenAPI integration']

export default function NextInspiredLandingPage() {
  return (
    <main className={styles.page}>
      <div className={styles.topGlow} aria-hidden />
      <div className={styles.grid} aria-hidden />

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 pb-16 pt-8 md:px-10">
        <header className={styles.nav}>
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-cyan-300/16 text-cyan-100">
              <Sparkles size={14} />
            </span>
            <span className={`${display.className} text-sm font-semibold text-zinc-100`}>Bunbase</span>
          </div>

          <nav className="hidden items-center gap-2 md:flex">
            <Link href="/" className={styles.ghostButton}>
              Variants
            </Link>
            <Link href="/landing/nebula" className={styles.ghostButton}>
              Nebula Flow
            </Link>
            <Link href="/docs" className={styles.primaryButton}>
              Docs
              <ArrowRight size={14} />
            </Link>
          </nav>
        </header>

        <section className="mt-16 grid gap-10 md:grid-cols-[1.05fr_0.95fr] md:items-center">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-300/12 px-3 py-1 text-xs tracking-wide text-cyan-100">
              Next.js-inspired structure
            </p>
            <h1 className={`${display.className} mt-6 max-w-2xl text-balance text-5xl leading-tight text-zinc-50 md:text-6xl`}>
              Build product backends with less glue and sharper boundaries.
            </h1>
            <p className="mt-6 max-w-xl text-zinc-300">
              Bunbase centralizes runtime actions, policy guards, and SaaS modules so your team can focus on product logic.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/docs" className={styles.primaryButtonLarge}>
                Get Started
                <ArrowRight size={15} />
              </Link>
              <a
                href="https://github.com/alihussnainrb/bunbase"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.ghostButtonLarge}
              >
                GitHub
              </a>
            </div>
          </div>

          <article className={styles.heroPanel}>
            <div className="mb-4 flex items-center justify-between">
              <p className={`${mono.className} text-xs text-zinc-400`}>quickstart.ts</p>
              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/6 px-2 py-1 text-xs text-zinc-300">
                <CirclePlay size={12} />
                run
              </span>
            </div>

            <pre className={`${mono.className} ${styles.code}`}>
              <code>{`bun add bunbase

export const createWorkspace = action({
  name: 'workspace.create',
  triggers: [triggers.api('POST', '/workspaces')],
  guards: [guards.authenticated()],
}, async (input, ctx) => {
  return ctx.platform.orgs.create(input)
})`}</code>
            </pre>

            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {checks.map((item) => (
                <div key={item} className={styles.check}>
                  <Check size={14} />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="mt-16">
          <h2 className={`${display.className} text-3xl text-zinc-50 md:text-4xl`}>Everything you need for SaaS backends</h2>
          <p className="mt-3 max-w-2xl text-zinc-300">Modular architecture with predictable runtime behavior from day one.</p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {pillars.map((pillar) => (
              <article key={pillar.title} className={styles.card}>
                <h3 className={`${display.className} text-xl text-zinc-50`}>{pillar.title}</h3>
                <p className="mt-2 text-sm text-zinc-300">{pillar.text}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
