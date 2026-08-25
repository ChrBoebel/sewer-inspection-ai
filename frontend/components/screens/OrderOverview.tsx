'use client'

import maplibregl from 'maplibre-gl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Map as MapLibreMap, Marker as MapLibreMarker } from 'maplibre-gl'
import type { Video, VideoLocation, VideoLocationUpdate } from '@/lib/types'
import type { Finding, Street } from '@/lib/data'
import type { JobsByVideo } from '@/lib/inspection-types'
import { formatCoordinate, hasLocation, locationStatusLabel, osmRasterStyle, parseOptionalCoordinate, shortId } from '@/lib/inspection-helpers'
import { EmptyState } from '@/components/Common'
import { ArrowLeftIcon, ChevronRightIcon, PenIcon, PlaySmallIcon, SearchIcon, XIcon } from '@/components/icons'

export default function OrderOverview({
  streets,
  findings,
  jobsByVideo,
  onBack,
  onOpen,
  onLocationSave,
  onLocationSuggest,
}: {
  streets: Street[]
  findings: Finding[]
  jobsByVideo: JobsByVideo
  onBack: () => void
  onOpen: (street: Street) => void
  onLocationSave: (videoId: string, location: VideoLocationUpdate) => Promise<Video>
  onLocationSuggest: (videoId: string, query?: string) => Promise<Video>
}) {
  const [query, setQuery] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const selectStreet = useCallback((street: Street) => setActiveId(street.id), [])
  const openEditor = useCallback(() => setEditorOpen(true), [])
  const closeEditor = useCallback(() => setEditorOpen(false), [])
  const filtered = useMemo(
    () => streets.filter(street => `${street.n} ${street.id}`.toLowerCase().includes(query.toLowerCase())),
    [query, streets],
  )
  const active = filtered.find(street => street.id === activeId) ?? filtered[0] ?? streets[0] ?? null

  return (
    <div className="split fade-in">
      <aside className="sidebar glass">
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
          <button className="btn ghost" onClick={onBack}><ArrowLeftIcon /> Zurück</button>
        </div>
        <div className="sidebar-head">
          <div className="eyebrow">VIDEOS · PRÜFAUFTRÄGE</div>
          <h2>Auftragsübersicht</h2>
          <div className="search">
            <SearchIcon />
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Datei oder ID suchen..." />
          </div>
        </div>
        <div className="street-list">
          {filtered.length === 0 && <div className="empty-card">Noch kein Video hochgeladen.</div>}
          {filtered.map(street => {
            const streetFindings = findings.filter(finding => finding.street === street.id)
            const open = streetFindings.filter(finding => finding.st === 'pending' || finding.st === 'edited').length
            const job = jobsByVideo[street.id]
            return (
              <div
                key={street.id}
                className={`street-row${active?.id === street.id ? ' active' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => selectStreet(street)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    selectStreet(street)
                  }
                }}
              >
                <div className="street-row-body">
                  <div className="title">{street.n}</div>
                  <div className="meta">
                    <span>{shortId(street.id)}</span>
                    <span className="sep">·</span>
                    <span>{street.len}</span>
                    <span className="sep">·</span>
                    <span className="status">
                      <i className={`dot ${street.location?.status ?? 'missing'}`} />
                      {street.location?.label ?? locationStatusLabel(street.location)}
                    </span>
                  </div>
                </div>
                <span className={`badge-mini${(job?.status === 'running' || job?.status === 'queued') ? ' running' : ''}`}>
                  {job?.status === 'running' || job?.status === 'queued' ? `${job.progress}%` : `${open} OFFEN`}
                </span>
                <button
                  type="button"
                  className="street-row-open"
                  aria-label={`${street.n} öffnen`}
                  onClick={(event) => { event.stopPropagation(); onOpen(street) }}
                >
                  <ChevronRightIcon />
                </button>
              </div>
            )
          })}
        </div>
      </aside>
      <section className="map-pane glass">
        {active ? (
          <>
            <div className="map-head">
              <div>
                <div className="eyebrow">{shortId(active.id)} · {active.mat}</div>
                <h2>{active.n}</h2>
              </div>
              {(() => {
                const activeOpen = findings.filter(finding =>
                  finding.street === active.id && (finding.st === 'pending' || finding.st === 'edited'),
                ).length
                return (
                  <button
                    className="btn berry"
                    onClick={() => onOpen(active)}
                    disabled={activeOpen === 0}
                  >
                    <PlaySmallIcon />
                    Befunde validieren
                    <span className="mono" style={{ fontSize: 11, opacity: 0.7, marginLeft: 6 }}>
                      {activeOpen} OFFEN
                    </span>
                  </button>
                )
              })()}
            </div>
            <div className={`location-workspace${editorOpen ? ' editor-open' : ''}`}>
              <VideoLocationMap
                streets={filtered.length ? filtered : streets}
                active={active}
                findings={findings}
                onSelect={selectStreet}
                onEditLocation={openEditor}
              />
              <div
                className="location-editor-backdrop"
                onClick={closeEditor}
                aria-hidden="true"
              />
              <LocationEditor
                key={active.id}
                street={active}
                onSave={onLocationSave}
                onSuggest={onLocationSuggest}
                open={editorOpen}
                onClose={closeEditor}
              />
            </div>
          </>
        ) : (
          <EmptyState title="Keine Aufträge" text="Lade ein echtes Video hoch, um einen Prüfauftrag anzulegen." />
        )}
      </section>
    </div>
  )
}

function VideoLocationMap({
  streets,
  active,
  findings,
  onSelect,
  onEditLocation,
}: {
  streets: Street[]
  active: Street
  findings: Finding[]
  onSelect: (street: Street) => void
  onEditLocation: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markersRef = useRef<Map<string, MapLibreMarker>>(new Map())
  const located = useMemo(() => streets.filter(hasLocation), [streets])
  const activeLocated = hasLocation(active)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const initialCenter: [number, number] = activeLocated && active.location
      ? [active.location.longitude!, active.location.latitude!]
      : [7.842, 47.999]
    const initialZoom = activeLocated ? 13 : 11
    mapRef.current = new maplibregl.Map({
      container: containerRef.current,
      style: osmRasterStyle(),
      center: initialCenter,
      zoom: initialZoom,
      attributionControl: false,
    })
    mapRef.current.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    mapRef.current.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
    const markers = markersRef.current
    return () => {
      markers.forEach(marker => marker.remove())
      markers.clear()
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [active.location, activeLocated])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    markersRef.current.forEach(marker => marker.remove())
    markersRef.current.clear()

    located.forEach(street => {
      const location = street.location!
      const streetFindings = findings.filter(finding => finding.street === street.id)
      const open = streetFindings.filter(finding => finding.st === 'pending' || finding.st === 'edited').length
      const element = document.createElement('button')
      element.type = 'button'
      element.className = `video-map-marker ${location.status === 'suggested' ? 'suggested' : 'confirmed'}${open > 0 ? ' has-open' : ''}${street.id === active.id ? ' active' : ''}`
      element.textContent = String(streetFindings.length)
      element.setAttribute('aria-label', `${street.n} auf Karte auswählen, ${open} offene Befunde`)
      element.addEventListener('click', () => onSelect(street))
      const marker = new maplibregl.Marker({ element, anchor: 'center' })
        .setLngLat([location.longitude!, location.latitude!])
        .addTo(map)
      markersRef.current.set(street.id, marker)
    })

    if (activeLocated) {
      return
    }
    if (located.length === 0) {
      map.easeTo({ center: [7.842, 47.999], zoom: 10, duration: 450 })
      return
    }
    if (located.length === 1) {
      const location = located[0].location!
      map.easeTo({ center: [location.longitude!, location.latitude!], zoom: 13, duration: 450 })
      return
    }
    const bounds = new maplibregl.LngLatBounds()
    located.forEach(street => bounds.extend([street.location!.longitude!, street.location!.latitude!]))
    map.fitBounds(bounds, { padding: 80, maxZoom: 14, duration: 550 })
  }, [active.id, located, activeLocated, findings, onSelect])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !activeLocated) return
    map.easeTo({
      center: [active.location!.longitude!, active.location!.latitude!],
      zoom: Math.max(map.getZoom(), 13),
      duration: 450,
    })
  }, [active.id, active.location, activeLocated])

  return (
    <div className="video-map-shell">
      <div ref={containerRef} className="video-map-canvas" />
      {located.length === 0 && (
        <div className="video-map-empty">
          <strong>Keine bestätigten Koordinaten</strong>
          <span>Standort speichern oder OCR-Vorschlag suchen.</span>
        </div>
      )}
      <button
        type="button"
        className="video-map-edit"
        onClick={onEditLocation}
        aria-label="Standort bearbeiten"
      >
        <PenIcon /> Standort
      </button>
      <div className="video-map-legend">
        <span><i className="confirmed" /> Bestätigt</span>
        <span><i className="suggested" /> Vorschlag</span>
        <span><i className="open" /> Offene Befunde</span>
      </div>
    </div>
  )
}

function LocationEditor({
  street,
  onSave,
  onSuggest,
  open,
  onClose,
}: {
  street: Street
  onSave: (videoId: string, location: VideoLocationUpdate) => Promise<Video>
  onSuggest: (videoId: string, query?: string) => Promise<Video>
  open: boolean
  onClose: () => void
}) {
  const [label, setLabel] = useState(street.location?.label ?? street.n)
  const [address, setAddress] = useState(street.location?.address ?? '')
  const [latitude, setLatitude] = useState(formatCoordinate(street.location?.latitude))
  const [longitude, setLongitude] = useState(formatCoordinate(street.location?.longitude))
  const [busy, setBusy] = useState<'save' | 'suggest' | 'confirm' | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const buildPayload = (status: VideoLocation['status']): VideoLocationUpdate => {
    const lat = parseOptionalCoordinate(latitude)
    const lng = parseOptionalCoordinate(longitude)
    return {
      latitude: lat,
      longitude: lng,
      label: label.trim() || street.n,
      address: address.trim() || null,
      source: status === 'confirmed' ? 'manual' : street.location?.source ?? 'manual',
      status: lat != null && lng != null ? status : 'missing',
      confidence: lat != null && lng != null ? status === 'confirmed' ? 1 : street.location?.confidence ?? null : null,
      raw_text: street.location?.raw_text ?? null,
    }
  }

  const save = async () => {
    setBusy('save')
    setMessage(null)
    try {
      const video = await onSave(street.id, buildPayload('confirmed'))
      setMessage(video.location.status === 'confirmed' ? 'Standort gespeichert.' : 'Standortdaten gespeichert, Koordinaten fehlen.')
    } catch {
      setMessage('Speichern fehlgeschlagen.')
    } finally {
      setBusy(null)
    }
  }

  const suggest = async () => {
    setBusy('suggest')
    setMessage(null)
    try {
      const video = await onSuggest(street.id, address || label || street.n)
      setLabel(video.location.label ?? street.n)
      setAddress(video.location.address ?? '')
      setLatitude(formatCoordinate(video.location.latitude))
      setLongitude(formatCoordinate(video.location.longitude))
      setMessage(video.location.status === 'suggested' ? 'OCR-Vorschlag gefunden.' : 'Kein Standortvorschlag gefunden.')
    } catch {
      setMessage('OCR-Vorschlag fehlgeschlagen.')
    } finally {
      setBusy(null)
    }
  }

  const confirmSuggestion = async () => {
    if (street.location?.status !== 'suggested') return
    setBusy('confirm')
    setMessage(null)
    try {
      await onSave(street.id, {
        ...street.location,
        label: label.trim() || street.location.label || street.n,
        address: address.trim() || street.location.address,
        status: 'confirmed',
        confidence: 1,
      })
      setMessage('Vorschlag übernommen.')
    } catch {
      setMessage('Übernahme fehlgeschlagen.')
    } finally {
      setBusy(null)
    }
  }

  const canConfirm = street.location?.status === 'suggested' && street.location.latitude != null && street.location.longitude != null

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <aside className={`location-editor${open ? ' open' : ''}`} aria-hidden={!open}>
      <div className="location-editor-head">
        <div>
          <div className="eyebrow">STANDORT</div>
          <h3>{locationStatusLabel(street.location)}</h3>
        </div>
        <button
          type="button"
          className="location-editor-close"
          aria-label="Schließen"
          onClick={onClose}
        >
          <XIcon />
        </button>
      </div>
      <label>
        <span>Label</span>
        <input value={label} onChange={event => setLabel(event.target.value)} placeholder="z.B. Beispielstraße" />
      </label>
      <label>
        <span>Adresse / Suchtext</span>
        <input value={address} onChange={event => setAddress(event.target.value)} placeholder="Straße, Ort" />
      </label>
      <div className="location-editor-row">
        <label>
          <span>Latitude</span>
          <input value={latitude} onChange={event => setLatitude(event.target.value)} inputMode="decimal" placeholder="47.9990" />
        </label>
        <label>
          <span>Longitude</span>
          <input value={longitude} onChange={event => setLongitude(event.target.value)} inputMode="decimal" placeholder="7.8420" />
        </label>
      </div>
      {street.location?.raw_text && (
        <div className="location-ocr">
          <span>OCR</span>
          <p>{street.location.raw_text}</p>
        </div>
      )}
      {message && <div className="location-message">{message}</div>}
      <div className="location-actions">
        <button className="btn ghost" onClick={suggest} disabled={busy !== null} type="button">
          {busy === 'suggest' ? 'Suche...' : 'OCR-Vorschlag suchen'}
        </button>
        <button className="btn ghost" onClick={confirmSuggestion} disabled={!canConfirm || busy !== null} type="button">
          {busy === 'confirm' ? 'Übernehme...' : 'Vorschlag übernehmen'}
        </button>
        <button className="btn primary" onClick={save} disabled={busy !== null} type="button">
          {busy === 'save' ? 'Speichert...' : 'Speichern'}
        </button>
      </div>
    </aside>
  )
}
