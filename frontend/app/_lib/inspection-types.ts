import type { DamageEvent, Job } from '@/lib/types'
import type { DamageClass } from '@/lib/data'

// Ohne eigene Gewichte läuft nur der Placeholder-Detektor — siehe DATA.md.
export const MODEL_ID = 'placeholder'

export type User = { id: string; name: string; initials: string; role: string }
export type UserLogin = User & { password: string }
export type UploadLocationMetadata =
  | { mode: 'shared'; label?: string; address?: string; latitude: string; longitude: string }
  | { mode: 'address'; label: string; address: string }
export type UploadMetadata = {
  meterStart?: string
  meterEnd?: string
  routeName?: string
  pipeDiameter?: string
  pipeMaterial?: string
  inspectionDate?: string
  location?: UploadLocationMetadata
}
export type EventsByVideo = Record<string, DamageEvent[]>
export type JobsByVideo = Record<string, Job | null>
export type ViewLevel = 0 | 1 | 2 | 3 | 4

export type ArchiveEntry = {
  id: string
  n: string
  date: string
  len: string
  diam: string
  mat: string
  total: number
  accepted: number
  rejected: number
  done: boolean
}

export interface Stammdaten {
  strasse: string
  dn: string
  material: string
  laenge: string
  datum: string
  meterstart: string
}

export const DN_OPTIONS = ['DN 150', 'DN 200', 'DN 250', 'DN 300', 'DN 400', 'DN 500', 'DN 600', 'DN 800']
export const MAT_OPTIONS = ['Beton', 'PVC', 'Steinzeug', 'Grauguss', 'Duktilguss', 'PP', 'GFK']

export const USERS: UserLogin[] = [
  { id: 'MW-001', name: 'M. Weber', initials: 'MW', role: 'Techniker', password: '123456' },
  { id: 'KM-002', name: 'K. Müller', initials: 'KM', role: 'Inspektor', password: '123456' },
  { id: 'TS-003', name: 'T. Schmidt', initials: 'TS', role: 'Prüfer', password: '123456' },
]

export const DAMAGE: Record<DamageClass, { code: string; name: string }> = {
  crack: { code: 'BAB', name: 'Riss' },
  joint_fault: { code: 'BAD', name: 'Fugenfehler' },
  deposit: { code: 'BAG', name: 'Ablagerung' },
  roots: { code: 'BAE', name: 'Wurzeleinwuchs' },
  connection_defect: { code: 'BBA', name: 'Anschluss' },
  obstruction_or_other: { code: 'BAJ', name: 'Hindernis' },
  pipe_end: { code: 'BAH', name: 'Rohrende' },
  water_level: { code: 'BAK', name: 'Wasserstand' },
  unknown: { code: 'BAX', name: 'Unbekannt' },
}

export const KNOWN_CLASSES = Object.keys(DAMAGE) as DamageClass[]
