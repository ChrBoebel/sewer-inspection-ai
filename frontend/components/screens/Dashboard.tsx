'use client'

import maplibregl from 'maplibre-gl'
import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import type { Map as MapLibreMap, Marker as MapLibreMarker } from 'maplibre-gl'
import type { Job, Video } from '@/lib/types'
import type { Finding } from '@/lib/data'
import { DN_OPTIONS, MAT_OPTIONS, type ArchiveEntry, type Stammdaten, type UploadLocationMetadata, type UploadMetadata } from '@/lib/inspection-types'
import { buildUploadMetadata, osmRasterStyle, parseDecimal, shortId } from '@/lib/inspection-helpers'
import { ArrowIcon, CheckIcon, ClipboardIcon, PlaySmallIcon, SmallXIcon, UploadIcon } from '@/components/icons'
import { ArtArchivRows, ArtHistogram, ArtStreetList, DashboardTile } from '@/components/screens/DashboardTiles'

function StammdatenModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (data: Stammdaten) => void }) {
  const today = new Date().toISOString().split('T')[0]
  const [form, setForm] = useState<Stammdaten>({
    strasse: '',
    dn: 'DN 300',
    material: 'Beton',
    laenge: '',
    datum: today,
    meterstart: '0',
  })
  const setField = (key: keyof Stammdaten) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [key]: event.target.value }))
  const valid = form.strasse.trim().length > 0 && parseDecimal(form.laenge) > 0

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="sdm-panel" onClick={event => event.stopPropagation()}>
        <div className="sdm-head">
          <div className="sdm-head-icon"><ClipboardIcon /></div>
          <div className="sdm-head-text">
            <div className="eyebrow"><span className="accent">NEUER PRÜFAUFTRAG</span></div>
            <div className="sdm-head-title">Stammdaten erfassen</div>
          </div>
          <button className="btn ghost" style={{ padding: '6px 10px' }} onClick={onClose} type="button"><SmallXIcon /></button>
        </div>
        <div className="sdm-body">
          <div className="sdm-field">
            <label className="sdm-label">Straße / Strecke</label>
            <input className="sdm-input" type="text" placeholder="z.B. Musterstraße" value={form.strasse} onChange={setField('strasse')} autoFocus />
          </div>
          <div className="sdm-row">
            <div className="sdm-field">
              <label className="sdm-label">Nennweite</label>
              <select className="sdm-input" value={form.dn} onChange={setField('dn')}>
                {DN_OPTIONS.map(option => <option key={option}>{option}</option>)}
              </select>
            </div>
            <div className="sdm-field">
              <label className="sdm-label">Material</label>
              <select className="sdm-input" value={form.material} onChange={setField('material')}>
                {MAT_OPTIONS.map(option => <option key={option}>{option}</option>)}
              </select>
            </div>
          </div>
          <div className="sdm-row">
            <div className="sdm-field">
              <label className="sdm-label">Kanallänge (m)</label>
              <input className="sdm-input" type="number" min="1" max="9999" placeholder="z.B. 94" value={form.laenge} onChange={setField('laenge')} />
            </div>
            <div className="sdm-field">
              <label className="sdm-label">Meterstart (m)</label>
              <input className="sdm-input" type="number" min="0" placeholder="0" value={form.meterstart} onChange={setField('meterstart')} />
            </div>
          </div>
          <div className="sdm-field">
            <label className="sdm-label">Inspektionsdatum</label>
            <input className="sdm-input" type="date" value={form.datum} onChange={setField('datum')} />
          </div>
        </div>
        <div className="sdm-foot">
          <button className="btn ghost" onClick={onClose} type="button">Abbrechen</button>
          <button className="btn primary" disabled={!valid} onClick={() => valid && onSubmit(form)} type="button">
            Weiter zur Dateiauswahl <ArrowIcon />
          </button>
        </div>
      </div>
    </div>
  )
}

function UploadLocationMiniMap({ latitude, longitude, label }: { latitude: string; longitude: string; label: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markerRef = useRef<MapLibreMarker | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const lat = Number(latitude)
    const lng = Number(longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return

    markerRef.current?.remove()
    mapRef.current?.remove()

    const map = new maplibregl.Map({
      container,
      style: osmRasterStyle(),
      center: [lng, lat],
      zoom: 15,
      attributionControl: false,
      interactive: false,
    })
    const markerElement = document.createElement('div')
    markerElement.className = 'ulm-map-marker'
    markerRef.current = new maplibregl.Marker({ element: markerElement, anchor: 'center' })
      .setLngLat([lng, lat])
      .addTo(map)
    mapRef.current = map

    const resize = window.setTimeout(() => map.resize(), 80)
    return () => {
      window.clearTimeout(resize)
      markerRef.current?.remove()
      markerRef.current = null
      map.remove()
      mapRef.current = null
    }
  }, [latitude, longitude])

  return (
    <div className="ulm-map-card" aria-label={`${label} auf Karte geprüft`}>
      <div ref={containerRef} className="ulm-map-canvas" />
      <div className="ulm-map-status">
        <CheckIcon />
        <span>Standort geprüft</span>
      </div>
    </div>
  )
}

function UploadLocationModal({
  files,
  defaultLabel,
  onCancel,
  onSubmit,
}: {
  files: File[]
  defaultLabel?: string
  onCancel: () => void
  onSubmit: (location: UploadLocationMetadata) => void
}) {
  const [mode, setMode] = useState<UploadLocationMetadata['mode']>('shared')
  const [address, setAddress] = useState(defaultLabel ?? '')
  const [coords, setCoords] = useState<{ latitude: string; longitude: string } | null>(null)
  const [geoState, setGeoState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const fileLabel = files.length === 1 ? files[0].name : `${files.length} Videos`
  const addressValue = address.trim()
  const canSubmit = mode === 'address' ? addressValue.length > 0 : coords !== null

  const requestPosition = () => {
    if (!navigator.geolocation) {
      setGeoState('error')
      setMessage('Nicht verfügbar.')
      return
    }
    setGeoState('loading')
    setMessage(null)
    navigator.geolocation.getCurrentPosition(
      position => {
        setCoords({
          latitude: position.coords.latitude.toFixed(6),
          longitude: position.coords.longitude.toFixed(6),
        })
        setGeoState('ready')
        setMessage('Standort bereit.')
      },
      () => {
        setGeoState('error')
        setMessage('Freigabe fehlgeschlagen.')
      },
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 10_000 },
    )
  }

  const submit = () => {
    if (!canSubmit) return
    if (mode === 'address') {
      onSubmit({ mode: 'address', label: addressValue, address: addressValue })
      return
    }
    if (coords) {
      onSubmit({
        mode: 'shared',
        label: defaultLabel?.trim() || 'Aktueller Standort',
        latitude: coords.latitude,
        longitude: coords.longitude,
      })
    }
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="sdm-panel ulm-panel" onClick={event => event.stopPropagation()}>
        <div className="sdm-head">
          <div className="sdm-head-icon"><UploadIcon small /></div>
          <div className="sdm-head-text">
            <div className="eyebrow"><span className="accent">UPLOAD</span></div>
            <div className="sdm-head-title">Standort angeben</div>
          </div>
          <button className="btn ghost" style={{ padding: '6px 10px' }} onClick={onCancel} type="button"><SmallXIcon /></button>
        </div>
        <div className="sdm-body ulm-body">
          <div className="ulm-file">
            <span className="uq-icon"><PlaySmallIcon /></span>
            <span>{fileLabel}</span>
          </div>
          <div className="ulm-modes" role="group" aria-label="Standortart">
            <button
              className={`ulm-mode${mode === 'shared' ? ' active' : ''}`}
              aria-pressed={mode === 'shared'}
              onClick={() => setMode('shared')}
              type="button"
            >
              Standort teilen
            </button>
            <button
              className={`ulm-mode${mode === 'address' ? ' active' : ''}`}
              aria-pressed={mode === 'address'}
              onClick={() => setMode('address')}
              type="button"
            >
              Adresse
            </button>
          </div>

          {mode === 'shared' ? (
            <div className="ulm-pane">
              <button className="ulm-share" onClick={requestPosition} disabled={geoState === 'loading'} type="button">
                {geoState === 'loading' ? 'Standort wird gelesen...' : 'Aktuellen Standort verwenden'}
              </button>
              {coords && (
                <UploadLocationMiniMap
                  latitude={coords.latitude}
                  longitude={coords.longitude}
                  label={defaultLabel?.trim() || 'Aktueller Standort'}
                />
              )}
            </div>
          ) : (
            <div className="sdm-field">
              <label className="sdm-label" htmlFor="upload-location-address">Adresse</label>
              <input
                id="upload-location-address"
                className="sdm-input"
                type="text"
                placeholder="Straße, Ort"
                value={address}
                onChange={event => setAddress(event.target.value)}
                autoFocus
              />
            </div>
          )}

          {message && <div className={`ulm-message ${geoState === 'error' ? 'error' : 'ok'}`}>{message}</div>}
        </div>
        <div className="sdm-foot">
          <button className="btn ghost" onClick={onCancel} type="button">Abbrechen</button>
          <button className="btn primary" disabled={!canSubmit} onClick={submit} type="button">
            Upload starten <ArrowIcon />
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Dashboard({
  findings,
  archiveEntries,
  activeJobs,
  videos,
  loading,
  uploading,
  onNavigateOrders,
  onNavigateStats,
  onNavigateArchive,
  onUpload,
}: {
  findings: Finding[]
  archiveEntries: ArchiveEntry[]
  activeJobs: Job[]
  videos: Video[]
  loading: boolean
  uploading: boolean
  onNavigateOrders: () => void
  onNavigateStats: () => void
  onNavigateArchive: () => void
  onUpload: (files: File[], metadata?: UploadMetadata) => Promise<void>
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [queuedFiles, setQueuedFiles] = useState<File[]>([])
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null)
  const [showStammdaten, setShowStammdaten] = useState(false)
  const [showLocationModal, setShowLocationModal] = useState(false)
  const [stammdaten, setStammdaten] = useState<Stammdaten | null>(null)
  const open = findings.filter(finding => finding.st === 'pending' || finding.st === 'edited').length
  const streetItems = videos.slice(0, 3).map(video => ({
    id: video.id,
    name: video.original_filename ?? shortId(video.id),
    open: findings.filter(finding => finding.street === video.id && (finding.st === 'pending' || finding.st === 'edited')).length,
  }))
  const archivRows = archiveEntries.slice(0, 3).map(entry => ({
    id: entry.id,
    name: entry.n,
    date: entry.date,
    diam: entry.diam,
  }))
  const pipelineRows = activeJobs.filter(isRunningAnalysisJob).map(job => {
    const video = videos.find(candidate => candidate.id === job.video_id)
    return {
      id: shortId(job.id),
      key: job.id,
      name: video?.original_filename ?? shortId(job.video_id),
      progress: job.progress,
    }
  })

  const handleFiles = (files: File[]) => {
    const selectedVideos = files.filter(file => file.type.startsWith('video/') || /\.(mp4|mov|mkv|avi)$/i.test(file.name))
    if (selectedVideos.length === 0 || uploading) return
    setPendingFiles(selectedVideos)
    setShowLocationModal(true)
  }

  const startUpload = async (location: UploadLocationMetadata) => {
    const files = pendingFiles
    if (files.length === 0) return
    const metadata = buildUploadMetadata(stammdaten, location)
    setPendingFiles([])
    setShowLocationModal(false)
    setQueuedFiles(prev => [...prev, ...files])
    try {
      await onUpload(files, metadata)
    } finally {
      setQueuedFiles(prev => prev.filter(file => !files.includes(file)))
    }
  }

  const cancelPendingUpload = () => {
    setShowLocationModal(false)
    setPendingFiles([])
  }

  return (
    <main className="landing fade-in">
      <div className="tile-grid fade-in-up">
        <DashboardTile
          title="Prüfaufträge"
          value={open}
          label="OFFEN"
          art={<ArtStreetList items={streetItems} />}
          onClick={onNavigateOrders}
        >
          Validierung der KI-Vorschläge.
        </DashboardTile>
        <DashboardTile
          title="Statistiken"
          value={findings.length}
          label="DATENPUNKTE"
          art={<ArtHistogram />}
          onClick={onNavigateStats}
        >
          Befundauswertung nach Schadensklasse und Straße.
        </DashboardTile>
        <DashboardTile
          title="Archiv"
          value={archiveEntries.length}
          label="AUFTRÄGE"
          art={<ArtArchivRows rows={archivRows} />}
          onClick={onNavigateArchive}
        >
          Abgeschlossene Inspektionen und Export.
        </DashboardTile>
      </div>

      <section
        className={`upload-zone glass${dragging ? ' is-drag' : ''}${queuedFiles.length || stammdaten ? ' has-files' : ''}`}
        onDragOver={event => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event: DragEvent<HTMLElement>) => {
          event.preventDefault()
          setDragging(false)
          handleFiles(Array.from(event.dataTransfer.files))
        }}
      >
        <div className="upload-zone-label">
          <span className="eyebrow" style={{ fontSize: 13, letterSpacing: '0.18em' }}><span className="accent">NEUER PRÜFAUFTRAG</span></span>
        </div>
        <div className="upload-left">
          <div className="upload-icon" aria-hidden="true"><UploadIcon /></div>
          <div className="upload-copy">
            <h2 className="upload-title">Drohnenmaterial hochladen</h2>
            <div className="upload-sub">
              KI klassifiziert anschließend automatisch nach EN&nbsp;13508-2.
            </div>
          </div>
        </div>
        <div className="upload-right">
          <div className="upload-formats">
            {['.mp4', '.mov', '.mkv', 'H.265'].map(format => <span key={format} className="chip mono">{format}</span>)}
          </div>
          <div className="upload-actions">
            <input
              ref={inputRef}
              type="file"
              accept="video/*"
              multiple
              style={{ display: 'none' }}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                handleFiles(Array.from(event.target.files ?? []))
                event.currentTarget.value = ''
              }}
            />
            <button
              className={`btn${stammdaten ? ' success' : ' ghost'}`}
              onClick={() => setShowStammdaten(true)}
              type="button"
            >
              {stammdaten ? <><CheckIcon /> {stammdaten.strasse}</> : 'Stammdaten'}
            </button>
            <button className="btn berry" onClick={() => inputRef.current?.click()} disabled={uploading} type="button">
              <UploadIcon small /> {uploading ? 'Upload läuft...' : 'Datei wählen'}
            </button>
          </div>
        </div>
        <div className="upload-drop-hint"><span className="mono">— oder Datei in dieses Feld ziehen —</span></div>
        {stammdaten && (
          <div className="sdm-summary">
            <CheckIcon />
            <span className="sdm-summary-text">
              {stammdaten.strasse} · {stammdaten.dn} · {stammdaten.material} · {stammdaten.laenge} m · ab m {stammdaten.meterstart} · {new Date(stammdaten.datum).toLocaleDateString('de-DE')}
            </span>
            <button className="sdm-summary-edit" onClick={() => setShowStammdaten(true)} type="button">Ändern</button>
          </div>
        )}
        {queuedFiles.length > 0 && (
          <div className="upload-queue">
            {queuedFiles.map((file, index) => (
              <div key={`${file.name}-${index}`} className="uq-row">
                <span className="uq-icon"><PlaySmallIcon /></span>
                <span className="uq-name">{file.name}</span>
                <span className="uq-size mono">{(file.size / (1024 * 1024)).toFixed(1)} MB</span>
                <span className="chip mono accent">VORBEREITUNG</span>
                <button className="queue-cancel" onClick={() => setConfirmRemove(index)} title="Abbrechen" type="button">
                  <SmallXIcon />
                </button>
              </div>
            ))}
          </div>
        )}
        {confirmRemove !== null && (
          <div className="confirm-backdrop" onClick={() => setConfirmRemove(null)}>
            <div className="confirm-dialog" onClick={event => event.stopPropagation()}>
              <div className="confirm-kicker">Analyse abbrechen</div>
              <div className="confirm-title">Datei entfernen?</div>
              <div className="confirm-file">{queuedFiles[confirmRemove]?.name}</div>
              <div className="confirm-copy">Die Datei wird aus der Warteschlange entfernt. Ein bereits gestarteter Backend-Job wird dadurch nicht gestoppt.</div>
              <div className="confirm-actions">
                <button onClick={() => setConfirmRemove(null)} type="button">Behalten</button>
                <button
                  className="danger"
                  onClick={() => {
                    setQueuedFiles(prev => prev.filter((_, index) => index !== confirmRemove))
                    setConfirmRemove(null)
                  }}
                  type="button"
                >
                  Ja, abbrechen
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
      {showStammdaten && (
        <StammdatenModal
          onClose={() => setShowStammdaten(false)}
          onSubmit={data => {
            setStammdaten(data)
            setShowStammdaten(false)
            window.setTimeout(() => inputRef.current?.click(), 50)
          }}
        />
      )}
      {showLocationModal && (
        <UploadLocationModal
          files={pendingFiles}
          defaultLabel={stammdaten?.strasse}
          onCancel={cancelPendingUpload}
          onSubmit={location => void startUpload(location)}
        />
      )}

      <div className="pipeline-strip glass">
        <div className="ps-label">
          <span className="ps-pulse" />
          <span className="eyebrow" style={{ fontSize: 13, letterSpacing: '0.18em' }}><span className="accent">IN KI-ANALYSE</span></span>
        </div>
        <div className="ps-rows">
          {loading && <div className="empty-row">Backend-Daten werden geladen...</div>}
          {!loading && pipelineRows.length === 0 && <div className="empty-row">Keine laufenden KI-Jobs.</div>}
          {!loading && pipelineRows.map(job => (
            <div key={job.key} className="ps-row">
              <span className="mono ps-id">{job.id}</span>
              <span className="ps-name">{job.name}</span>
              <div className="ps-bar"><i style={{ width: `${job.progress}%` }} /></div>
              <span className="mono ps-pct">{job.progress}%</span>
              <button className="ps-cancel" type="button" disabled aria-label="Analyse abbrechen">
                <SmallXIcon />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="status-bar glass">
        <div className="left"><span>SYNC · vor 2 Min.</span></div>
        <div className="right"><span>09.05.2026</span><span style={{ color: 'var(--accent)' }}>v3.4.1</span></div>
      </div>
    </main>
  )
}

function isRunningAnalysisJob(job: Job): boolean {
  return job.status === 'running'
}
