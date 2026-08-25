import type { CSSProperties } from 'react'
import type { StyleSpecification } from 'maplibre-gl'
import type { DamageDetection, DamageEvent, Job, Video, VideoLocation } from '@/lib/types'
import type { DamageClass, Finding, Street, ValidationStatus } from '@/lib/data'
import { DAMAGE, KNOWN_CLASSES, MODEL_ID, type ArchiveEntry, type Stammdaten, type UploadLocationMetadata, type UploadMetadata } from '@/app/_lib/inspection-types'

export function videoToStreet(video: Video): Street {
  return {
    id: video.id,
    n: video.route_name || video.overlay?.street || video.original_filename.replace(/\.[^.]+$/, ''),
    len: lengthLabel(video),
    diam: video.pipe_diameter || video.overlay?.dn || 'DN -',
    mat: video.pipe_material || video.overlay?.material || 'Video',
    createdAt: video.created_at,
    videoUrl: video.video_url,
    durationSeconds: video.duration_seconds,
    meterStart: video.meter_start,
    meterEnd: video.meter_end,
    location: video.location,
    inspectionDate: video.inspection_date || video.overlay?.inspection_date,
    fps: video.fps,
    width: video.width,
    height: video.height,
    sizeBytes: video.size_bytes,
    overlay: video.overlay,
  }
}

export function groupEventsToFindings(video: Video, events: DamageEvent[]): Finding[] {
  const grouped = new Map<string, DamageEvent[]>()
  for (const event of events) {
    const key = event.snapshot_frame_index == null
      ? `event-${event.id}`
      : `frame-${event.snapshot_frame_index}`
    grouped.set(key, [...(grouped.get(key) ?? []), event])
  }
  return Array.from(grouped.entries()).map(([, group], index) => {
    const representative = [...group].sort((a, b) => b.confidence - a.confidence)[0]
    const detections = mergeDetections(group)
    const status = groupStatus(group)
    const classes = unique(group.flatMap(event => [
      event.class_name,
      ...event.snapshot_detections.map(detection => detection.class_name),
    ])).map(normalizeDamageClass)
    const sourceModels = unique(detections.map(detection => detection.source_model).filter(Boolean))
    const ocrMeter = representative.overlay?.distance_m
    const meter = representative.meter_start ?? ocrMeter ?? 0
    const meterKnown = representative.meter_start != null || ocrMeter != null
    const frame = representative.snapshot_frame_index
    const reminder = nextOpenReminder(group)

    return {
      id: `${shortId(video.id)}-F${String(index + 1).padStart(3, '0')}`,
      eventId: representative.id,
      sourceEventIds: group.map(event => event.id),
      videoId: video.id,
      ty: classes[0] ?? normalizeDamageClass(representative.class_name),
      m: meter,
      meterKnown,
      cf: Math.round(Math.max(...group.map(event => event.confidence)) * 100),
      sv: null,
      st: status,
      ts: formatTimestamp(representative.start_time_seconds),
      pos: frame == null ? 'Frame offen' : classes.length > 1 ? `Frame ${frame} · ${classes.length} Klassen` : `Frame ${frame}`,
      street: video.id,
      snapshotUrl: representative.snapshot_url,
      snapshotFrameIndex: frame,
      snapshotDetections: detections,
      bbox: representative.bbox,
      videoUrl: video.video_url,
      videoWidth: video.width,
      videoHeight: video.height,
      startSeconds: representative.start_time_seconds,
      sourceModels,
      note: group.find(event => event.review_note)?.review_note ?? null,
      reminderDueAt: reminder?.reminder_due_at ?? null,
      reminderCreatedAt: reminder?.reminder_created_at ?? null,
      reminderResolvedAt: reminder?.reminder_resolved_at ?? null,
      reminderIsDue: reminder?.reminder_due_at ? isReminderDue(reminder.reminder_due_at) : false,
      overlay: representative.overlay,
    }
  })
}

export function nextOpenReminder(events: DamageEvent[]): DamageEvent | null {
  return events
    .filter(event => event.reminder_due_at && !event.reminder_resolved_at)
    .sort((left, right) => Date.parse(left.reminder_due_at ?? '') - Date.parse(right.reminder_due_at ?? ''))[0] ?? null
}

export function isReminderDue(dueAt: string, now = new Date()): boolean {
  const dueTime = Date.parse(dueAt)
  return Number.isFinite(dueTime) && dueTime <= now.getTime()
}

export function addMonthsIso(months: number, now = new Date()): string {
  const next = new Date(now.getTime())
  const day = next.getUTCDate()
  next.setUTCDate(1)
  next.setUTCMonth(next.getUTCMonth() + months)
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate()
  next.setUTCDate(Math.min(day, lastDay))
  return next.toISOString()
}

export function formatReminderShort(dueAt?: string | null): string {
  if (!dueAt) return ''
  const date = new Date(dueAt)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  })
}

export function mergeDetections(events: DamageEvent[]): DamageDetection[] {
  const detections = new Map<string, DamageDetection>()
  for (const event of events) {
    const sourceDetections = event.snapshot_detections.length
      ? event.snapshot_detections
      : [{
          id: `${event.id}-fallback`,
          event_id: event.id,
          video_id: event.video_id,
          frame_index: event.snapshot_frame_index ?? 0,
          timestamp_seconds: event.start_time_seconds,
          meter: event.meter_start,
          class_name: event.class_name,
          confidence: event.confidence,
          bbox: event.bbox,
          source_model: MODEL_ID,
        }]
    for (const detection of sourceDetections) {
      detections.set(detection.id, detection)
    }
  }
  return Array.from(detections.values()).sort((a, b) => b.confidence - a.confidence)
}

export function groupStatus(events: DamageEvent[]): ValidationStatus {
  if (events.length > 0 && events.every(event => event.review_status === 'accepted')) return 'accepted'
  if (events.length > 0 && events.every(event => event.review_status === 'rejected')) return 'rejected'
  if (events.some(event => event.review_status === 'edited')) return 'edited'
  return 'pending'
}

export function normalizeDamageClass(className: string): DamageClass {
  const normalized = className.toLowerCase().replace(/[-\s]/g, '_')
  if (KNOWN_CLASSES.includes(normalized as DamageClass)) return normalized as DamageClass
  if (normalized.includes('root')) return 'roots'
  if (normalized.includes('deposit') || normalized.includes('sealing')) return 'deposit'
  if (normalized.includes('joint')) return 'joint_fault'
  if (normalized.includes('connection')) return 'connection_defect'
  if (normalized.includes('water')) return 'water_level'
  if (normalized.includes('pipe')) return 'pipe_end'
  if (normalized.includes('crack') || normalized.includes('break') || normalized.includes('collapse')) return 'crack'
  return 'unknown'
}

export function toArchiveEntry(video: Video, events: DamageEvent[], job?: Job | null): ArchiveEntry {
  return {
    id: video.id,
    n: video.route_name || video.overlay?.street || video.original_filename.replace(/\.[^.]+$/, ''),
    date: new Date(video.created_at).toLocaleDateString('de-DE'),
    len: lengthLabel(video),
    diam: video.pipe_diameter || video.overlay?.dn || 'DN -',
    mat: video.pipe_material || video.overlay?.material || 'Video',
    total: new Set(events.map(event => event.snapshot_frame_index ?? event.id)).size,
    accepted: events.filter(event => event.review_status === 'accepted').length,
    rejected: events.filter(event => event.review_status === 'rejected').length,
    done: job?.status === 'completed',
  }
}

export function exportCSV(entries: ArchiveEntry[], findings: Finding[]) {
  const rows = entries.flatMap(entry => findings
    .filter(finding => finding.street === entry.id)
    .map(finding => [
      shortId(entry.id),
      entry.n,
      entry.date,
      DAMAGE[finding.ty].code,
      DAMAGE[finding.ty].name,
      finding.meterKnown === false ? '' : finding.m.toFixed(1),
      finding.ts,
      String(finding.cf),
      finding.sv ? String(finding.sv) : '',
      statusLabel(finding.st),
    ]))
  const header = ['Auftrag', 'Datei', 'Datum', 'Code', 'Schadensklasse', 'Meter', 'Zeit', 'Konfidenz', 'Schweregrad', 'Status']
  const csv = [header, ...rows].map(row => row.map(value => `"${value.replace(/"/g, '""')}"`).join(';')).join('\r\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = entries.length === 1 ? `${shortId(entries[0].id)}_Inspektion.csv` : 'SewerScan_Archiv.csv'
  link.click()
  URL.revokeObjectURL(url)
}

export function stammdatenToUploadMetadata(stammdaten: Stammdaten): UploadMetadata {
  const meterStart = parseDecimal(stammdaten.meterstart)
  const length = parseDecimal(stammdaten.laenge)
  const metadata: UploadMetadata = {
    routeName: stammdaten.strasse.trim() || undefined,
    pipeDiameter: stammdaten.dn,
    pipeMaterial: stammdaten.material,
    inspectionDate: stammdaten.datum,
  }
  if (Number.isFinite(meterStart)) metadata.meterStart = String(meterStart)
  if (Number.isFinite(meterStart) && Number.isFinite(length) && length > 0) {
    metadata.meterEnd = String(meterStart + length)
  }
  return metadata
}

export function buildUploadMetadata(stammdaten: Stammdaten | null, location: UploadLocationMetadata): UploadMetadata {
  const metadata = stammdaten ? stammdatenToUploadMetadata(stammdaten) : {}
  const stammdatenLabel = stammdaten?.strasse.trim() || ''

  if (location.mode === 'address') {
    const address = location.address.trim()
    metadata.location = {
      mode: 'address',
      label: stammdatenLabel || location.label.trim() || address,
      address,
    }
    return metadata
  }

  metadata.location = {
    mode: 'shared',
    label: stammdatenLabel || location.label?.trim() || 'Aktueller Standort',
    address: location.address?.trim() || undefined,
    latitude: location.latitude,
    longitude: location.longitude,
  }
  return metadata
}

export function parseDecimal(value: string): number {
  const parsed = Number(value.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

export function parseOptionalCoordinate(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

export function formatCoordinate(value?: number | null): string {
  return value == null ? '' : String(Number(value.toFixed(6)))
}

export function hasLocation(street: Street): boolean {
  return street.location?.latitude != null && street.location.longitude != null
}

export function locationStatusLabel(location?: VideoLocation): string {
  if (location?.status === 'confirmed') return 'Bestätigt'
  if (location?.status === 'suggested') return 'Vorschlag'
  if (location?.address || location?.label) return 'Adresse'
  return 'Kein Standort'
}

export function osmRasterStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '© OpenStreetMap',
      },
    },
    layers: [
      {
        id: 'osm',
        type: 'raster',
        source: 'osm',
      },
    ],
  }
}

export function upsertById<T extends { id: string }>(items: T[], item: T): T[] {
  return [item, ...items.filter(existing => existing.id !== item.id)]
}

export function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items))
}

export function shortId(id: string): string {
  return id.slice(0, 8).toUpperCase()
}

export function lengthLabel(video: Video): string {
  if (video.meter_start != null && video.meter_end != null) {
    return `${Math.abs(video.meter_end - video.meter_start).toFixed(1)} m`
  }
  if (video.duration_seconds != null) return `${Math.round(video.duration_seconds)} s`
  return 'offen'
}

export function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  return `00:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

export function formatDuration(seconds?: number | null): string {
  if (seconds == null) return '-'
  return formatTimestamp(seconds)
}

export function statusLabel(status: ValidationStatus): string {
  if (status === 'accepted') return 'Bestätigt'
  if (status === 'rejected') return 'Abgelehnt'
  if (status === 'edited') return 'Bearbeitet'
  return 'Offen'
}

export function modelColor(sourceModel: string): string {
  if (sourceModel === 'sewer-yolo26s-finetune') return '#ff8a3d'
  if (sourceModel === 'sewer-yolo26m') return '#28a7ff'
  return '#dce5df'
}

export function bboxStyle(bbox: number[], width: number, height: number): CSSProperties {
  const left = Math.max(0, Math.min(100, (bbox[0] / width) * 100))
  const top = Math.max(0, Math.min(100, (bbox[1] / height) * 100))
  const right = Math.max(0, Math.min(100, (bbox[2] / width) * 100))
  const bottom = Math.max(0, Math.min(100, (bbox[3] / height) * 100))
  return {
    left: `${left}%`,
    top: `${top}%`,
    width: `${Math.max(0.5, right - left)}%`,
    height: `${Math.max(0.5, bottom - top)}%`,
  }
}
