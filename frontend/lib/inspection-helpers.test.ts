import { afterEach, describe, expect, it, vi } from 'vitest'

import { addMonthsIso, buildUploadMetadata, groupEventsToFindings, stammdatenToUploadMetadata } from '@/lib/inspection-helpers'
import type { Stammdaten } from '@/lib/inspection-types'
import type { DamageEvent, Video } from '@/lib/types'

const baseStammdaten: Stammdaten = {
  strasse: 'Beispielstraße',
  dn: 'DN 300',
  material: 'Beton',
  laenge: '12,5',
  datum: '2026-05-10',
  meterstart: '3',
}

describe('inspection upload metadata helpers', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps Stammdaten upload metadata free of raw coordinate fields', () => {
    expect(stammdatenToUploadMetadata(baseStammdaten)).toEqual({
      routeName: 'Beispielstraße',
      pipeDiameter: 'DN 300',
      pipeMaterial: 'Beton',
      inspectionDate: '2026-05-10',
      meterStart: '3',
      meterEnd: '15.5',
    })
  })

  it('builds manual address location metadata', () => {
    expect(buildUploadMetadata(baseStammdaten, {
      mode: 'address',
      label: 'Musterstadt',
      address: 'Musterstraße 1, Musterstadt',
    })).toEqual({
      routeName: 'Beispielstraße',
      pipeDiameter: 'DN 300',
      pipeMaterial: 'Beton',
      inspectionDate: '2026-05-10',
      meterStart: '3',
      meterEnd: '15.5',
      location: {
        mode: 'address',
        label: 'Beispielstraße',
        address: 'Musterstraße 1, Musterstadt',
      },
    })
  })

  it('builds shared browser location metadata', () => {
    expect(buildUploadMetadata(null, {
      mode: 'shared',
      latitude: '47.999000',
      longitude: '7.842000',
    })).toEqual({
      location: {
        mode: 'shared',
        label: 'Aktueller Standort',
        address: undefined,
        latitude: '47.999000',
        longitude: '7.842000',
      },
    })
  })

  it('marks grouped findings when the earliest open reminder is due', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-10T10:00:00.000Z'))
    const findings = groupEventsToFindings(videoFixture, [
      eventFixture({
        id: 'event-future',
        confidence: 0.5,
        reminder_due_at: '2026-11-10T00:00:00.000Z',
      }),
      eventFixture({
        id: 'event-due',
        confidence: 0.9,
        reminder_due_at: '2026-05-01T00:00:00.000Z',
      }),
    ])

    expect(findings).toHaveLength(1)
    expect(findings[0].reminderDueAt).toBe('2026-05-01T00:00:00.000Z')
    expect(findings[0].reminderIsDue).toBe(true)
  })

  it('adds reminder months without rolling past short target months', () => {
    expect(addMonthsIso(1, new Date('2026-01-31T08:00:00.000Z'))).toBe('2026-02-28T08:00:00.000Z')
  })
})

const videoFixture = {
  id: 'video-1',
  original_filename: 'Beispielstraße.mp4',
  stored_filename: 'video.mp4',
  size_bytes: 1,
  created_at: '2026-05-10T00:00:00.000Z',
  video_url: '/files/uploads/video.mp4',
  location: { status: 'missing' },
  overlay: {},
} as Video

function eventFixture(overrides: Partial<DamageEvent>): DamageEvent {
  return {
    id: 'event-1',
    video_id: 'video-1',
    class_name: 'crack',
    confidence: 0.7,
    bbox: [0, 0, 10, 10],
    snapshot_url: '/files/frames/video-1/00000010.jpg',
    snapshot_frame_index: 10,
    snapshot_detections: [],
    start_time_seconds: 1,
    end_time_seconds: 1,
    meter_start: 1,
    meter_end: 1,
    detection_count: 1,
    review_status: 'accepted',
    review_note: null,
    overlay: {},
    created_at: '2026-05-10T00:00:00.000Z',
    updated_at: '2026-05-10T00:00:00.000Z',
    ...overrides,
  }
}
