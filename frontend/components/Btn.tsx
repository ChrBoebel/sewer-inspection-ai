'use client'
import { useState } from 'react'
import type { ButtonHTMLAttributes, CSSProperties, MouseEvent, ReactNode } from 'react'

type BtnColor = 'default' | 'accent' | 'green' | 'red'

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode
  color?: BtnColor
  outline?: boolean
  style?: CSSProperties
}

export default function Btn({
  children,
  color = 'default',
  outline = false,
  onClick,
  onMouseEnter,
  onMouseLeave,
  style,
  disabled,
  type,
  ...props
}: BtnProps) {
  const [hovered, setHovered] = useState(false)
  const filled = !outline || hovered
  const handleMouseEnter = (event: MouseEvent<HTMLButtonElement>) => {
    setHovered(true)
    onMouseEnter?.(event)
  }
  const handleMouseLeave = (event: MouseEvent<HTMLButtonElement>) => {
    setHovered(false)
    onMouseLeave?.(event)
  }
  const base: CSSProperties = {
    padding: '9px 16px', borderRadius: 10, fontSize: 13, fontWeight: 500,
    cursor: disabled ? 'not-allowed' : 'pointer', display: 'inline-flex',
    alignItems: 'center', gap: 8, transition: 'all .15s', border: '1px solid',
    opacity: disabled ? 0.45 : 1, fontFamily: 'inherit', letterSpacing: '-0.005em',
    boxShadow: 'var(--shadow-1)',
    ...style,
  }
  const common = {
    ...props,
    onClick,
    onMouseEnter: handleMouseEnter,
    onMouseLeave: handleMouseLeave,
    disabled,
    type: type ?? 'button',
  }
  if (color === 'accent') return <button {...common} style={{ ...base, background: 'linear-gradient(180deg, var(--accent), var(--accent-strong))', borderColor: 'var(--accent-strong)', color: '#fff', boxShadow: '0 1px 0 rgba(255,255,255,0.25) inset, 0 8px 24px -10px rgba(0,89,255,0.55)' }}>{children}</button>
  if (color === 'green')  return <button {...common} style={{ ...base, background: filled ? 'linear-gradient(180deg, #10b981, #047857)' : '#ffffff', borderColor: '#047857', color: filled ? '#fff' : '#047857', boxShadow: filled ? '0 1px 0 rgba(255,255,255,0.25) inset, 0 8px 24px -10px rgba(5,150,105,0.55)' : 'var(--shadow-1)' }}>{children}</button>
  if (color === 'red')    return <button {...common} style={{ ...base, background: filled ? 'linear-gradient(180deg, #ef4444, var(--danger))' : '#ffffff', borderColor: '#b91c1c', color: filled ? '#fff' : '#b91c1c', boxShadow: filled ? '0 1px 0 rgba(255,255,255,0.25) inset, 0 8px 24px -10px rgba(220,38,38,0.55)' : 'var(--shadow-1)' }}>{children}</button>
  return <button {...common} style={{ ...base, background: '#ffffff', borderColor: 'var(--line-2)', color: 'var(--text-0)' }}>{children}</button>
}
