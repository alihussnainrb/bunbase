import type { Metadata } from 'next'
import { RootProvider } from 'fumadocs-ui/provider/next'
import './global.css'

export const metadata: Metadata = {
  title: {
    default: 'Bunbase - Type-safe backend framework for Bun',
    template: '%s | Bunbase',
  },
  description: 'Build backends the right way with Actions, Modules, and Triggers. Type-safe, batteries-included backend framework for Bun.',
}

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className="font-body" suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  )
}
