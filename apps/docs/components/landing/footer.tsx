import { Github } from 'lucide-react'

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-zinc-950 px-6 py-12 md:px-10">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div>
            <div className="mb-4 flex items-center gap-2">
              <span className="text-2xl">⚡</span>
              <span className="text-xl font-bold text-zinc-50">bunbase</span>
            </div>
            <p className="text-sm text-zinc-500">
              Type-safe backend framework for Bun
            </p>
          </div>

          {/* Product */}
          <div>
            <h3 className="mb-4 text-sm font-semibold text-zinc-50">Product</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="/docs" className="text-zinc-400 hover:text-zinc-200">
                  Documentation
                </a>
              </li>
              <li>
                <a href="https://github.com/alihussnainrb/bunbase/tree/main/examples" className="text-zinc-400 hover:text-zinc-200">
                  Examples
                </a>
              </li>
              <li>
                <a href="/docs" className="text-zinc-400 hover:text-zinc-200">
                  API Reference
                </a>
              </li>
            </ul>
          </div>

          {/* Community */}
          <div>
            <h3 className="mb-4 text-sm font-semibold text-zinc-50">Community</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a
                  href="https://github.com/alihussnainrb/bunbase"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-zinc-400 hover:text-zinc-200"
                >
                  GitHub
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/alihussnainrb/bunbase/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-zinc-400 hover:text-zinc-200"
                >
                  Issues
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/alihussnainrb/bunbase/discussions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-zinc-400 hover:text-zinc-200"
                >
                  Discussions
                </a>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="mb-4 text-sm font-semibold text-zinc-50">Legal</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a
                  href="https://github.com/alihussnainrb/bunbase/blob/main/LICENSE"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-zinc-400 hover:text-zinc-200"
                >
                  MIT License
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/alihussnainrb/bunbase/blob/main/SECURITY.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-zinc-400 hover:text-zinc-200"
                >
                  Security
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 md:flex-row">
          <p className="text-sm text-zinc-500">
            © 2026 Bunbase. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/alihussnainrb/bunbase"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-400 transition hover:text-zinc-200"
            >
              <Github className="h-5 w-5" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
