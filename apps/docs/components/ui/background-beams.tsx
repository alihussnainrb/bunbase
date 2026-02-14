'use client'

import { cn } from '@/lib/utils'
import React from 'react'

export function BackgroundBeams({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-0 overflow-hidden',
        className
      )}
    >
      <svg
        className="absolute inset-0 h-full w-full"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="beam-gradient-1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(34, 211, 238, 0)" />
            <stop offset="50%" stopColor="rgba(34, 211, 238, 0.3)" />
            <stop offset="100%" stopColor="rgba(34, 211, 238, 0)" />
          </linearGradient>
          <linearGradient id="beam-gradient-2" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(255, 157, 66, 0)" />
            <stop offset="50%" stopColor="rgba(255, 157, 66, 0.2)" />
            <stop offset="100%" stopColor="rgba(255, 157, 66, 0)" />
          </linearGradient>
        </defs>
        
        {/* Beam 1 */}
        <path
          d="M-100 0 L300 400"
          stroke="url(#beam-gradient-1)"
          strokeWidth="2"
          fill="none"
          className="animate-beam-1"
        />
        
        {/* Beam 2 */}
        <path
          d="M500 -100 L100 300"
          stroke="url(#beam-gradient-2)"
          strokeWidth="2"
          fill="none"
          className="animate-beam-2"
        />
        
        {/* Beam 3 */}
        <path
          d="M-50 200 L350 600"
          stroke="url(#beam-gradient-1)"
          strokeWidth="1.5"
          fill="none"
          className="animate-beam-3"
        />
        
        {/* Beam 4 */}
        <path
          d="M600 100 L200 500"
          stroke="url(#beam-gradient-2)"
          strokeWidth="1.5"
          fill="none"
          className="animate-beam-4"
        />
      </svg>
    </div>
  )
}
