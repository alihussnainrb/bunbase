export function PrimitivesSection() {
  return (
    <section className="relative overflow-hidden bg-zinc-950 py-32 md:py-44">
      {/* Subtle radial glows */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 60% 50% at 20% 40%, rgba(34, 211, 238, 0.04) 0%, transparent 70%),
            radial-gradient(ellipse 60% 50% at 80% 60%, rgba(251, 191, 36, 0.03) 0%, transparent 70%)
          `,
        }}
      />

      <div className="relative mx-auto max-w-7xl px-6 md:px-10">
        {/* Section Header */}
        <div className="mb-28 max-w-3xl">
          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400">
            Architecture
          </p>
          <h2 className="font-display text-4xl font-bold leading-tight text-zinc-50 md:text-5xl lg:text-6xl">
            Three primitives.{' '}
            <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-violet-400 bg-clip-text text-transparent">
              Infinite possibilities.
            </span>
          </h2>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-zinc-500">
            Everything in bunbase is built from three composable building blocks.
            Learn them once, build anything.
          </p>
        </div>

        {/* ─── Primitive 1: Actions ─── */}
        <div className="mb-28 grid items-start gap-10 lg:grid-cols-2 lg:gap-20">
          {/* Text */}
          <div className="lg:sticky lg:top-32">
            <div className="mb-6 flex items-center gap-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10 font-mono text-sm font-bold text-cyan-400">
                01
              </span>
              <div className="h-px flex-1 bg-gradient-to-r from-cyan-500/30 to-transparent" />
            </div>
            <h3 className="mb-4 font-display text-3xl font-bold text-zinc-50 md:text-4xl">
              Actions
            </h3>
            <p className="mb-8 text-lg leading-relaxed text-zinc-400">
              The atomic units of your backend. Each action is a validated,
              self-contained function with typed inputs, outputs, guards, and
              automatic OpenAPI documentation.
            </p>
            <ul className="space-y-4">
              {[
                'Input/output schemas with TypeBox validation',
                'Composable guards for auth & rate limiting',
                'Automatic OpenAPI spec generation',
                'Full type inference — zero manual typing',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-[15px] text-zinc-300">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Code Window */}
          <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-900/60 shadow-2xl shadow-cyan-500/5 backdrop-blur-sm">
            <div className="flex items-center gap-2 border-b border-white/[0.08] bg-zinc-950/60 px-5 py-3.5">
              <div className="h-3 w-3 rounded-full bg-zinc-700" />
              <div className="h-3 w-3 rounded-full bg-zinc-700" />
              <div className="h-3 w-3 rounded-full bg-zinc-700" />
              <span className="ml-3 font-mono text-xs text-zinc-500">create-user.action.ts</span>
            </div>
            <div className="overflow-x-auto p-6">
              <pre className="font-mono text-[13px] leading-7">
                <code>
                  <Line><K>import</K> <W>{'{ action, t, triggers }'}</W> <K>from</K> <S>{'\'bunbase\''}</S></Line>
                  <Line />
                  <Line><K>export const</K> <V>createUser</V> <W>=</W> <F>action</F><W>(</W></Line>
                  <Line>  <W>{'{'}</W></Line>
                  <Line>    <P>name</P><W>:</W> <S>{'\'createUser\''}</S><W>,</W></Line>
                  <Line>    <P>input</P><W>:</W> <W>t.</W><F>Object</F><W>({'{'}</W></Line>
                  <Line>      <P>email</P><W>:</W> <W>t.</W><F>String</F><W>({'{'}</W> <P>format</P><W>:</W> <S>{'\'email\''}</S> <W>{'}'}),</W></Line>
                  <Line>      <P>name</P><W>:</W> <W>t.</W><F>String</F><W>({'{'}</W> <P>minLength</P><W>:</W> <N>2</N> <W>{'}'}),</W></Line>
                  <Line>    <W>{'}'}),</W></Line>
                  <Line>    <P>triggers</P><W>:</W> <W>[</W><W>triggers.</W><F>api</F><W>(</W><S>{'\'POST\''}</S><W>,</W> <S>{'\'/users\''}</S><W>)],</W></Line>
                  <Line>    <P>guards</P><W>:</W> <W>[</W><F>authenticated</F><W>()],</W></Line>
                  <Line>  <W>{'}'}</W><W>,</W></Line>
                  <Line>  <K>async</K> <W>(</W><A>input</A><W>,</W> <A>ctx</A><W>)</W> <K>{'=>'}</K> <W>{'{'}</W></Line>
                  <Line>    <K>const</K> <V>user</V> <W>=</W> <K>await</K> <A>ctx</A><W>.db.</W><F>from</F><W>(</W><S>{'\'users\''}</S><W>)</W></Line>
                  <Line>      <W>.</W><F>insert</F><W>(</W><A>input</A><W>).</W><F>returning</F><W>(</W><S>{'\'id\''}</S><W>,</W> <S>{'\'email\''}</S><W>)</W></Line>
                  <Line>      <W>.</W><F>single</F><W>()</W></Line>
                  <Line>    <K>return</K> <V>user</V></Line>
                  <Line>  <W>{'}'}</W></Line>
                  <Line><W>)</W></Line>
                </code>
              </pre>
            </div>
          </div>
        </div>

        {/* ─── Primitive 2: Modules ─── */}
        <div className="mb-28 grid items-start gap-10 lg:grid-cols-2 lg:gap-20">
          {/* Code Window — left on desktop */}
          <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-900/60 shadow-2xl shadow-emerald-500/5 backdrop-blur-sm lg:order-first">
            <div className="flex items-center gap-2 border-b border-white/[0.08] bg-zinc-950/60 px-5 py-3.5">
              <div className="h-3 w-3 rounded-full bg-zinc-700" />
              <div className="h-3 w-3 rounded-full bg-zinc-700" />
              <div className="h-3 w-3 rounded-full bg-zinc-700" />
              <span className="ml-3 font-mono text-xs text-zinc-500">users.module.ts</span>
            </div>
            <div className="overflow-x-auto p-6">
              <pre className="font-mono text-[13px] leading-7">
                <code>
                  <Line><K>import</K> <W>{'{ module }'}</W> <K>from</K> <S>{'\'bunbase\''}</S></Line>
                  <Line><K>import</K> <W>{'{ createUser }'}</W> <K>from</K> <S>{'\'./create-user.action\''}</S></Line>
                  <Line><K>import</K> <W>{'{ getUser }'}</W> <K>from</K> <S>{'\'./get-user.action\''}</S></Line>
                  <Line><K>import</K> <W>{'{ listUsers }'}</W> <K>from</K> <S>{'\'./list-users.action\''}</S></Line>
                  <Line><K>import</K> <W>{'{ deleteUser }'}</W> <K>from</K> <S>{'\'./delete-user.action\''}</S></Line>
                  <Line />
                  <Line><K>export const</K> <V>usersModule</V> <W>=</W> <F>module</F><W>(</W><W>{'{'}</W></Line>
                  <Line>  <P>name</P><W>:</W> <S>{'\'users\''}</S><W>,</W></Line>
                  <Line>  <P>prefix</P><W>:</W> <S>{'\'/api/v1\''}</S><W>,</W></Line>
                  <Line>  <P>guards</P><W>:</W> <W>[</W><F>authenticated</F><W>()],</W></Line>
                  <Line>  <P>actions</P><W>:</W> <W>[</W></Line>
                  <Line>    <W>createUser, getUser,</W></Line>
                  <Line>    <W>listUsers, deleteUser,</W></Line>
                  <Line>  <W>],</W></Line>
                  <Line><W>{'}'})</W></Line>
                </code>
              </pre>
            </div>
          </div>

          {/* Text */}
          <div className="lg:sticky lg:top-32">
            <div className="mb-6 flex items-center gap-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 font-mono text-sm font-bold text-emerald-400">
                02
              </span>
              <div className="h-px flex-1 bg-gradient-to-r from-emerald-500/30 to-transparent" />
            </div>
            <h3 className="mb-4 font-display text-3xl font-bold text-zinc-50 md:text-4xl">
              Modules
            </h3>
            <p className="mb-8 text-lg leading-relaxed text-zinc-400">
              Group related actions with shared configuration. Modules give you
              namespaced routes, shared guards, and clean boundaries between
              domains.
            </p>
            <ul className="space-y-4">
              {[
                'Shared guards applied to all child actions',
                'Route prefixes for organized API namespacing',
                'Encapsulated domain logic — users, orders, payments',
                'Compose modules into your application',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-[15px] text-zinc-300">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* ─── Primitive 3: Triggers ─── */}
        <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-20">
          {/* Text */}
          <div className="lg:sticky lg:top-32">
            <div className="mb-6 flex items-center gap-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10 font-mono text-sm font-bold text-amber-400">
                03
              </span>
              <div className="h-px flex-1 bg-gradient-to-r from-amber-500/30 to-transparent" />
            </div>
            <h3 className="mb-4 font-display text-3xl font-bold text-zinc-50 md:text-4xl">
              Triggers
            </h3>
            <p className="mb-8 text-lg leading-relaxed text-zinc-400">
              Connect any action to any interface. HTTP endpoints, cron
              schedules, webhooks, event listeners, or MCP tools — one action,
              unlimited entry points.
            </p>
            <ul className="space-y-4">
              {[
                'REST APIs with automatic route registration',
                'Cron schedules for recurring background work',
                'Webhooks with signature verification',
                'Pub/sub events for decoupled architecture',
                'MCP tools for AI agent integration',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-[15px] text-zinc-300">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Code Window */}
          <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-900/60 shadow-2xl shadow-amber-500/5 backdrop-blur-sm">
            <div className="flex items-center gap-2 border-b border-white/[0.08] bg-zinc-950/60 px-5 py-3.5">
              <div className="h-3 w-3 rounded-full bg-zinc-700" />
              <div className="h-3 w-3 rounded-full bg-zinc-700" />
              <div className="h-3 w-3 rounded-full bg-zinc-700" />
              <span className="ml-3 font-mono text-xs text-zinc-500">triggers.ts</span>
            </div>
            <div className="overflow-x-auto p-6">
              <pre className="font-mono text-[13px] leading-7">
                <code>
                  <Line><C>{'// One action, any entry point'}</C></Line>
                  <Line />
                  <Line><C>{'// REST API'}</C></Line>
                  <Line><W>triggers.</W><F>api</F><W>(</W><S>{'\'POST\''}</S><W>,</W> <S>{'\'/users\''}</S><W>)</W></Line>
                  <Line />
                  <Line><C>{'// Scheduled cron job'}</C></Line>
                  <Line><W>triggers.</W><F>cron</F><W>(</W><S>{'\'0 0 * * *\''}</S><W>)</W> <C>{'// midnight daily'}</C></Line>
                  <Line />
                  <Line><C>{'// Incoming webhook'}</C></Line>
                  <Line><W>triggers.</W><F>webhook</F><W>(</W><S>{'\'/stripe\''}</S><W>,</W> <W>{'{'}</W></Line>
                  <Line>  <P>verify</P><W>:</W> <W>(</W><A>req</A><W>)</W> <K>{'=>'}</K> <F>verifyStripe</F><W>(</W><A>req</A><W>)</W></Line>
                  <Line><W>{'}'})</W></Line>
                  <Line />
                  <Line><C>{'// Event listener'}</C></Line>
                  <Line><W>triggers.</W><F>event</F><W>(</W><S>{'\'user.created\''}</S><W>)</W></Line>
                  <Line />
                  <Line><C>{'// MCP tool for AI agents'}</C></Line>
                  <Line><W>triggers.</W><F>mcp</F><W>(</W><S>{'\'create_user\''}</S><W>)</W></Line>
                </code>
              </pre>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ─── Syntax Highlight Helpers ─── */
function Line({ children }: { children?: React.ReactNode }) {
  return <>{children}{'\n'}</>
}
function K({ children }: { children: React.ReactNode }) {
  return <span className="text-purple-400">{children}</span>
}
function S({ children }: { children: React.ReactNode }) {
  return <span className="text-green-400">{children}</span>
}
function F({ children }: { children: React.ReactNode }) {
  return <span className="text-yellow-400">{children}</span>
}
function V({ children }: { children: React.ReactNode }) {
  return <span className="text-blue-400">{children}</span>
}
function P({ children }: { children: React.ReactNode }) {
  return <span className="text-cyan-400">{children}</span>
}
function A({ children }: { children: React.ReactNode }) {
  return <span className="text-orange-400">{children}</span>
}
function W({ children }: { children: React.ReactNode }) {
  return <span className="text-zinc-300">{children}</span>
}
function N({ children }: { children: React.ReactNode }) {
  return <span className="text-amber-300">{children}</span>
}
function C({ children }: { children: React.ReactNode }) {
  return <span className="text-zinc-600">{children}</span>
}
