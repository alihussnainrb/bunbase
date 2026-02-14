'use client'

import { cn } from '@/lib/utils'
import React, { useEffect, useRef, useState } from 'react'

type SpotlightProps = {
  className?: string
  fill?: string
}

export function Spotlight({ className, fill = 'white' }: SpotlightProps) {
  const divRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [opacity, setOpacity] = useState(0)

  const handleMouseMove = (e: MouseEvent) => {
    if (!divRef.current) return

    const rect = divRef.current.getBoundingClientRect()
    setPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }

  useEffect(() => {
    const handleMouseEnter = () => setOpacity(1)
    const handleMouseLeave = () => setOpacity(0)

    const div = divRef.current
    if (div) {
      div.addEventListener('mousemove', handleMouseMove)
      div.addEventListener('mouseenter', handleMouseEnter)
      div.addEventListener('mouseleave', handleMouseLeave)
    }

    return () => {
      if (div) {
        div.removeEventListener('mousemove', handleMouseMove)
        div.removeEventListener('mouseenter', handleMouseEnter)
        div.removeEventListener('mouseleave', handleMouseLeave)
      }
    }
  }, [])

  return (
    <div
      ref={divRef}
      className={cn(
        'pointer-events-none absolute inset-0 overflow-hidden',
        className
      )}
    >
      <div
        className="absolute inset-0 transition-opacity duration-300"
        style={{
          opacity,
          background: `radial-gradient(600px circle at ${position.x}px ${position.y}px, ${fill}, transparent 40%)`,
        }}
      />
    </div>
  )
}
