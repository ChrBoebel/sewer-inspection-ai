'use client'
import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'

export type SearchItem = {
  id: string
  label: string
  sub: string
  category: 'pruefauftrag' | 'archiv'
}

export type ReminderItem = {
  id: string
  findingId: string
  streetId: string
  label: string
  sub: string
  dueAt: string
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor"
         strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7"/>
      <path d="M20 20l-3.5-3.5"/>
    </svg>
  )
}

function ArrowRight() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor"
         strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6"/>
    </svg>
  )
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor"
         strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/>
      <path d="M10 21h4"/>
    </svg>
  )
}

function SearchRow({ item, hovered, onHover, onSelect }: {
  item: SearchItem
  hovered: boolean
  onHover: (id: string | null) => void
  onSelect: (item: SearchItem) => void
}) {
  const catColor = item.category === 'pruefauftrag' ? 'var(--accent)' : 'var(--ok)'
  return (
    <div
      onMouseEnter={() => onHover(item.id)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onSelect(item)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '9px 14px',
        background: hovered ? 'rgba(8,145,178,0.06)' : 'transparent',
        cursor: 'pointer',
        transition: 'background 0.1s',
        borderLeft: `2px solid ${hovered ? catColor : 'transparent'}`,
        outline: 'none',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-0)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {item.label}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--mono)', letterSpacing: '0.05em', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {item.sub}
        </div>
      </div>
      <div style={{ color: hovered ? catColor : 'var(--text-3)', flexShrink: 0, transition: 'color 0.1s', display: 'flex', alignItems: 'center' }}>
        <ArrowRight/>
      </div>
    </div>
  )
}

export default function TopBar({
  onCrumb,
  searchItems = [],
  reminderItems = [],
  onSearchNavigate,
  onReminderNavigate,
  user,
  onLogout,
}: {
  level?: number
  onCrumb?: (l: number) => void
  searchItems?: SearchItem[]
  reminderItems?: ReminderItem[]
  onSearchNavigate?: (item: SearchItem) => void
  onReminderNavigate?: (item: ReminderItem) => void
  user?: { name: string; initials: string; role: string }
  onLogout?: () => void
}) {
  const [q, setQ] = useState('')
  const [dropOpen, setDropOpen] = useState(false)
  const [reminderOpen, setReminderOpen] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const reminderRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = q.trim().length > 0
    ? searchItems.filter(item =>
        item.label.toLowerCase().includes(q.toLowerCase()) ||
        item.id.toLowerCase().includes(q.toLowerCase()) ||
        item.sub.toLowerCase().includes(q.toLowerCase())
      )
    : []

  const pruef = filtered.filter(i => i.category === 'pruefauftrag')
  const archiv = filtered.filter(i => i.category === 'archiv')
  const allFiltered = [...pruef, ...archiv]
  const noResults = q.trim().length > 0 && filtered.length === 0

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropOpen(false)
        setQ('')
        setHoveredId(null)
      }
      if (reminderRef.current && !reminderRef.current.contains(e.target as Node)) {
        setReminderOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // reset keyboard selection when query changes
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setDropOpen(false); setQ(''); setHoveredId(null)
      inputRef.current?.blur()
      return
    }
    if (!dropOpen || allFiltered.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const idx = allFiltered.findIndex(i => i.id === hoveredId)
      setHoveredId(allFiltered[Math.min(idx + 1, allFiltered.length - 1)].id)
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      const idx = allFiltered.findIndex(i => i.id === hoveredId)
      setHoveredId(idx <= 0 ? null : allFiltered[idx - 1].id)
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const target = hoveredId
        ? allFiltered.find(i => i.id === hoveredId)
        : allFiltered[0]
      if (target) handleSelect(target)
    }
  }

  const handleSelect = (item: SearchItem) => {
    onSearchNavigate?.(item)
    setDropOpen(false)
    setQ('')
    setHoveredId(null)
  }

  const showDrop = dropOpen && (filtered.length > 0 || noResults)

  return (
    <div className="topbar">
      <div className="brand">
        <div
          onClick={() => onCrumb?.(0)}
          style={{
            width: 124, height: 38, borderRadius: 9, overflow: 'hidden', flexShrink: 0,
            boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
            cursor: 'pointer',
          }}
        >
          <Image
            src="/logo-placeholder.svg"
            alt="SewerScan"
            width={124}
            height={38}
            unoptimized
            style={{ objectFit: 'contain', objectPosition: '50% 50%', display: 'block' }}
          />
        </div>
      </div>

      {/* spacer pushes right block to far right */}
      <div style={{ flex: 1 }}/>

      {/* Global Search */}
      <div ref={containerRef} style={{ position: 'relative', flexShrink: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 7,
          background: 'rgba(255,255,255,0.7)',
          border: `1px solid ${dropOpen ? 'rgba(8,145,178,0.45)' : 'var(--border)'}`,
          borderRadius: 8, padding: '5px 10px', width: 220,
          boxShadow: dropOpen ? '0 0 0 2px rgba(8,145,178,0.12)' : 'none',
          transition: 'border-color 0.15s, box-shadow 0.15s',
        }}>
          <span style={{ color: 'var(--text-3)', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
            <SearchIcon/>
          </span>
          <input
            ref={inputRef}
            value={q}
            onChange={e => { setQ(e.target.value); setDropOpen(true); setHoveredId(null) }}
            onFocus={() => setDropOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder="Auftrag, Straße, ID suchen…"
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              fontSize: 12, color: 'var(--text-0)', fontFamily: 'inherit', minWidth: 0,
            }}
          />
          {q && (
            <button
              onClick={() => { setQ(''); setDropOpen(false); inputRef.current?.focus() }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0, fontSize: 15, lineHeight: 1, display: 'flex', alignItems: 'center' }}
            >
              ×
            </button>
          )}
        </div>

        {showDrop && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0,
            background: 'rgba(255,255,255,0.96)',
            backdropFilter: 'blur(16px)',
            border: '1px solid var(--border)',
            borderRadius: 12, boxShadow: '0 12px 40px rgba(15,23,42,0.14)',
            zIndex: 200, overflow: 'hidden', minWidth: 340,
          }}>
            {noResults && (
              <div style={{ padding: '18px 16px', textAlign: 'center', color: 'var(--text-3)', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.1em' }}>
                KEINE ERGEBNISSE
              </div>
            )}

            {pruef.length > 0 && (
              <>
                <div style={{
                  padding: '9px 14px 6px', fontSize: 10, fontFamily: 'var(--mono)',
                  color: 'var(--text-3)', letterSpacing: '0.12em',
                  borderBottom: '1px solid var(--line)',
                  display: 'flex', alignItems: 'center', gap: 7,
                  background: 'rgba(8,145,178,0.03)',
                }}>
                  <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }}/>
                  PRÜFAUFTRÄGE
                  <span style={{ marginLeft: 'auto', opacity: 0.6 }}>{pruef.length}</span>
                </div>
                {pruef.map(item => (
                  <SearchRow key={item.id} item={item} hovered={hoveredId === item.id} onHover={setHoveredId} onSelect={handleSelect}/>
                ))}
              </>
            )}

            {archiv.length > 0 && (
              <>
                <div style={{
                  padding: '9px 14px 6px', fontSize: 10, fontFamily: 'var(--mono)',
                  color: 'var(--text-3)', letterSpacing: '0.12em',
                  borderTop: pruef.length > 0 ? '1px solid var(--border)' : 'none',
                  borderBottom: '1px solid var(--line)',
                  display: 'flex', alignItems: 'center', gap: 7,
                  background: 'rgba(16,185,129,0.03)',
                }}>
                  <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: 'var(--ok)', flexShrink: 0 }}/>
                  ARCHIV
                  <span style={{ marginLeft: 'auto', opacity: 0.6 }}>{archiv.length}</span>
                </div>
                {archiv.map(item => (
                  <SearchRow key={item.id} item={item} hovered={hoveredId === item.id} onHover={setHoveredId} onSelect={handleSelect}/>
                ))}
              </>
            )}

            {allFiltered.length > 0 && (
              <div style={{
                padding: '7px 14px', fontSize: 10, fontFamily: 'var(--mono)',
                color: 'var(--text-3)', letterSpacing: '0.08em',
                borderTop: '1px solid var(--line)',
                display: 'flex', gap: 14,
                background: 'rgba(15,23,42,0.015)',
              }}>
                <span>↑↓ navigieren</span>
                <span>↵ öffnen</span>
                <span>Esc schließen</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="topbar-right">
        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="reminder-topbar" ref={reminderRef}>
              <button
                className={`reminder-topbar-btn${reminderItems.length > 0 ? ' has-items' : ''}`}
                onClick={() => setReminderOpen(open => !open)}
                title="Wiedervorlagen"
                type="button"
              >
                <BellIcon />
                {reminderItems.length > 0 && <span>{reminderItems.length}</span>}
              </button>
              {reminderOpen && (
                <div className="reminder-menu">
                  <div className="reminder-menu-head">Wiedervorlage</div>
                  {reminderItems.length === 0 && (
                    <div className="reminder-empty">Keine fällig</div>
                  )}
                  {reminderItems.map(item => (
                    <button
                      key={item.id}
                      className="reminder-menu-row"
                      onClick={() => {
                        onReminderNavigate?.(item)
                        setReminderOpen(false)
                      }}
                      type="button"
                    >
                      <span>{item.label}</span>
                      <em>{item.sub}</em>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="user-chip" title={user.role}>
              <span>{user.name.toUpperCase()}</span>
              <span className="avatar" role="img" aria-label={`${user.name} Profilbild`}>{user.initials}</span>
            </div>
            <button
              onClick={onLogout}
              title="Abmelden"
              style={{
                background: 'none', border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 7, padding: '5px 9px', cursor: 'pointer',
                color: 'var(--text-3)', fontSize: 11, fontFamily: 'var(--font-jetbrains), monospace',
                letterSpacing: '0.05em', transition: 'color 0.15s, border-color 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--danger)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(220,38,38,0.4)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.12)' }}
            >
              LOGOUT
            </button>
          </div>
        )}
      </div>

    </div>
  )
}
