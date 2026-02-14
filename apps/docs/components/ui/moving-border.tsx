'use client'

import { cn } from '@/lib/utils'
import React from 'react'

export function MovingBorder({
  children,
  duration = 2000,
  className,
  containerClassName,
  borderClassName,
  href,
  onClick,
  ...otherProps
}: {
  children: React.ReactNode
  duration?: number
  className?: string
  containerClassName?: string
  borderClassName?: string
  href?: string
  onClick?: () => void
  [key: string]: unknown
}) {
  const Component = href ? 'a' : 'button'
  
  return (
    <Component
      href={href}
      onClick={onClick}
      className={cn(
        'group relative inline-block overflow-hidden rounded-lg bg-transparent p-[1px]',
        containerClassName
      )}
      {...otherProps}
    >
      <div
        className={cn(
          'absolute inset-0 rounded-lg opacity-0 transition-opacity duration-500 group-hover:opacity-100',
          'bg-[conic-gradient(from_0deg,transparent_0_340deg,rgba(34,211,238,0.5)_360deg)]',
          borderClassName
        )}
        style={{
          animation: `spin ${duration}ms linear infinite`,
        }}
      />
      <div
        className={cn(
          'relative rounded-lg bg-zinc-950 px-6 py-3 text-sm font-medium text-white transition-colors',
          className
        )}
      >
        {children}
      </div>
    </Component>
  )
}
