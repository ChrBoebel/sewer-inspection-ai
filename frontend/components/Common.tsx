'use client'

import type { Finding } from '@/lib/data'
import { bboxStyle, modelColor } from '@/lib/inspection-helpers'

export function SnapshotBoxes({ finding }: { finding: Finding }) {
  if (!finding.videoWidth || !finding.videoHeight) return null
  const detections = finding.snapshotDetections?.length ? finding.snapshotDetections : []
  return (
    <div className="snapshot-box-layer">
      {detections.slice(0, 6).map(detection => {
        const style = bboxStyle(detection.bbox, finding.videoWidth ?? 1, finding.videoHeight ?? 1)
        return <span key={detection.id} style={{ ...style, borderColor: modelColor(detection.source_model) }} />
      })}
    </div>
  )
}

export function SystemNotice({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="system-notice">
      <span>{message}</span>
      <button onClick={onClose}>×</button>
    </div>
  )
}

export function MetaCell({ label, value }: { label: string; value: string }) {
  return <div className="cell"><div className="lbl">{label}</div><div className="val">{value}</div></div>
}

export function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass stat-box">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  )
}

export function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  )
}
