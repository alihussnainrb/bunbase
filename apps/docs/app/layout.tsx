import type { Metadata } from 'next'
import { IBM_Plex_Sans } from 'next/font/google'
import { RootProvider } from 'fumadocs-ui/provider/next'
import './global.css'

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
})

export const metadata: Metadata = {
  title: {
    default: 'Bunbase Docs',
    template: '%s | Bunbase Docs',
  },
  description: 'Official Bunbase documentation, guides, and API reference.',
}

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={ibmPlexSans.className} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  )
}
