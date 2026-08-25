'use client'

import { useEffect, useState, type DragEvent } from 'react'
import type { Job } from '@/lib/types'
import type { Finding, Street, ValidationStatus } from '@/lib/data'
import { mediaUrl } from '@/lib/api'
import { DAMAGE, MODEL_ID } from '@/app/_lib/inspection-types'
import { formatReminderShort, shortId } from '@/app/_lib/inspection-helpers'
import { SnapshotBoxes } from '@/app/_components/Common'
import { ArrowLeftIcon, BellIcon, CheckIcon, XIcon } from '@/app/_components/icons'

const KIND_STATUS: Record<string, ValidationStatus> = {
  open: 'pending',
  conf: 'accepted',
  rej: 'rejected',
}

export default function ReviewBoard({
  street,
  findings,
  job,
  onBack,
  onFinding,
  onStatus,
  onReminder,
  onAnalyze,
  highlightedFindingId,
}: {
  street: Street
  findings: Finding[]
  job: Job | null
  onBack: () => void
  onFinding: (finding: Finding) => void
  onStatus: (id: string, status: ValidationStatus) => void
  onReminder: (id: string, months: 6 | 12) => void
  onAnalyze: () => void
  highlightedFindingId?: string | null
}) {
  const reviewFindings = findings.filter(finding => finding.snapshotUrl)
  const open = reviewFindings.filter(finding => finding.st === 'pending' || finding.st === 'edited')
  const accepted = reviewFindings.filter(finding => finding.st === 'accepted')
  const rejected = reviewFindings.filter(finding => finding.st === 'rejected')
  const total = reviewFindings.length
  const done = accepted.length + rejected.length
  const progress = total
    ? Math.round((done / total) * 100)
    : job?.progress ?? 0

  useEffect(() => {
    if (!highlightedFindingId) return
    const element = document.querySelector(`[data-finding-id="${highlightedFindingId}"]`)
    element?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [highlightedFindingId, reviewFindings.length])

  return (
    <div className="kanban fade-in">
      <div className="kanban-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button className="btn" onClick={onBack}><ArrowLeftIcon /> Zurück</button>
          <div>
            <div className="eyebrow">{shortId(street.id)}</div>
            <h2>{street.n}</h2>
          </div>
        </div>
        <div className="kanban-progress">
          <span className="kanban-progress-label">Validierung</span>
          <div className="kanban-progress-track">
            <div className="kanban-progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="kanban-progress-sub">{done}/{total} · <strong>{progress}%</strong></div>
        </div>
        <div className="kanban-actions">
          <button className="btn ghost" onClick={onAnalyze}>Analyse neu starten</button>
          <a className="btn berry" href={`/reports/${street.id}`}>Bericht öffnen</a>
        </div>
      </div>
      <div className="columns">
        <FindingColumn kind="open" title="Offen · Fundbilder" className="col-open" findings={open} onFinding={onFinding} onStatus={onStatus} onReminder={onReminder} highlightedFindingId={highlightedFindingId} />
        <FindingColumn kind="conf" title="Bestätigt" className="col-conf" findings={accepted} onFinding={onFinding} onStatus={onStatus} onReminder={onReminder} highlightedFindingId={highlightedFindingId} />
        <FindingColumn kind="rej" title="Abgelehnt" className="col-rej" findings={rejected} onFinding={onFinding} onStatus={onStatus} onReminder={onReminder} highlightedFindingId={highlightedFindingId} />
      </div>
    </div>
  )
}

function FindingColumn({ kind, title, className, findings, onFinding, onStatus, onReminder, highlightedFindingId }: {
  kind: string
  title: string
  className: string
  findings: Finding[]
  onFinding: (finding: Finding) => void
  onStatus: (id: string, status: ValidationStatus) => void
  onReminder: (id: string, months: 6 | 12) => void
  highlightedFindingId?: string | null
}) {
  const [isDragOver, setIsDragOver] = useState(false)
  const targetStatus = KIND_STATUS[kind]

  return (
    <div
      className={`column glass ${className}${isDragOver ? ' drag-over' : ''}`}
      onDragOver={event => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        setIsDragOver(true)
      }}
      onDragLeave={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setIsDragOver(false)
      }}
      onDrop={event => {
        event.preventDefault()
        const id = event.dataTransfer.getData('text/plain')
        if (id && targetStatus) onStatus(id, targetStatus)
        setIsDragOver(false)
      }}
    >
      <div className="column-head">
        <div className="title"><span className="dot" />{title}</div>
        <div className="count">{findings.length} {findings.length === 1 ? 'Befund' : 'Befunde'}</div>
      </div>
      <div className="cards">
        {findings.length === 0 && (
          <div className={`empty-card${isDragOver ? ' col-empty--active' : ''}`}>
            {isDragOver ? '↓ Hier ablegen' : '- KEINE EINTRÄGE -'}
          </div>
        )}
        {findings.map((finding, index) => (
          <FindingCard
            key={finding.id}
            finding={finding}
            index={index}
            onOpen={() => onFinding(finding)}
            onStatus={onStatus}
            onReminder={onReminder}
            highlighted={highlightedFindingId === finding.id}
          />
        ))}
      </div>
    </div>
  )
}

function FindingCard({ finding, index, onOpen, onStatus, onReminder, highlighted }: {
  finding: Finding
  index: number
  onOpen: () => void
  onStatus: (id: string, status: ValidationStatus) => void
  onReminder: (id: string, months: 6 | 12) => void
  highlighted?: boolean
}) {
  const damage = DAMAGE[finding.ty]
  const models = finding.sourceModels?.length ? finding.sourceModels.join(' + ') : MODEL_ID
  const [isDragging, setIsDragging] = useState(false)
  const [reminderOpen, setReminderOpen] = useState(false)
  const canRemind = finding.st === 'accepted' || finding.st === 'rejected'
  const showQuick = finding.st === 'pending' || finding.st === 'edited' || finding.reminderIsDue
  const reminderLabel = formatReminderShort(finding.reminderDueAt)

  return (
    <div
      aria-label={`${finding.id} ${damage.name} Fund öffnen`}
      className={`finding-card ${finding.st === 'accepted' ? 'confirmed' : finding.st === 'rejected' ? 'rejected' : ''}${finding.reminderIsDue ? ' reminder-due' : ''}${highlighted ? ' highlighted' : ''}${isDragging ? ' dragging' : ''}`}
      data-finding-id={finding.id}
      draggable
      onClick={onOpen}
      onDragStart={(event: DragEvent<HTMLDivElement>) => {
        event.dataTransfer.setData('text/plain', finding.id)
        event.dataTransfer.effectAllowed = 'move'
        setIsDragging(true)
      }}
      onDragEnd={() => setIsDragging(false)}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen()
        }
      }}
      role="button"
      tabIndex={0}
      style={{ animationDelay: `${index * 35}ms` }}
    >
      <div className="thumb">
        {finding.snapshotUrl && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mediaUrl(finding.snapshotUrl)} alt={`Fundbild ${damage.name}`} className="thumb-img" />
            <SnapshotBoxes finding={finding} />
          </>
        )}
        <div className="thumb-overlay">
          <div className="top">
            <span className="code-tag">{damage.code}</span>
            <span className="code-tag">{finding.cf}%</span>
          </div>
          <div className="bottom">
            <span className="meter">{finding.meterKnown === false ? 'm offen' : `m ${finding.m.toFixed(1)}`}</span>
            <span>{finding.ts}</span>
          </div>
        </div>
      </div>
      <div className="card-body">
        <div className="card-row1">
          <span>{finding.id} · {damage.name}</span>
          <span>{finding.sv ? `STUFE ${finding.sv}` : 'STUFE -'}</span>
        </div>
        <div className="card-title">{finding.pos} · {models}</div>
        <div className="card-foot">
          <div className="confidence">
            <span className="confidence-label">KI-Konfidenz</span>
            <div className="confidence-row">
              <div className={`bar ${finding.cf >= 80 ? 'high' : finding.cf >= 50 ? 'mid' : 'low'}`}><i style={{ width: `${finding.cf}%` }} /></div>
              <span className="pct">{finding.cf}%</span>
            </div>
          </div>
          {canRemind && (
            <div className="reminder-wrap" onClick={event => event.stopPropagation()}>
              <button
                className={`reminder-btn${finding.reminderIsDue ? ' due' : finding.reminderDueAt ? ' set' : ''}`}
                onClick={() => setReminderOpen(open => !open)}
                title={finding.reminderIsDue ? 'Wiedervorlage fällig' : 'Erinnern'}
                type="button"
              >
                <BellIcon />
                <span>{finding.reminderDueAt ? reminderLabel : 'Erinnern'}</span>
              </button>
              {reminderOpen && (
                <div className="reminder-popover">
                  <button
                    onClick={() => {
                      onReminder(finding.id, 6)
                      setReminderOpen(false)
                    }}
                    type="button"
                  >
                    6M
                  </button>
                  <button
                    onClick={() => {
                      onReminder(finding.id, 12)
                      setReminderOpen(false)
                    }}
                    type="button"
                  >
                    1J
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        {showQuick && (
          <div className="quick" onClick={event => event.stopPropagation()}>
            <button className="mini ok" onClick={() => onStatus(finding.id, 'accepted')}>
              <CheckIcon /> BESTÄTIGEN
            </button>
            <button className="mini no" onClick={() => onStatus(finding.id, 'rejected')}>
              <XIcon /> ABLEHNEN
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
