import { cn } from '@/lib/utils'
import React from 'react'

export function GridBackground({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-0',
        className
      )}
      style={{
        backgroundImage: `
          linear-gradient(to right, rgba(255, 255, 255, 0.06) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(255, 255, 255, 0.06) 1px, transparent 1px)
        `,
        backgroundSize: '70px 70px',
        maskImage: 'radial-gradient(circle at center, black 40%, transparent 100%)',
        WebkitMaskImage: 'radial-gradient(circle at center, black 40%, transparent 100%)',
      }}
    />
  )
}
