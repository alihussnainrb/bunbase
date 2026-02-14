import { cn } from '@/lib/utils'
import React from 'react'

export function BentoGrid({
  className,
  children,
}: {
  className?: string
  children?: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'grid auto-rows-[minmax(15rem,auto)] grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3',
        className
      )}
    >
      {children}
    </div>
  )
}

export function BentoGridItem({
  className,
  title,
  description,
  header,
  icon,
}: {
  className?: string
  title?: string | React.ReactNode
  description?: string | React.ReactNode
  header?: React.ReactNode
  icon?: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'group/bento row-span-1 flex flex-col justify-between space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6 transition-all hover:border-cyan-500/30 hover:bg-white/8 hover:shadow-xl',
        className
      )}
    >
      {header}
      <div className="transition-all duration-200 group-hover/bento:translate-x-1">
        {icon}
        <div className="mb-2 mt-2 font-semibold text-zinc-50">
          {title}
        </div>
        <div className="text-sm font-normal text-zinc-400">
          {description}
        </div>
      </div>
    </div>
  )
}
