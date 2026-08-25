export type DamageClass =
  | 'crack' | 'joint_fault' | 'deposit' | 'roots'
  | 'connection_defect' | 'obstruction_or_other'
  | 'pipe_end' | 'water_level' | 'unknown'

import type { DamageDetection, VideoLocation, VideoOverlay } from '@/lib/types'

export type ValidationStatus = 'pending' | 'accepted' | 'edited' | 'rejected'
export type LageplanStyle = 'schematic' | 'blueprint' | 'thermal'
export type Modus = 'büro' | 'feld' | 'audit'

export interface Street {
  id: string
  n: string
  len: string
  diam: string
  mat: string
  createdAt?: string
  videoUrl?: string
  durationSeconds?: number | null
  meterStart?: number | null
  meterEnd?: number | null
  location?: VideoLocation
  inspectionDate?: string | null
  fps?: number | null
  width?: number | null
  height?: number | null
  sizeBytes?: number
  overlay?: VideoOverlay
}

export interface Finding {
  id: string
  eventId?: string
  sourceEventIds?: string[]
  videoId?: string
  ty: DamageClass
  m: number
  meterKnown?: boolean
  cf: number
  sv?: number | null
  st: ValidationStatus
  ts: string
  pos: string
  street: string
  snapshotUrl?: string | null
  snapshotFrameIndex?: number | null
  snapshotDetections?: DamageDetection[]
  bbox?: number[]
  videoUrl?: string
  videoWidth?: number | null
  videoHeight?: number | null
  startSeconds?: number
  sourceModels?: string[]
  note?: string | null
  reminderDueAt?: string | null
  reminderCreatedAt?: string | null
  reminderResolvedAt?: string | null
  reminderIsDue?: boolean
  overlay?: VideoOverlay
}

export const STREETS: Street[] = [
  { id: 's1', n: 'Mozartstraße',    len: '62 m', diam: 'DN 300', mat: 'Beton'     },
  { id: 's2', n: 'Beethovenstraße', len: '48 m', diam: 'DN 250', mat: 'PVC'       },
  { id: 's3', n: 'Schillerplatz',   len: '71 m', diam: 'DN 400', mat: 'Steinzeug' },
]

export const FINDINGS_INIT: Finding[] = [
  { id:'F-001', ty:'crack',                m:12.4, cf:92, sv:3, st:'pending',  ts:'00:02:34', pos:'Scheitel', street:'s1' },
  { id:'F-002', ty:'joint_fault',          m:27.1, cf:68, sv:2, st:'accepted', ts:'00:05:10', pos:'Sohle',    street:'s1' },
  { id:'F-003', ty:'deposit',              m:41.8, cf:45, sv:4, st:'pending',  ts:'00:07:22', pos:'Links',    street:'s1' },
  { id:'F-004', ty:'roots',                m:55.0, cf:88, sv:3, st:'rejected', ts:'00:10:05', pos:'Rechts',   street:'s1' },
  { id:'F-005', ty:'crack',                m:18.2, cf:76, sv:2, st:'accepted', ts:'00:03:12', pos:'Scheitel', street:'s2' },
  { id:'F-006', ty:'connection_defect',    m:33.5, cf:91, sv:4, st:'pending',  ts:'00:06:44', pos:'Links',    street:'s2' },
  { id:'F-007', ty:'obstruction_or_other', m:9.7,  cf:55, sv:3, st:'rejected', ts:'00:01:55', pos:'Sohle',    street:'s2' },
  { id:'F-008', ty:'roots',                m:14.3, cf:83, sv:2, st:'pending',  ts:'00:02:50', pos:'Rechts',   street:'s3' },
  { id:'F-009', ty:'crack',                m:28.6, cf:38, sv:5, st:'pending',  ts:'00:05:30', pos:'Scheitel', street:'s3' },
  { id:'F-010', ty:'deposit',              m:47.2, cf:71, sv:3, st:'pending',  ts:'00:08:10', pos:'Sohle',    street:'s3' },
  { id:'F-011', ty:'joint_fault',          m:62.1, cf:87, sv:2, st:'accepted', ts:'00:11:22', pos:'Links',    street:'s3' },
]

export const ALL_CLASSES: DamageClass[] = [
  'crack','joint_fault','deposit','roots',
  'connection_defect','obstruction_or_other',
  'pipe_end','water_level','unknown',
]

export const cc = (f: number) => f > 80 ? 'green' : f > 50 ? 'yellow' : 'red'
export const sl = (s: ValidationStatus) =>
  s === 'accepted' ? 'Bestätigt' : s === 'rejected' ? 'Abgelehnt' : s === 'edited' ? 'Bearbeitet' : 'Offen'
