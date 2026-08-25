'use client'
import { CSSProperties } from 'react'

type BadgeColor = 'green' | 'yellow' | 'red' | 'gray' | 'blue'
const map: Record<BadgeColor, { bg: string; border: string; fg: string }> = {
  green:  { bg:'#e0f5e8', border:'#90d4a8', fg:'#1a6a32' },
  yellow: { bg:'#fff8e6', border:'#fcd34d', fg:'#7a4f00' },
  red:    { bg:'#ffeaec', border:'#ffb0ba', fg:'#b01030' },
  gray:   { bg:'#f0f2f4', border:'#c5cdd6', fg:'#2f3d44' },
  blue:   { bg:'var(--accent-dim)', border:'var(--border-mid)', fg:'var(--accent)' },
}

export default function Badge({ c = 'gray', children, style }: {
  c?: BadgeColor; children: React.ReactNode; style?: CSSProperties
}) {
  const { bg, border, fg } = map[c] || map.gray
  return (
    <span style={{
      background: bg, border: `1px solid ${border}`, color: fg,
      padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 500,
      whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4,
      ...style
    }}>
      {children}
    </span>
  )
}
