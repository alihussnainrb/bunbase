import { ArrowRight, Sparkles } from 'lucide-react'
import { Syne } from 'next/font/google'
import Link from 'next/link'
import styles from './page.module.css'

const display = Syne({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
})

export default function Page() {
  return (
    <main className={styles.page}>
      <div className={styles.auroraA} aria-hidden />
      <div className={styles.auroraB} aria-hidden />
      <div className={styles.grid} aria-hidden />

      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 pb-16 pt-12 md:px-10">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-300/35 bg-cyan-300/12 px-3 py-1 text-xs tracking-wide text-cyan-100">
            <Sparkles size={14} />
            Bunbase Landing Lab
          </p>
          <h1 className={`${display.className} text-balance text-4xl leading-tight text-zinc-50 md:text-6xl`}>
            Two Aceternity-inspired landing directions, ready to compare.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-zinc-300">
            Variant A is bold and cinematic. Variant B follows a tighter Next.js style structure with cleaner product proof.
          </p>
        </div>

        <section className="mt-12 grid gap-4 md:grid-cols-2">
          <Link href="/landing/nebula" className={`${styles.variantCard} group`}>
            <p className="text-xs uppercase tracking-[0.18em] text-cyan-200/90">Variant A</p>
            <h2 className={`${display.className} mt-2 text-3xl text-zinc-50`}>Nebula Flow</h2>
            <p className="mt-3 text-zinc-300">No Next.js layout inspiration. Full creative composition with atmospheric motion.</p>
            <span className="mt-6 inline-flex items-center gap-2 text-cyan-200">
              Open Variant
              <ArrowRight size={14} className="transition group-hover:translate-x-1" />
            </span>
          </Link>

          <Link href="/landing/next" className={`${styles.variantCard} group`}>
            <p className="text-xs uppercase tracking-[0.18em] text-amber-200/90">Variant B</p>
            <h2 className={`${display.className} mt-2 text-3xl text-zinc-50`}>Next Rhythm</h2>
            <p className="mt-3 text-zinc-300">Next.js-inspired section flow with clear hierarchy, proof blocks, and sharp CTAs.</p>
            <span className="mt-6 inline-flex items-center gap-2 text-amber-200">
              Open Variant
              <ArrowRight size={14} className="transition group-hover:translate-x-1" />
            </span>
          </Link>
        </section>

        <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/docs"
            className="rounded-full border border-white/15 px-5 py-2.5 text-sm text-zinc-200 transition hover:bg-white/10"
          >
            Open Docs
          </Link>
          <a
            href="https://github.com/alihussnainrb/bunbase"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-cyan-300 px-5 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-cyan-200"
          >
            GitHub
          </a>
        </div>
      </div>
    </main>
  )
}
