'use client'

import { useMemo, useState, type CSSProperties } from 'react'
import Level3Popup from '@/components/Level3Popup'
import type { Finding, ValidationStatus } from '@/lib/data'
import { DAMAGE, type ArchiveEntry } from '@/app/_lib/inspection-types'
import { exportCSV, shortId, statusLabel } from '@/app/_lib/inspection-helpers'
import { EmptyState } from '@/app/_components/Common'
import { ArrowIcon, ArrowLeftIcon, CheckIcon, SearchIcon, XIcon } from '@/app/_components/icons'

type ArchivFilter = 'all' | 'accepted' | 'rejected'

const MONO = 'var(--mono)'
const ARCHIVE_DETAIL_GRID = '4px 48px 1fr 68px 64px 68px 44px 130px 92px 28px'

const archiveTH: CSSProperties = {
  padding: '10px 16px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text-2)',
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  whiteSpace: 'nowrap',
  fontFamily: MONO,
}

const archiveTD: CSSProperties = { padding: '11px 16px' }

function ExportIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 4v12" />
      <path d="m6 10 6 6 6-6" />
      <path d="M4 20h16" />
    </svg>
  )
}

export default function ArchivePage({ entries, findings, initialEntryId, onBack }: {
  entries: ArchiveEntry[]
  findings: Finding[]
  initialEntryId?: string
  onBack: () => void
}) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<ArchiveEntry | null>(
    () => entries.find(entry => entry.id === initialEntryId) ?? null,
  )
  const [hoveredRow, setHoveredRow] = useState<string | null>(null)

  const filtered = entries.filter(entry =>
    `${entry.n} ${entry.id}`.toLowerCase().includes(query.toLowerCase()),
  )

  return (
    <div className="page-full fade-in">
      <div className="page-header">
        <button className="btn" onClick={onBack}><ArrowLeftIcon /> Zurück</button>
        <div>
          <div className="eyebrow" style={{ marginBottom: 2 }}>INSPEKTIONEN · ABGESCHLOSSEN</div>
          <h2>Archiv</h2>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-2)' }}>
            {entries.length} Aufträge
          </span>
          <button className="btn berry" onClick={() => exportCSV(entries, findings)}>
            <ExportIcon /> Alle exportieren (CSV)
          </button>
        </div>
      </div>

      <div className="glass search-row">
        <SearchIcon />
        <input
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Straße oder Auftrags-ID suchen…"
        />
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: MONO, letterSpacing: '0.07em', padding: '4px 4px 6px', flexShrink: 0 }}>
        Zeile anklicken, um die Inspektion zu öffnen
      </div>

      <div className="glass" style={{ overflow: 'hidden', flex: 1, minHeight: 0 }}>
        <div style={{ overflowY: 'auto', maxHeight: '100%' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
              <tr style={{ borderBottom: '1px solid var(--line)', background: 'var(--bg-2)' }}>
                {['Auftrags-ID', 'Straße', 'Datum', 'Länge', 'DN', 'Material', 'Befunde', ''].map(header => (
                  <th key={header} style={archiveTH}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry, index) => {
                const hovered = hoveredRow === entry.id
                return (
                  <tr
                    key={entry.id}
                    onClick={() => setSelected(entry)}
                    onMouseEnter={() => setHoveredRow(entry.id)}
                    onMouseLeave={() => setHoveredRow(null)}
                    style={{
                      borderBottom: '1px solid var(--line)',
                      cursor: 'pointer',
                      background: hovered
                        ? 'rgba(0,89,255,0.05)'
                        : index % 2 ? 'rgba(15,23,42,0.012)' : 'transparent',
                      transition: 'background 0.1s',
                    }}
                  >
                    <td style={{ ...archiveTD, fontFamily: MONO, fontSize: 12, color: 'var(--accent)', fontWeight: hovered ? 700 : 500 }}>
                      {shortId(entry.id)}
                    </td>
                    <td style={{ ...archiveTD, fontWeight: 500, color: 'var(--text-0)' }}>{entry.n}</td>
                    <td style={{ ...archiveTD, fontFamily: MONO, fontSize: 12, color: 'var(--text-2)' }}>{entry.date}</td>
                    <td style={{ ...archiveTD, fontFamily: MONO, fontSize: 12, color: 'var(--text-1)' }}>{entry.len}</td>
                    <td style={{ ...archiveTD, fontFamily: MONO, fontSize: 12, color: 'var(--text-1)' }}>{entry.diam}</td>
                    <td style={{ ...archiveTD, color: 'var(--text-1)' }}>{entry.mat}</td>
                    <td style={{ ...archiveTD, fontFamily: MONO, fontWeight: 600, color: 'var(--text-0)' }}>{entry.total}</td>
                    <td style={archiveTD} onClick={event => event.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {entry.done && (
                          <button
                            className="btn ghost"
                            style={{ padding: '4px 10px', fontSize: 11 }}
                            onClick={event => {
                              event.stopPropagation()
                              exportCSV([entry], findings)
                            }}
                          >
                            <ExportIcon size={11} /> CSV
                          </button>
                        )}
                        <a
                          className="btn ghost"
                          style={{ padding: '4px 10px', fontSize: 11 }}
                          href={`/reports/${entry.id}`}
                          onClick={event => event.stopPropagation()}
                        >
                          Report
                        </a>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtered.length === 0 && <EmptyState title="Kein Treffer" text="Die Suche passt zu keinem Auftrag." />}
        </div>
      </div>

      {selected && (
        <ArchiveDetail
          entry={selected}
          findings={findings.filter(finding => finding.street === selected.id)}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

function ArchiveDetail({ entry, findings: initialFindings, onClose }: {
  entry: ArchiveEntry
  findings: Finding[]
  onClose: () => void
}) {
  const [findings, setFindings] = useState<Finding[]>(initialFindings)
  const [activeFinding, setActiveFinding] = useState<Finding | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [filter, setFilter] = useState<ArchivFilter>('all')

  const acceptedCount = findings.filter(finding => finding.st === 'accepted').length
  const rejectedCount = findings.filter(finding => finding.st === 'rejected').length

  const visibleFindings = useMemo(() => {
    if (filter === 'accepted') return findings.filter(finding => finding.st === 'accepted')
    if (filter === 'rejected') return findings.filter(finding => finding.st === 'rejected')
    return findings
  }, [filter, findings])

  const toggleFilter = (next: ArchivFilter) => setFilter(prev => prev === next ? 'all' : next)

  const updateStatus = (id: string, status: ValidationStatus) =>
    setFindings(prev => prev.map(finding => finding.id === id ? { ...finding, st: status } : finding))
  const updateNote = (id: string, note: string) =>
    setFindings(prev => prev.map(finding => finding.id === id ? { ...finding, note } : finding))

  return (
    <>
      <div
        className="modal-backdrop"
        onClick={onClose}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <div
          className="archive-detail glass"
          onClick={event => event.stopPropagation()}
          style={{ width: '88vw', maxWidth: 1060, height: '83vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}
        >
          <div style={{ height: 3, background: 'linear-gradient(90deg, var(--accent) 0%, rgba(0,89,255,0.25) 100%)', flexShrink: 0 }} />

          <div style={{ padding: '14px 22px', background: 'var(--bg-1)', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--accent-soft)', border: '1px solid var(--accent-line)', display: 'grid', placeItems: 'center', color: 'var(--accent)', flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="4" rx="1" />
                  <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
                  <path d="M10 12h4" />
                </svg>
              </div>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 2 }}>{entry.n}</div>
                <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--accent)', fontFamily: MONO, letterSpacing: '-0.01em' }}>{shortId(entry.id)}</div>
              </div>
              <span className="chip">{entry.date}</span>
              <span className="chip">{entry.diam} · {entry.mat} · {entry.len}</span>
            </div>
            <button
              onClick={onClose}
              style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--bg-2)', border: '1px solid var(--line)', color: 'var(--text-1)', fontSize: 18, cursor: 'pointer', display: 'grid', placeItems: 'center', lineHeight: 1 }}
              aria-label="Schließen"
            >×</button>
          </div>

          <div style={{ padding: '10px 22px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, background: 'var(--bg-1)' }}>
            <span style={{ fontSize: 11, fontFamily: MONO, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-3)' }}>
              {visibleFindings.length === findings.length
                ? `${findings.length} Befunde`
                : `${visibleFindings.length} von ${findings.length} · gefiltert`}
            </span>
            {filter !== 'all' && (
              <button
                onClick={() => setFilter('all')}
                style={{ fontSize: 10, fontFamily: MONO, letterSpacing: '0.06em', color: 'var(--accent)', background: 'var(--accent-soft)', border: '1px solid var(--accent-line)', borderRadius: 5, padding: '2px 8px', cursor: 'pointer' }}
              >
                FILTER AUFHEBEN ×
              </button>
            )}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button
                className={`archiv-filter-btn${filter === 'accepted' ? ' archiv-filter-btn--ok' : ''}`}
                onClick={() => toggleFilter('accepted')}
              >
                <CheckIcon /> Bestätigt
                <span className="mono" style={{ fontSize: 11, opacity: 0.7, marginLeft: 2 }}>{acceptedCount}</span>
              </button>
              <button
                className={`archiv-filter-btn${filter === 'rejected' ? ' archiv-filter-btn--danger' : ''}`}
                onClick={() => toggleFilter('rejected')}
              >
                <XIcon /> Abgelehnt
                <span className="mono" style={{ fontSize: 11, opacity: 0.7, marginLeft: 2 }}>{rejectedCount}</span>
              </button>
              <button
                className={`archiv-filter-btn${filter === 'all' ? ' archiv-filter-btn--primary' : ''}`}
                onClick={() => setFilter('all')}
              >
                Gesamt
                <span className="mono" style={{ fontSize: 11, opacity: 0.7, marginLeft: 2 }}>{findings.length}</span>
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: ARCHIVE_DETAIL_GRID, columnGap: 10, padding: '7px 20px', background: 'var(--bg-1)', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
            {['', 'Code', 'Bezeichnung', 'Befund', 'Lage', 'Meter', 'KL.', 'Konfidenz', 'Status', ''].map((header, index) => (
              <span key={index} style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.13em', textTransform: 'uppercase', color: 'var(--text-3)', fontWeight: 600 }}>
                {header}
              </span>
            ))}
          </div>

          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: 'var(--bg-0)' }}>
            {visibleFindings.length === 0 ? (
              <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-3)', fontFamily: MONO, fontSize: 12, letterSpacing: '0.12em' }}>
                — KEINE EINTRÄGE —
              </div>
            ) : visibleFindings.map(finding => {
              const damage = DAMAGE[finding.ty]
              const isAccepted = finding.st === 'accepted'
              const isRejected = finding.st === 'rejected'
              const cfColor = finding.cf >= 85 ? 'var(--ok)' : finding.cf >= 70 ? 'var(--warn)' : 'var(--danger)'
              const hovered = hoveredId === finding.id
              const meterLabel = finding.meterKnown === false ? 'm offen' : `m ${finding.m.toFixed(1)}`
              const fIdx = finding.id.lastIndexOf('-F')
              const idTail = fIdx >= 0 ? finding.id.slice(fIdx + 1) : finding.id
              return (
                <div
                  key={finding.id}
                  onClick={() => setActiveFinding(finding)}
                  onMouseEnter={() => setHoveredId(finding.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: ARCHIVE_DETAIL_GRID,
                    columnGap: 10,
                    alignItems: 'center',
                    padding: '0 20px',
                    minHeight: 48,
                    background: hovered
                      ? (isAccepted ? 'rgba(16,185,129,0.07)' : isRejected ? 'rgba(220,38,38,0.06)' : 'var(--accent-soft)')
                      : 'transparent',
                    borderBottom: '1px solid var(--line)',
                    cursor: 'pointer',
                    transition: 'background 0.1s ease',
                  }}
                >
                  <div style={{ width: 4, height: 26, borderRadius: 2, background: isAccepted ? 'var(--ok)' : isRejected ? 'var(--danger)' : 'var(--accent)' }} />
                  <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.06em' }}>
                    {damage.code}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {damage.name}
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-3)' }}>{idTail}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{finding.pos}</span>
                  <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-1)' }}>{meterLabel}</span>
                  <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-2)' }}>
                    {finding.sv != null ? `KL. ${finding.sv}` : '—'}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <div style={{ flex: 1, height: 4, background: 'rgba(15,23,42,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: `${finding.cf}%`, height: '100%', background: cfColor, borderRadius: 2 }} />
                    </div>
                    <span style={{ fontFamily: MONO, fontSize: 11, color: cfColor, minWidth: 30, textAlign: 'right' }}>
                      {finding.cf}%
                    </span>
                  </div>
                  <span className={`chip${isAccepted ? ' ok' : isRejected ? ' rej' : ''}`}>
                    {statusLabel(finding.st)}
                  </span>
                  <div style={{ display: 'flex', justifyContent: 'center', color: hovered ? 'var(--accent)' : 'var(--text-3)', transition: 'color 0.1s' }}>
                    <ArrowIcon />
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ padding: '11px 22px', borderTop: '1px solid var(--line)', background: 'var(--bg-1)', display: 'flex', justifyContent: 'flex-end', gap: 10, flexShrink: 0 }}>
            <button className="btn ghost" onClick={() => exportCSV([entry], findings)}>
              <ExportIcon /> CSV-Export (EN 13508-2)
            </button>
            <button className="btn ghost" onClick={onClose}>Schließen</button>
          </div>
        </div>
      </div>

      {activeFinding && (
        <Level3Popup
          finding={activeFinding}
          allFindings={findings}
          onClose={() => setActiveFinding(null)}
          onUpdateStatus={updateStatus}
          onUpdateNote={updateNote}
        />
      )}
    </>
  )
}
