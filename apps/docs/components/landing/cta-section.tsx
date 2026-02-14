'use client'

import { ArrowRight, Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { MovingBorder } from '../ui/moving-border'

export function CtaSection() {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(
      'bunx bunbase init my-app\ncd my-app\nbun run dev'
    )
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section className="relative overflow-hidden py-32 md:py-44">
      {/* Background mesh */}
      <div className="absolute inset-0 bg-zinc-950" />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 70% 50% at 50% 100%, rgba(34, 211, 238, 0.08) 0%, transparent 60%),
            radial-gradient(ellipse 40% 40% at 30% 80%, rgba(139, 92, 246, 0.05) 0%, transparent 50%),
            radial-gradient(ellipse 40% 40% at 70% 80%, rgba(59, 130, 246, 0.05) 0%, transparent 50%)
          `,
        }}
      />

      <div className="relative mx-auto max-w-4xl px-6 text-center md:px-10">
        {/* Headline */}
        <h2 className="font-display text-4xl font-bold leading-tight text-zinc-50 md:text-6xl lg:text-7xl">
          Ship your backend
          <br />
          <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-violet-400 bg-clip-text text-transparent">
            in minutes
          </span>
        </h2>

        <p className="mx-auto mt-6 max-w-lg text-lg leading-relaxed text-zinc-500">
          Three commands. That&apos;s all it takes to go from zero to a
          production-ready, type-safe backend.
        </p>

        {/* Terminal */}
        <div className="mx-auto mt-14 max-w-2xl overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-900/60 shadow-2xl shadow-cyan-500/5 backdrop-blur-sm">
          <div className="flex items-center justify-between border-b border-white/[0.08] bg-zinc-950/60 px-5 py-3.5">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-zinc-700" />
              <div className="h-3 w-3 rounded-full bg-zinc-700" />
              <div className="h-3 w-3 rounded-full bg-zinc-700" />
              <span className="ml-3 font-mono text-xs text-zinc-600">Terminal</span>
            </div>
            <button
              type="button"
              className="flex items-center gap-2 rounded-lg bg-white/[0.04] px-3 py-1.5 font-mono text-xs text-zinc-500 transition-colors hover:bg-white/[0.08] hover:text-zinc-300"
              onClick={handleCopy}
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 text-emerald-400" />
                  <span className="text-emerald-400">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  Copy
                </>
              )}
            </button>
          </div>
          <div className="space-y-3 p-6 text-left font-mono text-sm">
            <div>
              <span className="text-zinc-600">$ </span>
              <span className="text-cyan-400">bunx bunbase init</span>
              <span className="text-zinc-300"> my-app</span>
            </div>
            <div>
              <span className="text-zinc-600">$ </span>
              <span className="text-zinc-300">cd my-app</span>
            </div>
            <div>
              <span className="text-zinc-600">$ </span>
              <span className="text-cyan-400">bun run dev</span>
            </div>
            <div className="mt-4 border-t border-white/[0.04] pt-4">
              <div className="flex items-center gap-2 text-emerald-400/80">
                <Check className="h-3.5 w-3.5" />
                <span className="text-xs">Server running on localhost:3000</span>
              </div>
              <div className="mt-1.5 flex items-center gap-2 text-emerald-400/80">
                <Check className="h-3.5 w-3.5" />
                <span className="text-xs">Studio available at localhost:3001</span>
              </div>
              <div className="mt-1.5 flex items-center gap-2 text-emerald-400/80">
                <Check className="h-3.5 w-3.5" />
                <span className="text-xs">OpenAPI docs at /api/docs</span>
              </div>
            </div>
          </div>
        </div>

        {/* CTAs */}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-4">
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
            className="rounded-lg border border-white/[0.1] bg-white/[0.03] px-6 py-3 text-sm font-medium text-zinc-300 backdrop-blur-sm transition-colors hover:border-white/[0.2] hover:bg-white/[0.06]"
          >
            View Examples
          </a>
        </div>
      </div>
    </section>
  )
}
