'use client'

import { cn } from '@/lib/utils'
import React, { useState } from 'react'

type Tab = {
  title: string
  value: string
  content?: string | React.ReactNode
}

export function Tabs({
  tabs: propTabs,
  containerClassName,
  activeTabClassName,
  tabClassName,
  contentClassName,
}: {
  tabs: Tab[]
  containerClassName?: string
  activeTabClassName?: string
  tabClassName?: string
  contentClassName?: string
}) {
  const [active, setActive] = useState<Tab>(propTabs[0])

  return (
    <>
      <div
        className={cn(
          'no-scrollbar relative flex w-full max-w-full flex-row items-center justify-start overflow-auto [perspective:1000px] sm:overflow-visible',
          containerClassName
        )}
      >
        {propTabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActive(tab)}
            className={cn(
              'relative rounded-full px-4 py-2 text-sm font-medium transition-colors',
              active.value === tab.value
                ? cn('text-cyan-400', activeTabClassName)
                : 'text-zinc-400 hover:text-zinc-200',
              tabClassName
            )}
          >
            {active.value === tab.value && (
              <span className="absolute inset-0 rounded-full bg-cyan-500/10" />
            )}
            <span className="relative">{tab.title}</span>
          </button>
        ))}
      </div>
      <div className={cn('mt-8', contentClassName)}>
        {active.content}
      </div>
    </>
  )
}
