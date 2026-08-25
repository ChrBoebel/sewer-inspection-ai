'use client'

import maplibregl from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'
import type { Map as MapLibreMap, Marker as MapLibreMarker } from 'maplibre-gl'
import type { Finding, Street } from '@/lib/data'
import { DAMAGE, KNOWN_CLASSES } from '@/lib/inspection-types'
import { hasLocation, osmRasterStyle } from '@/lib/inspection-helpers'
import { EmptyState, StatBox } from '@/components/Common'
import { ArrowLeftIcon, ChevronRightIcon } from '@/components/icons'

const DAMAGE_CHART_COLORS: Record<Finding['ty'], string> = {
  connection_defect: '#0059FF',
  crack: '#2F7CFF',
  roots: '#AD2379',
  joint_fault: '#8F1B64',
  deposit: '#0F8B7C',
  obstruction_or_other: '#526176',
  pipe_end: '#7A8699',
  water_level: '#0891B2',
  unknown: '#A3ADBC',
}

type StreetMetric = Street & {
  total: number
  accepted: number
  open: number
  rejected: number
  damageTypes: StreetDamageType[]
}

type StreetDamageType = {
  className: Finding['ty']
  code: string
  name: string
  count: number
  color: string
}

type DamageFilter = Finding['ty'] | 'all'

const PROFILE_BATCH_SIZE = 5

export default function StatsPage({
  streets,
  findings,
  onBack,
}: {
  streets: Street[]
  findings: Finding[]
  onBack: () => void
}) {
  const [mapDamageFilter, setMapDamageFilter] = useState<DamageFilter>('all')
  const [visibleProfileCount, setVisibleProfileCount] = useState(PROFILE_BATCH_SIZE)
  const total = findings.length
  const accepted = findings.filter(finding => finding.st === 'accepted').length
  const rejected = findings.filter(finding => finding.st === 'rejected').length
  const precision = Math.round((accepted / Math.max(1, accepted + rejected)) * 100)
  const avgConfidence = Math.round(findings.reduce((sum, finding) => sum + finding.cf, 0) / Math.max(1, total))
  const byType = KNOWN_CLASSES.map(className => ({
    className,
    ...DAMAGE[className],
    count: findings.filter(finding => finding.ty === className).length,
  })).filter(row => row.count > 0).sort((a, b) => b.count - a.count)
  const distributionTotal = byType.reduce((sum, row) => sum + row.count, 0)
  const damageDistribution = byType.reduce<(
    typeof byType[number] & { color: string; share: number; start: number; end: number }
  )[]>((rows, row) => {
    const share = (row.count / Math.max(1, distributionTotal)) * 100
    const start = rows.at(-1)?.end ?? 0
    return rows.concat({
      ...row,
      color: damageClassColor(row.className),
      share,
      start,
      end: start + share,
    })
  }, [])
  const damageChartBackground = damageDistribution.length > 0
    ? `conic-gradient(${damageDistribution.map(row => `${row.color} ${row.start.toFixed(2)}% ${row.end.toFixed(2)}%`).join(', ')})`
    : 'var(--bg-2)'
  const byStreet: StreetMetric[] = streets.map(street => {
    const streetFindings = findings.filter(finding => finding.street === street.id)
    const damageTypes = KNOWN_CLASSES.map(className => ({
      className,
      ...DAMAGE[className],
      count: streetFindings.filter(finding => finding.ty === className).length,
      color: damageClassColor(className),
    })).filter(row => row.count > 0).sort((a, b) => b.count - a.count)
    return {
      ...street,
      total: streetFindings.length,
      accepted: streetFindings.filter(finding => finding.st === 'accepted').length,
      open: streetFindings.filter(finding => finding.st === 'pending' || finding.st === 'edited').length,
      rejected: streetFindings.filter(finding => finding.st === 'rejected').length,
      damageTypes,
    }
  })
  const visibleStreetProfiles = byStreet.slice(0, visibleProfileCount)
  const hiddenProfileCount = Math.max(0, byStreet.length - visibleStreetProfiles.length)
  const mapFindings = mapDamageFilter === 'all'
    ? findings
    : findings.filter(finding => finding.ty === mapDamageFilter)
  const mapStreets: StreetMetric[] = streets.map(street => {
    const streetFindings = mapFindings.filter(finding => finding.street === street.id)
    const damageTypes = KNOWN_CLASSES.map(className => ({
      className,
      ...DAMAGE[className],
      count: streetFindings.filter(finding => finding.ty === className).length,
      color: damageClassColor(className),
    })).filter(row => row.count > 0).sort((a, b) => b.count - a.count)
    return {
      ...street,
      total: streetFindings.length,
      accepted: streetFindings.filter(finding => finding.st === 'accepted').length,
      open: streetFindings.filter(finding => finding.st === 'pending' || finding.st === 'edited').length,
      rejected: streetFindings.filter(finding => finding.st === 'rejected').length,
      damageTypes,
    }
  }).filter(street => mapDamageFilter === 'all' || street.total > 0)
  const priorityFindings = findings
    .filter(finding => finding.st !== 'rejected')
    .map(finding => ({ finding, score: priorityScore(finding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
  const confidenceBins = [
    { label: 'Hoch >= 80%', count: findings.filter(finding => finding.cf >= 80).length, tone: 'ok' },
    { label: 'Mittel 50-79%', count: findings.filter(finding => finding.cf >= 50 && finding.cf < 80).length, tone: 'warn' },
    { label: 'Gering < 50%', count: findings.filter(finding => finding.cf < 50).length, tone: 'danger' },
  ]
  const maxConfidenceBin = Math.max(...confidenceBins.map(bin => bin.count), 1)

  return (
    <div className="page-full fade-in">
      <div className="page-header">
        <button className="btn ghost" onClick={onBack}><ArrowLeftIcon /> Zurück</button>
        <div>
          <div className="eyebrow">ANALYTIK · AUSWERTUNG</div>
          <h2>Statistiken</h2>
        </div>
      </div>
      <div className="stats-grid">
        <StatBox label="Befunde gesamt" value={String(total)} />
        <StatBox label="Review-Präzision" value={`${precision}%`} />
        <StatBox label="Bestätigt" value={String(accepted)} />
        <StatBox label="Abgelehnt" value={String(rejected)} />
      </div>
      <div className="technician-grid">
        <section className="glass technician-panel technician-panel-wide">
          <div className="analytics-panel-heading">
            <h3>Rohr-Streckenprofil</h3>
          </div>
          {byStreet.length === 0 && <EmptyState title="Kein Profil" text="Nach Upload und Analyse entsteht hier die Rohrstrecke." />}
          {visibleStreetProfiles.map(street => (
            <PipeProfile key={street.id} street={street} findings={findings.filter(finding => finding.street === street.id)} />
          ))}
          {hiddenProfileCount > 0 && (
            <div className="profile-more-row">
              <button
                className="profile-more-btn"
                onClick={() => setVisibleProfileCount(count => Math.min(count + PROFILE_BATCH_SIZE, byStreet.length))}
                type="button"
              >
                <ChevronRightIcon />
                <span>Mehr anzeigen</span>
                <em>{hiddenProfileCount}</em>
              </button>
            </div>
          )}
        </section>
        <section className="glass technician-panel">
          <div className="analytics-panel-heading">
            <h3>Wartungsprioritäten</h3>
            <span>Prüfreihenfolge</span>
          </div>
          {priorityFindings.length === 0 && <EmptyState title="Keine Prioritäten" text="Bestätige oder prüfe Befunde, um Prioritäten zu sehen." />}
          {priorityFindings.map(({ finding, score }) => {
            const damage = DAMAGE[finding.ty]
            return (
              <div key={finding.id} className="priority-row">
                <div>
                  <strong>{damage.name}</strong>
                  <span>{finding.meterKnown === false ? finding.ts : `m ${finding.m.toFixed(1)}`} · {finding.cf}% KI · {statusLabel(finding.st)}</span>
                </div>
                <em>{score}</em>
              </div>
            )
          })}
        </section>
      </div>
      <div className="analytics-grid">
        <section className="glass analytics-panel analytics-panel-compact stats-damage-panel">
          <div className="analytics-panel-heading">
            <h3>Schadensklassen-Verteilung</h3>
            {distributionTotal > 0 && <span>{distributionTotal} Befunde</span>}
          </div>
          {byType.length === 0 && <EmptyState title="Noch keine Befunde" text="Starte eine Analyse, um Verteilungen zu sehen." />}
          {damageDistribution.length > 0 && (
            <div className="stats-donut-layout">
              <div
                className="stats-donut"
                role="img"
                aria-label={`Schadensklassen-Verteilung: ${damageDistribution.map(row => `${row.name} ${row.count}`).join(', ')}`}
                style={{ background: damageChartBackground }}
              >
                <div className="stats-donut-core">
                  <strong>{distributionTotal}</strong>
                  <span>Befunde</span>
                </div>
              </div>
              <div className="stats-donut-legend">
                {damageDistribution.map(row => (
                  <div key={row.className} className="stats-donut-row">
                    <i className="stats-donut-swatch" style={{ background: row.color }} />
                    <span className="stats-donut-code mono">{row.code}</span>
                    <strong title={row.name}>{row.name}</strong>
                    <em>{row.count}</em>
                    <b>{formatShare(row.share)}</b>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
        <div className="analytics-side">
          <section className="glass analytics-panel analytics-panel-compact">
            <div className="analytics-panel-heading stats-map-heading">
              <h3>Straßen-Übersicht</h3>
              <div className="stats-map-tools">
                <select
                  aria-label="Schadensart filtern"
                  className="stats-map-filter"
                  value={mapDamageFilter}
                  onChange={event => setMapDamageFilter(event.target.value as DamageFilter)}
                >
                  <option value="all">Alle Schadensarten</option>
                  {byType.map(row => (
                    <option key={row.className} value={row.className}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {mapStreets.length === 0 && <EmptyState title="Keine Treffer" text="Für diese Schadensart gibt es keine Standorte." />}
            {mapStreets.length > 0 && <StreetDamageMap streets={mapStreets} />}
          </section>
          <section className="glass analytics-panel analytics-panel-compact">
            <div className="analytics-panel-heading">
              <h3>KI-Konfidenz</h3>
              <span>{avgConfidence}% Ø</span>
            </div>
            {total === 0 && <EmptyState title="Keine Konfidenzen" text="Nach der Analyse erscheinen hier KI-Konfidenzen." />}
            {total > 0 && confidenceBins.map(bin => (
              <div key={bin.label} className="stats-confidence-row">
                <span>{bin.label}</span>
                <div className="stats-bar-track">
                  <i className={`is-${bin.tone}`} style={{ width: `${(bin.count / maxConfidenceBin) * 100}%` }} />
                </div>
                <strong>{bin.count}</strong>
              </div>
            ))}
            {total > 0 && (
              <div className="analytics-average">
                <span>Durchschnitt</span>
                <strong>{avgConfidence}%</strong>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

function StreetDamageMap({ streets }: { streets: StreetMetric[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markersRef = useRef<Map<string, MapLibreMarker>>(new Map())
  const didAutoFitRef = useRef(false)
  const latestStreetsRef = useRef(streets)
  const locatedCount = streets.filter(hasLocation).length
  const markerKey = streets
    .filter(hasLocation)
    .map(street => [
      street.id,
      street.location?.latitude,
      street.location?.longitude,
      street.n,
      street.total,
      street.accepted,
      street.open,
      street.rejected,
      street.damageTypes.map(type => `${type.className}:${type.count}`).join(','),
    ].join(':'))
    .join('|')

  useEffect(() => {
    latestStreetsRef.current = streets
  })

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const initialStreet = latestStreetsRef.current.find(hasLocation)
    const initialCenter: [number, number] = initialStreet?.location
      ? [initialStreet.location.longitude!, initialStreet.location.latitude!]
      : [7.94439, 48.47345]
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: osmRasterStyle(),
      center: initialCenter,
      zoom: initialStreet ? 12 : 11,
      attributionControl: false,
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
    mapRef.current = map
    const resize = window.setTimeout(() => map.resize(), 80)
    const markers = markersRef.current
    return () => {
      window.clearTimeout(resize)
      markers.forEach(marker => marker.remove())
      markers.clear()
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const syncMarkers = () => {
      const located = latestStreetsRef.current.filter(hasLocation)
      markersRef.current.forEach(marker => marker.remove())
      markersRef.current.clear()

      located.forEach(street => {
        const location = street.location!
        const element = createStreetMapMarker(street)
        const marker = new maplibregl.Marker({ element, anchor: 'center' })
          .setLngLat([location.longitude!, location.latitude!])
          .addTo(map)
        markersRef.current.set(street.id, marker)
      })

      if (didAutoFitRef.current || located.length === 0) {
        return
      }
      didAutoFitRef.current = true

      if (located.length === 1) {
        const location = located[0].location!
        map.easeTo({ center: [location.longitude!, location.latitude!], zoom: 13, duration: 450 })
        return
      }
      const bounds = new maplibregl.LngLatBounds()
      located.forEach(street => bounds.extend([street.location!.longitude!, street.location!.latitude!]))
      map.fitBounds(bounds, { padding: 70, maxZoom: 14, duration: 550 })
    }

    if (map.loaded()) {
      syncMarkers()
      return
    }
    map.once('load', syncMarkers)
    return () => {
      map.off('load', syncMarkers)
    }
  }, [markerKey])

  return (
    <div className="stats-map-shell">
      <div ref={containerRef} className="stats-map-canvas" />
      {locatedCount === 0 && (
        <div className="stats-map-empty">
          <strong>Keine Standortdaten</strong>
          <span>Speichere Koordinaten in den Prüfaufträgen.</span>
        </div>
      )}
    </div>
  )
}

function createStreetMapMarker(street: StreetMetric): HTMLButtonElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = `stats-map-marker${street.total === 0 ? ' is-empty' : ''}`
  element.style.background = damageTypeConicBackground(street.damageTypes, street.total)
  element.setAttribute('aria-label', markerSummary(street))
  element.title = markerSummary(street)

  const count = document.createElement('span')
  count.className = 'stats-map-marker-count'
  count.textContent = String(street.total)

  const tooltip = document.createElement('div')
  tooltip.className = 'stats-map-tooltip'
  tooltip.appendChild(markerLine(street.n, `${street.total} Befunde`, 'stats-map-tooltip-head'))
  tooltip.appendChild(markerLine('Bestätigt', String(street.accepted)))
  tooltip.appendChild(markerLine('Offen', String(street.open)))
  tooltip.appendChild(markerLine('Abgelehnt', String(street.rejected)))

  const types = document.createElement('div')
  types.className = 'stats-map-tooltip-types'
  if (street.damageTypes.length === 0) {
    const empty = document.createElement('span')
    empty.textContent = 'Keine Fehlerarten'
    types.appendChild(empty)
  } else {
    street.damageTypes.forEach(type => {
      const row = document.createElement('div')
      const swatch = document.createElement('i')
      swatch.style.background = type.color
      const name = document.createElement('span')
      name.textContent = `${type.code} · ${type.name}`
      const value = document.createElement('em')
      value.textContent = String(type.count)
      row.append(swatch, name, value)
      types.appendChild(row)
    })
  }
  tooltip.appendChild(types)
  element.append(count, tooltip)
  return element
}

function markerLine(label: string, value: string, className?: string): HTMLDivElement {
  const row = document.createElement('div')
  if (className) row.className = className
  const labelElement = document.createElement('span')
  labelElement.textContent = label
  const valueElement = document.createElement('strong')
  valueElement.textContent = value
  row.append(labelElement, valueElement)
  return row
}

function PipeProfile({ street, findings }: { street: StreetMetric; findings: Finding[] }) {
  const meterRange = profileMeterRange(street, findings)
  const profileFindings = findings.slice(0, 14)
  return (
    <div className="pipe-profile-row">
      <div className="pipe-profile-label">
        <strong>{street.n}</strong>
        <span>{meterRange ? `${meterRange.source} ${meterRange.start.toFixed(1)}-${meterRange.end.toFixed(1)} m` : 'Zeitachse'}</span>
      </div>
      <div className="pipe-profile-track">
        {profileFindings.length === 0 && <span className="pipe-profile-empty">keine Befunde</span>}
        {profileFindings.map((finding, index) => {
          const left = profilePosition(finding, street, index, profileFindings.length, meterRange)
          return (
            <span
              key={finding.id}
              className={`pipe-marker is-${finding.st}`}
              style={{ left: `${left}%` }}
              title={`${DAMAGE[finding.ty].name} · ${finding.cf}% · ${finding.ts}`}
            />
          )
        })}
      </div>
      <em>{street.total}</em>
    </div>
  )
}

function profilePosition(
  finding: Finding,
  street: StreetMetric,
  index: number,
  count: number,
  meterRange: { start: number; end: number; source: string } | null,
): number {
  if (finding.meterKnown !== false && meterRange && meterRange.start !== meterRange.end) {
    return clamp(((finding.m - meterRange.start) / (meterRange.end - meterRange.start)) * 100)
  }
  if (finding.startSeconds != null && street.durationSeconds && street.durationSeconds > 0) {
    return clamp((finding.startSeconds / street.durationSeconds) * 100)
  }
  return count <= 1 ? 50 : clamp((index / (count - 1)) * 100)
}

function profileMeterRange(street: StreetMetric, findings: Finding[]): { start: number; end: number; source: string } | null {
  if (street.meterStart != null && street.meterEnd != null && street.meterStart !== street.meterEnd) {
    return {
      start: Math.min(street.meterStart, street.meterEnd),
      end: Math.max(street.meterStart, street.meterEnd),
      source: 'Meter',
    }
  }
  const ocrMeters = findings
    .filter(finding => finding.meterKnown !== false)
    .map(finding => finding.m)
    .filter(Number.isFinite)
  if (ocrMeters.length >= 2) {
    return {
      start: Math.min(...ocrMeters),
      end: Math.max(...ocrMeters),
      source: 'OCR',
    }
  }
  return null
}

function priorityScore(finding: Finding): number {
  const classWeight: Record<Finding['ty'], number> = {
    roots: 36,
    crack: 34,
    joint_fault: 30,
    obstruction_or_other: 28,
    connection_defect: 24,
    deposit: 18,
    water_level: 14,
    pipe_end: 8,
    unknown: 12,
  }
  const reviewWeight = finding.st === 'accepted' ? 18 : finding.st === 'pending' || finding.st === 'edited' ? 12 : 0
  const detectionWeight = Math.min(20, (finding.snapshotDetections?.length ?? 1) * 4)
  return Math.round(classWeight[finding.ty] + reviewWeight + finding.cf * 0.35 + detectionWeight)
}

function streetHasMeterData(street: Street, findings: Finding[]): boolean {
  return (
    (street.meterStart != null && street.meterEnd != null) ||
    findings.some(finding => finding.street === street.id && finding.meterKnown !== false)
  )
}

function damageTypeConicBackground(types: StreetDamageType[], total: number): string {
  if (types.length === 0 || total === 0) return 'var(--bg-3)'
  const result = types.reduce<{ cursor: number; parts: string[] }>((state, type) => {
    const share = (type.count / Math.max(1, total)) * 100
    const end = state.cursor + share
    return {
      cursor: end,
      parts: state.parts.concat(`${type.color} ${state.cursor.toFixed(2)}% ${end.toFixed(2)}%`),
    }
  }, { cursor: 0, parts: [] })
  return `conic-gradient(${result.parts.join(', ')})`
}

function markerSummary(street: StreetMetric): string {
  const damageText = street.damageTypes.length > 0
    ? street.damageTypes.map(type => `${type.name}: ${type.count}`).join(', ')
    : 'keine Fehlerarten'
  return `${street.n}: ${street.total} Befunde, ${street.accepted} bestätigt, ${street.open} offen, ${street.rejected} abgelehnt, ${damageText}`
}

function damageClassColor(className: Finding['ty']): string {
  return DAMAGE_CHART_COLORS[className] ?? DAMAGE_CHART_COLORS.unknown
}

function formatShare(share: number): string {
  if (share > 0 && share < 1) return '<1%'
  return `${Math.round(share)}%`
}

function statusLabel(status: Finding['st']): string {
  if (status === 'accepted') return 'bestätigt'
  if (status === 'rejected') return 'abgelehnt'
  if (status === 'edited') return 'bearbeitet'
  return 'offen'
}

function clamp(value: number): number {
  return Math.max(2, Math.min(98, value))
}
