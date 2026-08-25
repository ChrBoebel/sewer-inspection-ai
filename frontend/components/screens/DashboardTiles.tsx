'use client'

import type { ReactNode } from 'react'
import { ArrowIcon } from '@/components/icons'

export function DashboardTile({ title, value, label, art, onClick, children }: {
  title: string
  value: number
  label: string
  art: ReactNode
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button className="tile glass" onClick={onClick} type="button">
      <span className="corner tl" /><span className="corner tr" />
      <span className="corner bl" /><span className="corner br" />
      <div className="tile-art" aria-hidden="true">{art}</div>
      <div className="tile-title">{title}</div>
      <div className="tile-desc">{children}</div>
      <div className="tile-foot">
        <div className="stat">{value}<span className="lbl">{label}</span></div>
        <div className="tile-arrow"><ArrowIcon /></div>
      </div>
    </button>
  )
}

export function ArtStreetList({ items }: { items: { id: string; name: string; open: number }[] }) {
  const visible = items.slice(0, 3)
  const maxOpen = Math.max(...visible.map(item => item.open), 0)
  return (
    <svg viewBox="0 0 216 84" preserveAspectRatio="xMidYMid meet" className="tile-svg">
      {visible.map((item, index) => {
        const y = 4 + index * 26
        const highlight = item.open > 0 && item.open === maxOpen
        const badgeWidth = item.open === 0 ? 34 : 44
        const badgeX = 210 - badgeWidth
        const displayName = item.name.length > 20 ? item.name.slice(0, 19) + '…' : item.name
        return (
          <g key={item.id}>
            <rect x="2" y={y} width="212" height="20" rx="4"
              fill={highlight ? 'rgba(0,89,255,0.06)' : 'rgba(255,255,255,0.7)'}
              stroke={highlight ? 'rgba(0,89,255,0.22)' : 'var(--line)'} strokeWidth="0.7" />
            <text x="9" y={y + 13} fontFamily="var(--sans)" fontSize="9"
              fill={highlight ? 'var(--accent)' : 'var(--text-0)'}
              fontWeight={highlight ? '600' : '400'}>{displayName}</text>
            <rect x={badgeX} y={y + 5} width={badgeWidth} height="10" rx="5"
              fill={item.open === 0 ? 'var(--ok-soft)' : highlight ? 'var(--accent)' : 'rgba(15,23,42,0.08)'} />
            <text x={badgeX + badgeWidth / 2} y={y + 12.5} textAnchor="middle"
              fontFamily="var(--mono)" fontSize="5.5" letterSpacing="0.4"
              fill={item.open === 0 ? 'var(--ok)' : highlight ? '#ffffff' : 'var(--text-2)'}>
              {item.open === 0 ? 'FERTIG' : `${item.open} OFFEN`}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export function ArtHistogram() {
  const bins = [3, 4, 6, 8, 11, 14, 18, 22, 17, 12, 9, 6]
  const max = Math.max(...bins)
  const barWidth = 14
  const gap = 3
  const baseY = 64
  const top = 12
  const threshold = 0.85
  const thresholdX = 4 + bins.length * (barWidth + gap) * threshold
  return (
    <svg viewBox="0 0 216 84" preserveAspectRatio="xMidYMid meet" className="tile-svg">
      <defs>
        <linearGradient id="barAccent" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.95" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.45" />
        </linearGradient>
        <linearGradient id="barOk" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--ok)" stopOpacity="0.95" />
          <stop offset="100%" stopColor="var(--ok)" stopOpacity="0.45" />
        </linearGradient>
        <linearGradient id="barLow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--text-2)" stopOpacity="0.45" />
          <stop offset="100%" stopColor="var(--text-2)" stopOpacity="0.15" />
        </linearGradient>
      </defs>
      <line x1="4" y1={baseY} x2="212" y2={baseY} stroke="var(--line-2)" strokeWidth="0.6" />
      <line x1="4" y1={baseY - 26} x2="212" y2={baseY - 26} stroke="var(--line)" strokeWidth="0.4" strokeDasharray="1 1.5" />
      <text x="6" y="10" fontFamily="var(--mono)" fontSize="5" fill="var(--text-3)" letterSpacing="0.5">VERTEILUNG · KI-KONFIDENZ</text>
      {bins.map((value, index) => {
        const x = 4 + index * (barWidth + gap)
        const height = (value / max) * (baseY - top)
        const fill = index / bins.length >= threshold
          ? 'url(#barOk)'
          : index / bins.length >= 0.55
            ? 'url(#barAccent)'
            : 'url(#barLow)'
        return <rect key={index} x={x} y={baseY - height} width={barWidth} height={height} rx="1.6" fill={fill} />
      })}
      <line x1={thresholdX} y1="14" x2={thresholdX} y2={baseY + 4} stroke="var(--ok)" strokeWidth="0.7" strokeDasharray="2 2" />
      <g transform={`translate(${thresholdX} 14)`}>
        <rect x="-22" y="-7" width="44" height="10" rx="2" fill="#ffffff" stroke="var(--ok-line)" strokeWidth="0.6" />
        <text x="0" y="0.5" textAnchor="middle" fontFamily="var(--mono)" fontSize="5.5" fill="var(--ok)" letterSpacing="0.6">≥ 85% AUTO</text>
      </g>
      <g fontFamily="var(--mono)" fontSize="4.5" fill="var(--text-3)" letterSpacing="0.4">
        <text x="4" y={baseY + 8}>0%</text>
        <text x="108" y={baseY + 8} textAnchor="middle">50%</text>
        <text x="212" y={baseY + 8} textAnchor="end">100%</text>
      </g>
    </svg>
  )
}

export function ArtArchivRows({ rows }: { rows: { id: string; name: string; date: string; diam: string }[] }) {
  const visible = rows.slice(0, 3)
  return (
    <svg viewBox="0 0 216 84" preserveAspectRatio="xMidYMid meet" className="tile-svg">
      <g fontFamily="var(--mono)" fontSize="5.5" fill="var(--text-3)" letterSpacing="0.4">
        <text x="4" y="8">AUFTRAGS-ID</text>
        <text x="88" y="8">STRASSE</text>
        <text x="172" y="8">DATUM</text>
        <text x="212" y="8" textAnchor="end">DN</text>
      </g>
      <line x1="4" y1="12" x2="212" y2="12" stroke="var(--line-2)" strokeWidth="0.5" />
      {visible.map((row, index) => {
        const y = 16 + index * 22
        const idShort = row.id.length > 10 ? row.id.slice(0, 10).toUpperCase() : row.id.toUpperCase()
        const name = row.name.length > 11 ? row.name.slice(0, 11) + '…' : row.name
        return (
          <g key={row.id}>
            <text x="4" y={y + 9} fontFamily="var(--mono)" fontSize="7" fill="var(--accent)" letterSpacing="0.2">{idShort}</text>
            <text x="88" y={y + 9} fontFamily="var(--mono)" fontSize="7" fill="var(--text-1)">{name}</text>
            <text x="172" y={y + 9} fontFamily="var(--mono)" fontSize="7" fill="var(--text-2)">{row.date}</text>
            <text x="212" y={y + 9} fontFamily="var(--mono)" fontSize="7" fill="var(--text-2)" textAnchor="end">{row.diam}</text>
            {index < visible.length - 1 && <line x1="4" y1={y + 15} x2="212" y2={y + 15} stroke="var(--line)" strokeWidth="0.4" />}
          </g>
        )
      })}
    </svg>
  )
}
