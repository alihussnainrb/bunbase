import { ArrowRight, Github, Sparkles } from 'lucide-react'
import { BackgroundBeams } from '../ui/background-beams'
import { GridBackground } from '../ui/grid-background'
import { MovingBorder } from '../ui/moving-border'
import { Spotlight } from '../ui/spotlight'

export function HeroSection() {
  return (
    <section className="relative min-h-screen overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950" />
      <GridBackground />
      <BackgroundBeams />
      <Spotlight className="absolute -top-40 left-0 md:-top-20 md:left-60" fill="rgba(34, 211, 238, 0.15)" />
      
      {/* Aurora Blobs */}
      <div className="pointer-events-none absolute left-[-10%] top-[5%] h-96 w-96 animate-float-slow rounded-full bg-cyan-500/20 blur-[120px]" />
      <div className="pointer-events-none absolute right-[-10%] top-[45%] h-[30rem] w-[30rem] animate-float-slower rounded-full bg-orange-500/15 blur-[120px]" />

      {/* Content */}
      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col items-center justify-center px-6 pb-16 pt-32 text-center md:px-10">
        {/* Badge */}
        <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-4 py-1.5 text-xs tracking-wide text-cyan-200 backdrop-blur-sm">
          <Sparkles className="h-3.5 w-3.5" />
          Powered by Bun - The fastest JavaScript runtime
        </div>

        {/* Headline */}
        <h1 className="mb-6 max-w-4xl text-balance font-display text-5xl font-bold leading-tight text-zinc-50 md:text-7xl lg:text-8xl">
          Type-safe backend
          <br />
          <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
            framework for Bun
          </span>
        </h1>

        {/* Subheadline */}
        <p className="mx-auto mb-10 max-w-2xl text-balance text-lg text-zinc-400 md:text-xl">
          Build backends the right way with <strong className="font-semibold text-zinc-300">Actions</strong>, <strong className="font-semibold text-zinc-300">Modules</strong>, and <strong className="font-semibold text-zinc-300">Triggers</strong>. Everything you need for production-ready APIs.
        </p>

        {/* CTAs */}
        <div className="mb-16 flex flex-wrap items-center justify-center gap-4">
          <MovingBorder
            href="/docs"
            className="bg-cyan-500 font-semibold text-zinc-950 hover:bg-cyan-400"
            containerClassName="rounded-lg"
          >
            Get Started
            <ArrowRight className="ml-2 inline-block h-4 w-4" />
          </MovingBorder>
          
          <a
            href="https://github.com/alihussnainrb/bunbase"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-6 py-3 text-sm font-medium text-zinc-200 backdrop-blur-sm transition hover:border-white/25 hover:bg-white/10"
          >
            <Github className="h-4 w-4" />
            View on GitHub
          </a>
        </div>

        {/* Code Preview */}
        <div className="w-full max-w-4xl">
          <div className="overflow-hidden rounded-xl border border-white/10 bg-zinc-900/80 shadow-2xl backdrop-blur-sm">
            {/* Header */}
            <div className="flex items-center gap-2 border-b border-white/10 bg-zinc-950/50 px-5 py-3">
              <div className="h-3 w-3 rounded-full bg-red-500/80" />
              <div className="h-3 w-3 rounded-full bg-yellow-500/80" />
              <div className="h-3 w-3 rounded-full bg-green-500/80" />
              <span className="ml-3 text-xs text-zinc-500">greet.action.ts</span>
            </div>
            
            {/* Code */}
            <div className="overflow-x-auto p-6">
              <pre className="font-mono text-sm leading-relaxed">
                <code>
                  <span className="text-purple-400">import</span> <span className="text-zinc-300">{'{ action, t, triggers }'}</span> <span className="text-purple-400">from</span> <span className="text-green-400">'bunbase'</span>
                  {'\n\n'}
                  <span className="text-purple-400">export const</span> <span className="text-blue-400">greet</span> <span className="text-zinc-300">=</span> <span className="text-yellow-400">action</span><span className="text-zinc-300">(</span>
                  {'\n  '}
                  <span className="text-zinc-300">{'{'}</span>
                  {'\n    '}
                  <span className="text-cyan-400">name</span><span className="text-zinc-300">:</span> <span className="text-green-400">'greet'</span><span className="text-zinc-300">,</span>
                  {'\n    '}
                  <span className="text-cyan-400">input</span><span className="text-zinc-300">:</span> <span className="text-zinc-300">t</span><span className="text-zinc-300">.</span><span className="text-yellow-400">Object</span><span className="text-zinc-300">({'{'}</span>
                  {'\n      '}
                  <span className="text-cyan-400">name</span><span className="text-zinc-300">:</span> <span className="text-zinc-300">t</span><span className="text-zinc-300">.</span><span className="text-yellow-400">String</span><span className="text-zinc-300">(),</span>
                  {'\n    '}
                  <span className="text-zinc-300">{'}'}),</span>
                  {'\n    '}
                  <span className="text-cyan-400">triggers</span><span className="text-zinc-300">:</span> <span className="text-zinc-300">[</span><span className="text-zinc-300">triggers</span><span className="text-zinc-300">.</span><span className="text-yellow-400">api</span><span className="text-zinc-300">(</span><span className="text-green-400">'GET'</span><span className="text-zinc-300">,</span> <span className="text-green-400">'/greet/:name'</span><span className="text-zinc-300">)],</span>
                  {'\n  '}
                  <span className="text-zinc-300">{'}'}</span><span className="text-zinc-300">,</span>
                  {'\n  '}
                  <span className="text-purple-400">async</span> <span className="text-zinc-300">(</span><span className="text-orange-400">input</span><span className="text-zinc-300">,</span> <span className="text-orange-400">ctx</span><span className="text-zinc-300">)</span> <span className="text-purple-400">=&gt;</span> <span className="text-zinc-300">{'{'}</span>
                  {'\n    '}
                  <span className="text-purple-400">return</span> <span className="text-zinc-300">{'{'}</span> <span className="text-cyan-400">message</span><span className="text-zinc-300">:</span> <span className="text-green-400">`Hello, </span><span className="text-orange-300">{'${input.name}'}</span><span className="text-green-400">!`</span> <span className="text-zinc-300">{'}'}</span>
                  {'\n  '}
                  <span className="text-zinc-300">{'}'}</span>
                  {'\n'}
                  <span className="text-zinc-300">)</span>
                </code>
              </pre>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
