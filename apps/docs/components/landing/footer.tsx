import { Github } from 'lucide-react'

const links = {
  product: [
    { label: 'Documentation', href: '/docs' },
    { label: 'Examples', href: 'https://github.com/alihussnainrb/bunbase/tree/main/examples', external: true },
    { label: 'API Reference', href: '/docs' },
  ],
  community: [
    { label: 'GitHub', href: 'https://github.com/alihussnainrb/bunbase', external: true },
    { label: 'Issues', href: 'https://github.com/alihussnainrb/bunbase/issues', external: true },
    { label: 'Discussions', href: 'https://github.com/alihussnainrb/bunbase/discussions', external: true },
  ],
  legal: [
    { label: 'MIT License', href: 'https://github.com/alihussnainrb/bunbase/blob/main/LICENSE', external: true },
  ],
}

export function Footer() {
  return (
    <footer className="relative bg-zinc-950">
      {/* Top gradient border */}
      <div className="h-px w-full bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />

      <div className="mx-auto max-w-7xl px-6 py-16 md:px-10 md:py-20">
        <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-12">
          {/* Brand */}
          <div className="lg:col-span-5">
            <div className="mb-4 flex items-center gap-2.5">
              <span className="text-xl">⚡</span>
              <span className="font-display text-lg font-bold text-zinc-100">bunbase</span>
            </div>
            <p className="max-w-xs text-sm leading-relaxed text-zinc-600">
              Type-safe backend framework built for Bun.
              Actions, Modules, Triggers — everything you need.
            </p>
            <a
              href="https://github.com/alihussnainrb/bunbase"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex items-center gap-2 text-sm text-zinc-500 transition-colors hover:text-zinc-300"
            >
              <Github className="h-4 w-4" />
              Star on GitHub
            </a>
          </div>

          {/* Links */}
          <div className="grid grid-cols-3 gap-8 lg:col-span-7">
            <FooterColumn title="Product" links={links.product} />
            <FooterColumn title="Community" links={links.community} />
            <FooterColumn title="Legal" links={links.legal} />
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-16 border-t border-white/[0.05] pt-8">
          <p className="text-xs text-zinc-700">
            © {new Date().getFullYear()} Bunbase. MIT Licensed.
          </p>
        </div>
      </div>
    </footer>
  )
}

function FooterColumn({
  title,
  links,
}: {
  title: string
  links: { label: string; href: string; external?: boolean }[]
}) {
  return (
    <div>
      <h3 className="mb-4 text-xs font-semibold uppercase tracking-widest text-zinc-500">
        {title}
      </h3>
      <ul className="space-y-3">
        {links.map((link) => (
          <li key={link.label}>
            <a
              href={link.href}
              {...(link.external
                ? { target: '_blank', rel: 'noopener noreferrer' }
                : {})}
              className="text-sm text-zinc-600 transition-colors hover:text-zinc-300"
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
