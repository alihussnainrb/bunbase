'use client'

import { ArrowRight, Copy } from 'lucide-react'
import { MovingBorder } from '../ui/moving-border'

export function CtaSection() {
  const handleCopy = () => {
    navigator.clipboard.writeText('bunx bunbase init my-app')
  }

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-zinc-900 via-zinc-950 to-zinc-950 px-6 py-24 md:px-10 md:py-32">
      {/* Glow Effect */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[40rem] w-[40rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500/10 blur-[120px]" />
      
      <div className="relative mx-auto max-w-4xl text-center">
        {/* Headline */}
        <h2 className="mb-6 font-display text-4xl font-bold text-zinc-50 md:text-6xl">
          Start building with
          <br />
          <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
            bunbase today
          </span>
        </h2>

        <p className="mb-12 text-lg text-zinc-400">
          Get started in seconds with the bunbase CLI
        </p>

        {/* Command Box */}
        <div className="mb-12 overflow-hidden rounded-xl border border-white/10 bg-zinc-900/80 shadow-2xl backdrop-blur-sm">
          <div className="flex items-center justify-between border-b border-white/10 bg-zinc-950/50 px-5 py-3">
            <span className="text-xs text-zinc-500">Terminal</span>
            <button
              type="button"
              className="flex items-center gap-2 rounded-md bg-white/5 px-3 py-1.5 text-xs text-zinc-400 transition hover:bg-white/10 hover:text-zinc-200"
              onClick={handleCopy}
            >
              <Copy className="h-3 w-3" />
              Copy
            </button>
          </div>
          <div className="p-6">
            <code className="font-mono text-lg text-cyan-400">
              bunx bunbase init my-app
            </code>
          </div>
        </div>

        {/* CTAs */}
        <div className="flex flex-wrap items-center justify-center gap-4">
          <MovingBorder
            href="/docs"
            className="bg-cyan-500 font-semibold text-zinc-950 hover:bg-cyan-400"
            containerClassName="rounded-lg"
          >
            Read the Docs
            <ArrowRight className="ml-2 inline-block h-4 w-4" />
          </MovingBorder>
          
          <a
            href="https://github.com/alihussnainrb/bunbase/tree/main/examples"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-white/15 bg-white/5 px-6 py-3 text-sm font-medium text-zinc-200 backdrop-blur-sm transition hover:border-white/25 hover:bg-white/10"
          >
            View Examples
          </a>
        </div>
      </div>
    </section>
  )
}
