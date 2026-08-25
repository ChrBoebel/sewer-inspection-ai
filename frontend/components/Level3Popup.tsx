'use client'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Finding, ValidationStatus, ALL_CLASSES, cc, sl } from '@/lib/data'
import { mediaUrl } from '@/lib/api'
import { MONO } from '@/lib/tokens'
import Badge from './Badge'
import Btn from './Btn'
import InspFrame from './InspFrame'

export default function Level3Popup({ finding: initF, allFindings, onClose, onUpdateStatus, onUpdateNote }: {
  finding: Finding
  allFindings: Finding[]
  onClose: () => void
  onUpdateStatus: (id: string, st: ValidationStatus, note?: string) => void
  onUpdateNote?: (id: string, note: string) => void
}) {
  const [finding, setFinding] = useState(initF)
  const [showVideo, setShowVideo] = useState(false)
  const [newClass, setNewClass] = useState('')
  const [classOpen, setClassOpen] = useState(false)
  const [status, setStatus] = useState<ValidationStatus>(initF.st)
  const [note, setNote] = useState(initF.note ?? '')
  const idx = allFindings.findIndex(f => f.id === finding.id)
  const canOpenVideo = Boolean(finding.videoUrl)

  const go = (dir: number) => {
    const nxt = allFindings[idx + dir]
    if (nxt) { setFinding(nxt); setStatus(nxt.st); setNote(nxt.note ?? ''); setNewClass(''); setClassOpen(false); setShowVideo(false) }
  }
  const accept = () => { setStatus('accepted'); onUpdateStatus(finding.id, 'accepted', note) }
  const reject = () => { setStatus('rejected'); onUpdateStatus(finding.id, 'rejected', note) }
  const openVideo = () => {
    if (canOpenVideo) setShowVideo(true)
  }
  const handleFrameKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!canOpenVideo || showVideo) return
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    setShowVideo(true)
  }
  const locationLabel = finding.videoId ? finding.videoId.slice(0, 8).toUpperCase() : finding.street
  const details: [string, string][] = [
    ['Position', finding.meterKnown === false ? 'm offen' : `${finding.m.toFixed(1)} m`],
    ['Zeitstempel', finding.ts],
    ['Lage im Querschnitt', finding.pos],
    ['Schweregrad', finding.sv ? `${finding.sv} / 5` : 'Stufe -'],
    ['Schadensklasse', finding.ty],
  ]

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.30)', zIndex: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        style={{ width: 'min(1120px, calc(100vw - 28px))', height: 'min(650px, calc(100vh - 28px))', background: 'var(--bg-1)',
          borderRadius: 16, overflow: 'hidden', border: '1px solid var(--line)',
          boxShadow: '0 2px 0 rgba(15,23,42,0.04), 0 32px 80px -20px rgba(15,23,42,0.22)',
          display: 'flex', flexDirection: 'column', position: 'relative' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ height: 3, background: 'linear-gradient(90deg, var(--accent) 0%, rgba(0,89,255,0.25) 100%)', flexShrink: 0 }}/>

        {/* Header */}
        <div style={{ padding: '10px 18px', background: 'var(--bg-1)', borderBottom: '1px solid var(--line)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--accent-soft)',
              border: '1px solid var(--accent-line)', display: 'grid', placeItems: 'center',
              color: 'var(--accent)', flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="8" cy="8" r="5"/>
                <line x1="8" y1="1" x2="8" y2="4"/>
                <line x1="8" y1="12" x2="8" y2="15"/>
                <line x1="1" y1="8" x2="4" y2="8"/>
                <line x1="12" y1="8" x2="15" y2="8"/>
              </svg>
            </div>
            <div>
              <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase',
                color: 'var(--text-3)', marginBottom: 1 }}>
                {locationLabel}
              </div>
              <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--accent)', fontFamily: MONO, letterSpacing: '-0.01em' }}>{finding.id}</div>
            </div>
            <span className="chip">{sl(status)}</span>
            <span className="chip accent">{finding.cf}% Konfidenz</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: MONO }}>{idx + 1} / {allFindings.length}</span>
            <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--bg-2)',
              border: '1px solid var(--line)', color: 'var(--text-1)', fontSize: 18, cursor: 'pointer',
              display: 'grid', placeItems: 'center', lineHeight: 1 }}>×</button>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Left: Image */}
          <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--line)' }}>
            <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
              {showVideo ? (
                <FindingVideoFrame finding={finding} onBackToImage={() => setShowVideo(false)} />
              ) : (
                <div
                  aria-label={canOpenVideo ? `Video bei ${finding.ts} öffnen` : undefined}
                  onClick={openVideo}
                  onKeyDown={handleFrameKeyDown}
                  role={canOpenVideo ? 'button' : undefined}
                  tabIndex={canOpenVideo ? 0 : undefined}
                  title={canOpenVideo ? `Video bei ${finding.ts} öffnen` : undefined}
                  style={{ width: '100%', height: '100%', cursor: canOpenVideo ? 'pointer' : 'default', position: 'relative' }}
                >
                  <InspFrame finding={finding}/>
                  {canOpenVideo && (
                    <span style={{
                      position: 'absolute', right: 12, top: 12, width: 34, height: 34, borderRadius: 10,
                      background: 'rgba(4,7,16,0.72)', color: '#fff', border: '1px solid rgba(255,255,255,0.18)',
                      display: 'grid', placeItems: 'center', boxShadow: '0 10px 28px rgba(0,0,0,0.24)',
                      fontSize: 15, pointerEvents: 'none',
                    }}>▶</span>
                  )}
                </div>
              )}
            </div>
            <div style={{ padding: '8px 12px', borderTop: '1px solid var(--line)',
              display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
              flexShrink: 0, background: 'var(--bg-1)' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <Btn disabled={idx === 0} onClick={() => go(-1)} style={{ padding: '7px 12px' }}>← Zurück</Btn>
                <Btn disabled={idx === allFindings.length - 1} onClick={() => go(1)} style={{ padding: '7px 12px' }}>Weiter →</Btn>
              </div>
            </div>
          </div>

          {/* Right: Details + Actions */}
          <div style={{ flex: '0 0 380px', maxWidth: '42%', minWidth: 300, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-0)' }}>
            <div style={{ padding: '12px 16px', flex: '1 1 auto', minHeight: 0, overflowY: 'auto' }}>
              <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase',
                color: 'var(--text-3)', marginBottom: 8 }}>Befunddaten</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {details.map(([label, val]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    gap: 10, paddingBottom: 7, borderBottom: '1px solid var(--line)' }}>
                    <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.12em',
                      textTransform: 'uppercase', color: 'var(--text-3)' }}>{label}</span>
                    <span style={{ fontFamily: MONO, fontSize: 13, color: 'var(--text-0)', fontWeight: 500, maxWidth: '54%', overflowWrap: 'anywhere', textAlign: 'right' }}>{val}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  gap: 10, paddingBottom: 7, borderBottom: '1px solid var(--line)' }}>
                  <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.12em',
                    textTransform: 'uppercase', color: 'var(--text-3)' }}>KI-Konfidenz</span>
                  <Badge c={cc(finding.cf) as 'green'|'yellow'|'red'}>{finding.cf}%</Badge>
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase',
                  color: 'var(--text-3)', marginBottom: 6 }}>Prüfnotiz</div>
                <textarea
                  className="sdm-input"
                  placeholder="Anmerkungen zur Validierung..."
                  value={note}
                  rows={2}
                  onChange={event => setNote(event.target.value)}
                  onBlur={() => onUpdateNote?.(finding.id, note)}
                  style={{ resize: 'vertical', minHeight: 50, lineHeight: 1.35, width: '100%' }}
                />
              </div>
            </div>

            {/* Actions */}
            <div style={{ padding: '10px 16px', borderTop: '1px solid var(--line)', background: 'var(--bg-1)',
              display: 'flex', flexDirection: 'column', gap: 7, flexShrink: 0 }}>
              <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-3)' }}>Bewertung</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Btn aria-label="Befund bestätigen" color="green" outline={status !== 'accepted'} onClick={accept} disabled={status === 'accepted'}
                  style={{ flex: 1, justifyContent: 'center', fontFamily: MONO, fontSize: 12, letterSpacing: '0.10em', textTransform: 'uppercase', padding: '7px 10px' }}>
                  <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4 4L19 6"/></svg>
                  Bestätigen
                </Btn>
                <Btn aria-label="Befund ablehnen" color="red" outline={status !== 'rejected'} onClick={reject} disabled={status === 'rejected'}
                  style={{ flex: 1, justifyContent: 'center', fontFamily: MONO, fontSize: 12, letterSpacing: '0.10em', textTransform: 'uppercase', padding: '7px 10px' }}>
                  <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
                  Ablehnen
                </Btn>
              </div>
              <div style={{ position: 'relative' }}>
                <button
                  className="cls-btn"
                  data-open={classOpen ? true : undefined}
                  onClick={() => setClassOpen(open => !open)}
                  type="button"
                >
                  {newClass
                    ? <span style={{ fontFamily: MONO, fontSize: 13 }}>{newClass}</span>
                    : <span className="cls-btn-placeholder" style={{ fontFamily: MONO, fontSize: 13 }}>Andere Klasse zuweisen...</span>
                  }
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: 'var(--text-3)' }}>
                    <path d="M6 9l6 6 6-6"/>
                  </svg>
                </button>
                {classOpen && (
                  <div className="cls-opts">
                    {ALL_CLASSES.map(option => (
                      <button
                        key={option}
                        className="cls-opt"
                        data-selected={newClass === option ? true : undefined}
                        onClick={() => {
                          setNewClass(option)
                          setClassOpen(false)
                        }}
                        type="button"
                      >
                        <span style={{ fontFamily: MONO }}>{option}</span>
                        {newClass === option && (
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)', flexShrink: 0 }}>
                            <path d="M5 12l4 4L19 6"/>
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function FindingVideoFrame({ finding, onBackToImage }: { finding: Finding; onBackToImage: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video || finding.startSeconds == null) return
    const seek = () => {
      video.currentTime = Math.max(0, finding.startSeconds ?? 0)
    }
    video.addEventListener('loadedmetadata', seek)
    if (video.readyState >= 1) seek()
    return () => video.removeEventListener('loadedmetadata', seek)
  }, [finding.id, finding.startSeconds])

  return (
    <div style={{ width: '100%', height: '100%', background: '#030508', position: 'relative', overflow: 'hidden' }}>
      {finding.videoUrl ? (
        <video
          ref={videoRef}
          controls
          preload="metadata"
          src={mediaUrl(finding.videoUrl)}
          style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#030508' }}
        />
      ) : (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'rgba(255,255,255,0.66)', fontFamily: MONO, fontSize: 12 }}>
          Videoquelle nicht verfügbar
        </div>
      )}
      <button
        onClick={onBackToImage}
        type="button"
        style={{
          position: 'absolute', right: 12, top: 12, minHeight: 32, borderRadius: 9,
          background: 'rgba(4,7,16,0.76)', color: '#fff', border: '1px solid rgba(255,255,255,0.18)',
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 10px',
          fontFamily: MONO, fontSize: 11, cursor: 'pointer',
        }}
      >
        Bild
      </button>
    </div>
  )
}
