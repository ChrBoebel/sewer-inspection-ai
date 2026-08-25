'use client'
import { useEffect, useRef } from 'react'
import { Finding } from '@/lib/data'
import { mediaUrl } from '@/lib/api'
import { MONO } from '@/lib/tokens'
import Badge from './Badge'
import Btn from './Btn'

export default function VideoPopup({ finding, onClose }: { finding: Finding; onClose: () => void }) {
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
  }, [finding.startSeconds])

  return (
    <div
      style={{ position: 'absolute', inset: 0, background: 'rgba(15,62,23,0.6)', zIndex: 20,
        display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--bg)', borderRadius: 14, width: 640, overflow: 'hidden', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 500, fontSize: 14 }}>Videoausschnitt — {finding.id}</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Badge style={{ fontFamily: MONO }}>{finding.ts}</Badge>
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--muted)',
              fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
          </div>
        </div>
        <div style={{ background: '#030508', height: 320, position: 'relative', overflow: 'hidden' }}>
          {finding.videoUrl ? (
            <video
              ref={videoRef}
              controls
              preload="metadata"
              src={mediaUrl(finding.videoUrl)}
              style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#030508' }}
            />
          ) : (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
              justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
              <div style={{ width: 56, height: 56, background: 'var(--accent-dim)', border: '1.5px solid var(--accent)',
                borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, color: 'var(--accent)' }}>▶</div>
              <div style={{ fontSize: 12, color: '#666', fontFamily: MONO }}>Videoquelle nicht verfügbar</div>
            </div>
          )}
        </div>
        <div style={{ padding: '14px 22px', display: 'flex', justifyContent: 'flex-end' }}>
          <Btn onClick={onClose}>Schließen</Btn>
        </div>
      </div>
    </div>
  )
}
