'use client'
import type { CSSProperties } from 'react'

import { Finding } from '@/lib/data'
import { mediaUrl } from '@/lib/api'
import { MONO } from '@/lib/tokens'

export default function InspFrame({ finding }: { finding: Finding }) {
  const col = finding.cf > 50 ? '#f0b429' : '#e84444'
  const detections = finding.snapshotDetections?.length
    ? finding.snapshotDetections
    : finding.bbox
      ? [{
          id: finding.id,
          video_id: finding.videoId ?? finding.street,
          frame_index: finding.snapshotFrameIndex ?? 0,
          timestamp_seconds: finding.startSeconds ?? 0,
          class_name: finding.ty,
          confidence: finding.cf / 100,
          bbox: finding.bbox,
          source_model: 'sewer-yolo26m',
        }]
      : []

  if (finding.snapshotUrl) {
    return (
      <div style={{ width: '100%', height: '100%', background: '#040710', position: 'relative', overflow: 'hidden' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt={`Fundbild ${finding.ty} bei ${finding.ts}`}
          src={mediaUrl(finding.snapshotUrl)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
        />
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(circle at 50% 50%, transparent 55%, rgba(0,0,0,0.30) 100%)',
        }}/>
        {detections.map((detection) => {
          const style = containedBboxStyle(
            detection.bbox,
            finding.videoWidth ?? undefined,
            finding.videoHeight ?? undefined,
          )
          if (!style) return null
          const color = colorForSource(detection.source_model)
          return (
            <span
              key={detection.id}
              style={{
                ...style,
                position: 'absolute',
                border: `2px solid ${color}`,
                boxShadow: `0 0 0 1px rgba(0,0,0,0.45), 0 0 18px ${color}55`,
                pointerEvents: 'none',
              }}
            >
              <span style={{
                position: 'absolute', left: 0, top: -22,
                background: 'rgba(0,0,0,0.78)', color,
                border: `1px solid ${color}`,
                borderRadius: 4, padding: '2px 6px',
                fontFamily: MONO, fontSize: 10, whiteSpace: 'nowrap',
              }}>
                {detection.class_name} · {Math.round(detection.confidence * 100)}%
              </span>
            </span>
          )
        })}
        <FrameFooter finding={finding} label={`${detections.length || 1} MARKIERUNG${detections.length === 1 ? '' : 'EN'}`} />
      </div>
    )
  }

  return (
    <div style={{ width: '100%', height: '100%', background: '#040710', position: 'relative', overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(circle at 50% 50%, transparent 38%, rgba(0,0,0,0.75) 100%)', zIndex: 2,
      }}/>
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.08, zIndex: 1,
        backgroundImage: 'linear-gradient(rgba(30,80,50,0.5) 1px,transparent 1px),linear-gradient(90deg,rgba(30,80,50,0.5) 1px,transparent 1px)',
        backgroundSize: '30px 30px',
      }}/>
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 1 }} viewBox="0 0 480 320" preserveAspectRatio="xMidYMid meet">
        <ellipse cx="240" cy="160" rx="150" ry="118" fill="none" stroke="rgba(40,70,50,0.5)" strokeWidth="1.5"/>
        <ellipse cx="240" cy="160" rx="100" ry="78"  fill="none" stroke="rgba(30,55,40,0.4)" strokeWidth="1"/>
        <line x1="90" y1="160" x2="390" y2="160" stroke="rgba(20,50,30,0.3)" strokeWidth="1" strokeDasharray="6,5"/>
        <rect x="195" y="125" width="70" height="45" fill="none" stroke={col} strokeWidth="1.5" opacity="0.85"/>
        <line x1="195" y1="125" x2="175" y2="105" stroke={col} strokeWidth="1" opacity="0.6"/>
        <rect x="118" y="92" width="56" height="18" rx="2" fill="rgba(0,0,0,0.7)" stroke={col} strokeWidth="1" opacity="0.9"/>
        <text x="146" y="104" textAnchor="middle" fill={col} fontSize="9" fontFamily={MONO} fontWeight="600">{finding.ty} {finding.cf}%</text>
      </svg>
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 3,
        background: 'linear-gradient(transparent,rgba(0,0,0,0.85))', padding: '12px 16px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <FooterContent finding={finding} label="SYNTHETISCHER FALLBACK" />
      </div>
    </div>
  )
}

function FrameFooter({ finding, label }: { finding: Finding; label: string }) {
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 3,
      background: 'linear-gradient(transparent,rgba(0,0,0,0.85))', padding: '12px 16px',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    }}>
      <FooterContent finding={finding} label={label} />
    </div>
  )
}

function FooterContent({ finding, label }: { finding: Finding; label: string }) {
  return (
    <>
      <div style={{ display: 'flex', gap: 16, fontFamily: MONO, fontSize: 11, color: 'rgba(255,255,255,0.62)' }}>
        <span>m {finding.meterKnown === false ? 'offen' : finding.m.toFixed(1)}</span>
        <span>{finding.ts}</span>
        <span>{finding.pos}</span>
      </div>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.38)', fontFamily: MONO }}>{label}</div>
    </>
  )
}

function containedBboxStyle(
  bbox: number[],
  width?: number,
  height?: number,
): CSSProperties | undefined {
  if (!width || !height || bbox.length < 4) return undefined
  const containerRatio = 480 / 320
  const imageRatio = width / height
  let imageWidthPercent = 100
  let imageHeightPercent = 100
  let xOffset = 0
  let yOffset = 0
  if (imageRatio > containerRatio) {
    imageHeightPercent = (containerRatio / imageRatio) * 100
    yOffset = (100 - imageHeightPercent) / 2
  } else {
    imageWidthPercent = (imageRatio / containerRatio) * 100
    xOffset = (100 - imageWidthPercent) / 2
  }
  const left = xOffset + clampPercent((bbox[0] / width) * 100) * (imageWidthPercent / 100)
  const top = yOffset + clampPercent((bbox[1] / height) * 100) * (imageHeightPercent / 100)
  const right = xOffset + clampPercent((bbox[2] / width) * 100) * (imageWidthPercent / 100)
  const bottom = yOffset + clampPercent((bbox[3] / height) * 100) * (imageHeightPercent / 100)
  return {
    left: `${left}%`,
    top: `${top}%`,
    width: `${Math.max(0.5, right - left)}%`,
    height: `${Math.max(0.5, bottom - top)}%`,
  }
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value))
}

function colorForSource(sourceModel: string): string {
  if (sourceModel === 'sewer-yolo26s-finetune') return '#ff8a3d'
  if (sourceModel === 'sewer-yolo26m') return '#28a7ff'
  return '#dce5df'
}
