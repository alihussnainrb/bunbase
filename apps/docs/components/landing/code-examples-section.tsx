'use client'

import { Tabs } from '../ui/tabs'

const examples = [
  {
    title: 'API Route',
    value: 'api',
    content: (
      <div className="overflow-hidden rounded-xl border border-white/10 bg-zinc-900/80 shadow-xl">
        <div className="flex items-center gap-2 border-b border-white/10 bg-zinc-950/50 px-5 py-3">
          <div className="h-3 w-3 rounded-full bg-red-500/80" />
          <div className="h-3 w-3 rounded-full bg-yellow-500/80" />
          <div className="h-3 w-3 rounded-full bg-green-500/80" />
          <span className="ml-3 text-xs text-zinc-500">create-user.action.ts</span>
        </div>
        <div className="overflow-x-auto p-6">
          <pre className="font-mono text-sm leading-relaxed">
            <code>
              <span className="text-purple-400">export const</span> <span className="text-blue-400">createUser</span> <span className="text-zinc-300">=</span> <span className="text-yellow-400">action</span><span className="text-zinc-300">(</span>
              {'\n  '}
              <span className="text-zinc-300">{'{'}</span>
              {'\n    '}
              <span className="text-cyan-400">name</span><span className="text-zinc-300">:</span> <span className="text-green-400">'createUser'</span><span className="text-zinc-300">,</span>
              {'\n    '}
              <span className="text-cyan-400">input</span><span className="text-zinc-300">:</span> <span className="text-zinc-300">t</span><span className="text-zinc-300">.</span><span className="text-yellow-400">Object</span><span className="text-zinc-300">({'{'}</span>
              {'\n      '}
              <span className="text-cyan-400">email</span><span className="text-zinc-300">:</span> <span className="text-zinc-300">t</span><span className="text-zinc-300">.</span><span className="text-yellow-400">String</span><span className="text-zinc-300">({'{'}</span> <span className="text-cyan-400">format</span><span className="text-zinc-300">:</span> <span className="text-green-400">'email'</span> <span className="text-zinc-300">{'}'}),</span>
              {'\n      '}
              <span className="text-cyan-400">name</span><span className="text-zinc-300">:</span> <span className="text-zinc-300">t</span><span className="text-zinc-300">.</span><span className="text-yellow-400">String</span><span className="text-zinc-300">(),</span>
              {'\n    '}
              <span className="text-zinc-300">{'}'}),</span>
              {'\n    '}
              <span className="text-cyan-400">triggers</span><span className="text-zinc-300">:</span> <span className="text-zinc-300">[</span><span className="text-zinc-300">triggers</span><span className="text-zinc-300">.</span><span className="text-yellow-400">api</span><span className="text-zinc-300">(</span><span className="text-green-400">'POST'</span><span className="text-zinc-300">,</span> <span className="text-green-400">'/users'</span><span className="text-zinc-300">)],</span>
              {'\n    '}
              <span className="text-cyan-400">guards</span><span className="text-zinc-300">:</span> <span className="text-zinc-300">[</span><span className="text-yellow-400">authenticated</span><span className="text-zinc-300">()],</span>
              {'\n  '}
              <span className="text-zinc-300">{'}'}</span><span className="text-zinc-300">,</span>
              {'\n  '}
              <span className="text-purple-400">async</span> <span className="text-zinc-300">(</span><span className="text-orange-400">input</span><span className="text-zinc-300">,</span> <span className="text-orange-400">ctx</span><span className="text-zinc-300">)</span> <span className="text-purple-400">=&gt;</span> <span className="text-zinc-300">{'{'}</span>
              {'\n    '}
              <span className="text-purple-400">const</span> <span className="text-blue-400">user</span> <span className="text-zinc-300">=</span> <span className="text-purple-400">await</span> <span className="text-zinc-300">ctx</span><span className="text-zinc-300">.</span><span className="text-zinc-300">db</span><span className="text-zinc-300">.</span><span className="text-yellow-400">from</span><span className="text-zinc-300">(</span><span className="text-green-400">'users'</span><span className="text-zinc-300">)</span>
              {'\n      '}
              <span className="text-zinc-300">.</span><span className="text-yellow-400">insert</span><span className="text-zinc-300">(</span><span className="text-orange-400">input</span><span className="text-zinc-300">)</span><span className="text-zinc-300">.</span><span className="text-yellow-400">single</span><span className="text-zinc-300">()</span>
              {'\n    '}
              <span className="text-purple-400">return</span> <span className="text-blue-400">user</span>
              {'\n  '}
              <span className="text-zinc-300">{'}'}</span>
              {'\n'}
              <span className="text-zinc-300">)</span>
            </code>
          </pre>
        </div>
      </div>
    ),
  },
  {
    title: 'Cron Job',
    value: 'cron',
    content: (
      <div className="overflow-hidden rounded-xl border border-white/10 bg-zinc-900/80 shadow-xl">
        <div className="flex items-center gap-2 border-b border-white/10 bg-zinc-950/50 px-5 py-3">
          <div className="h-3 w-3 rounded-full bg-red-500/80" />
          <div className="h-3 w-3 rounded-full bg-yellow-500/80" />
          <div className="h-3 w-3 rounded-full bg-green-500/80" />
          <span className="ml-3 text-xs text-zinc-500">cleanup.action.ts</span>
        </div>
        <div className="overflow-x-auto p-6">
          <pre className="font-mono text-sm leading-relaxed">
            <code>
              <span className="text-purple-400">export const</span> <span className="text-blue-400">dailyCleanup</span> <span className="text-zinc-300">=</span> <span className="text-yellow-400">action</span><span className="text-zinc-300">(</span>
              {'\n  '}
              <span className="text-zinc-300">{'{'}</span>
              {'\n    '}
              <span className="text-cyan-400">name</span><span className="text-zinc-300">:</span> <span className="text-green-400">'dailyCleanup'</span><span className="text-zinc-300">,</span>
              {'\n    '}
              <span className="text-cyan-400">triggers</span><span className="text-zinc-300">:</span> <span className="text-zinc-300">[</span>
              {'\n      '}
              <span className="text-zinc-300">triggers</span><span className="text-zinc-300">.</span><span className="text-yellow-400">cron</span><span className="text-zinc-300">(</span><span className="text-green-400">'0 0 * * *'</span><span className="text-zinc-300">)</span> <span className="text-zinc-500">// Daily at midnight</span>
              {'\n    '}
              <span className="text-zinc-300">],</span>
              {'\n  '}
              <span className="text-zinc-300">{'}'}</span><span className="text-zinc-300">,</span>
              {'\n  '}
              <span className="text-purple-400">async</span> <span className="text-zinc-300">(</span><span className="text-orange-400">_</span><span className="text-zinc-300">,</span> <span className="text-orange-400">ctx</span><span className="text-zinc-300">)</span> <span className="text-purple-400">=&gt;</span> <span className="text-zinc-300">{'{'}</span>
              {'\n    '}
              <span className="text-zinc-300">ctx</span><span className="text-zinc-300">.</span><span className="text-zinc-300">logger</span><span className="text-zinc-300">.</span><span className="text-yellow-400">info</span><span className="text-zinc-300">(</span><span className="text-green-400">'Starting daily cleanup'</span><span className="text-zinc-300">)</span>
              {'\n    '}
              <span className="text-purple-400">await</span> <span className="text-zinc-300">ctx</span><span className="text-zinc-300">.</span><span className="text-zinc-300">db</span><span className="text-zinc-300">.</span><span className="text-yellow-400">from</span><span className="text-zinc-300">(</span><span className="text-green-400">'sessions'</span><span className="text-zinc-300">)</span>
              {'\n      '}
              <span className="text-zinc-300">.</span><span className="text-yellow-400">where</span><span className="text-zinc-300">(</span><span className="text-green-400">'expires_at'</span><span className="text-zinc-300">,</span> <span className="text-green-400">'&lt;'</span><span className="text-zinc-300">,</span> <span className="text-purple-400">new</span> <span className="text-yellow-400">Date</span><span className="text-zinc-300">())</span>
              {'\n      '}
              <span className="text-zinc-300">.</span><span className="text-yellow-400">delete</span><span className="text-zinc-300">()</span>
              {'\n  '}
              <span className="text-zinc-300">{'}'}</span>
              {'\n'}
              <span className="text-zinc-300">)</span>
            </code>
          </pre>
        </div>
      </div>
    ),
  },
  {
    title: 'Webhook',
    value: 'webhook',
    content: (
      <div className="overflow-hidden rounded-xl border border-white/10 bg-zinc-900/80 shadow-xl">
        <div className="flex items-center gap-2 border-b border-white/10 bg-zinc-950/50 px-5 py-3">
          <div className="h-3 w-3 rounded-full bg-red-500/80" />
          <div className="h-3 w-3 rounded-full bg-yellow-500/80" />
          <div className="h-3 w-3 rounded-full bg-green-500/80" />
          <span className="ml-3 text-xs text-zinc-500">stripe-webhook.action.ts</span>
        </div>
        <div className="overflow-x-auto p-6">
          <pre className="font-mono text-sm leading-relaxed">
            <code>
              <span className="text-purple-400">export const</span> <span className="text-blue-400">handleStripeWebhook</span> <span className="text-zinc-300">=</span> <span className="text-yellow-400">action</span><span className="text-zinc-300">(</span>
              {'\n  '}
              <span className="text-zinc-300">{'{'}</span>
              {'\n    '}
              <span className="text-cyan-400">name</span><span className="text-zinc-300">:</span> <span className="text-green-400">'handleStripeWebhook'</span><span className="text-zinc-300">,</span>
              {'\n    '}
              <span className="text-cyan-400">triggers</span><span className="text-zinc-300">:</span> <span className="text-zinc-300">[</span>
              {'\n      '}
              <span className="text-zinc-300">triggers</span><span className="text-zinc-300">.</span><span className="text-yellow-400">webhook</span><span className="text-zinc-300">(</span><span className="text-green-400">'/webhooks/stripe'</span><span className="text-zinc-300">,</span> <span className="text-zinc-300">{'{'}</span>
              {'\n        '}
              <span className="text-cyan-400">verify</span><span className="text-zinc-300">:</span> <span className="text-zinc-300">(</span><span className="text-orange-400">req</span><span className="text-zinc-300">)</span> <span className="text-purple-400">=&gt;</span> <span className="text-yellow-400">verifyStripe</span><span className="text-zinc-300">(</span><span className="text-orange-400">req</span><span className="text-zinc-300">)</span>
              {'\n      '}
              <span className="text-zinc-300">{'}'}</span><span className="text-zinc-300">)</span>
              {'\n    '}
              <span className="text-zinc-300">],</span>
              {'\n  '}
              <span className="text-zinc-300">{'}'}</span><span className="text-zinc-300">,</span>
              {'\n  '}
              <span className="text-purple-400">async</span> <span className="text-zinc-300">(</span><span className="text-orange-400">event</span><span className="text-zinc-300">,</span> <span className="text-orange-400">ctx</span><span className="text-zinc-300">)</span> <span className="text-purple-400">=&gt;</span> <span className="text-zinc-300">{'{'}</span>
              {'\n    '}
              <span className="text-purple-400">if</span> <span className="text-zinc-300">(</span><span className="text-orange-400">event</span><span className="text-zinc-300">.</span><span className="text-cyan-400">type</span> <span className="text-zinc-300">===</span> <span className="text-green-400">'payment_intent.succeeded'</span><span className="text-zinc-300">)</span> <span className="text-zinc-300">{'{'}</span>
              {'\n      '}
              <span className="text-purple-400">await</span> <span className="text-zinc-300">ctx</span><span className="text-zinc-300">.</span><span className="text-zinc-300">events</span><span className="text-zinc-300">.</span><span className="text-yellow-400">emit</span><span className="text-zinc-300">(</span><span className="text-green-400">'payment.received'</span><span className="text-zinc-300">,</span> <span className="text-orange-400">event</span><span className="text-zinc-300">)</span>
              {'\n    '}
              <span className="text-zinc-300">{'}'}</span>
              {'\n  '}
              <span className="text-zinc-300">{'}'}</span>
              {'\n'}
              <span className="text-zinc-300">)</span>
            </code>
          </pre>
        </div>
      </div>
    ),
  },
]

export function CodeExamplesSection() {
  return (
    <section className="relative overflow-hidden bg-zinc-950 px-6 py-24 md:px-10 md:py-32">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-12 text-center">
          <h2 className="mb-4 font-display text-4xl font-bold text-zinc-50 md:text-5xl">
            One Action, Multiple Triggers
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-zinc-400">
            Write your logic once, connect it to any trigger type
          </p>
        </div>

        {/* Tabs */}
        <div className="mx-auto max-w-4xl">
          <Tabs
            tabs={examples}
            containerClassName="mb-8 justify-center"
          />
        </div>
      </div>
    </section>
  )
}
