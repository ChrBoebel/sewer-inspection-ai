'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import Level3Popup from '@/components/Level3Popup'
import TopBar, { type ReminderItem, type SearchItem } from '@/components/TopBar'
import { getActiveJobs, getEvents, getLatestJob, getVideo, getVideos, jobStreamUrl, reviewEvent, startAnalysis, suggestVideoLocation, updateVideoLocation, uploadVideo } from '@/lib/api'
import type { DamageEvent, Job, Video, VideoLocationUpdate } from '@/lib/types'
import type { Finding, Street, ValidationStatus } from '@/lib/data'
import ArchivePage from '@/app/_components/ArchivePage'
import Dashboard from '@/app/_components/Dashboard'
import LoginScreen from '@/app/_components/LoginScreen'
import OrderOverview from '@/app/_components/OrderOverview'
import ReviewBoard from '@/app/_components/ReviewBoard'
import StatsPage from '@/app/_components/StatsPage'
import { SystemNotice } from '@/app/_components/Common'
import TunnelBackground from '@/app/_components/TunnelBackground'
import { MODEL_ID, type EventsByVideo, type JobsByVideo, type UploadMetadata, type User, type ViewLevel } from '@/app/_lib/inspection-types'
import { addMonthsIso, formatReminderShort, groupEventsToFindings, shortId, toArchiveEntry, upsertById, videoToStreet } from '@/app/_lib/inspection-helpers'

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [level, setLevel] = useState<ViewLevel>(0)
  const [videos, setVideos] = useState<Video[]>([])
  const [eventsByVideo, setEventsByVideo] = useState<EventsByVideo>({})
  const [jobsByVideo, setJobsByVideo] = useState<JobsByVideo>({})
  const [activeJobs, setActiveJobs] = useState<Job[]>([])
  const [selectedStreet, setSelectedStreet] = useState<Street | null>(null)
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null)
  const [highlightedFindingId, setHighlightedFindingId] = useState<string | null>(null)
  const [archiveInitialId, setArchiveInitialId] = useState<string | undefined>()
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const socketsRef = useRef<Map<string, WebSocket>>(new Map())

  const refreshActiveJobs = useCallback(async () => {
    try {
      setActiveJobs(await getActiveJobs())
    } catch {
      setActiveJobs([])
    }
  }, [])

  const refreshVideo = useCallback(async (videoId: string) => {
    const [video, events, job] = await Promise.all([
      getVideo(videoId),
      getEvents(videoId),
      getLatestJob(videoId),
    ])
    setVideos(prev => upsertById(prev, video))
    setEventsByVideo(prev => ({ ...prev, [videoId]: events }))
    setJobsByVideo(prev => ({ ...prev, [videoId]: job }))
    await refreshActiveJobs()
  }, [refreshActiveJobs])

  const watchJob = useCallback((job: Job) => {
    if (socketsRef.current.has(job.id) || job.status === 'completed' || job.status === 'failed') return
    const socket = new WebSocket(jobStreamUrl(job.id))
    socketsRef.current.set(job.id, socket)
    socket.onmessage = event => {
      const latest = JSON.parse(event.data as string) as Job
      if (!latest.video_id) return
      setJobsByVideo(prev => ({ ...prev, [latest.video_id]: latest }))
      if (latest.status === 'completed' || latest.status === 'failed') {
        socket.close()
        void refreshVideo(latest.video_id)
      }
    }
    socket.onerror = () => {
      socket.close()
      void refreshVideo(job.video_id)
    }
    socket.onclose = () => {
      socketsRef.current.delete(job.id)
    }
  }, [refreshVideo])

  const refreshAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await getVideos()
      const bundles = await Promise.all(list.map(async video => {
        const [events, job] = await Promise.all([
          getEvents(video.id).catch(() => [] as DamageEvent[]),
          getLatestJob(video.id).catch(() => null),
        ])
        return { video, events, job }
      }))
      setVideos(list)
      setEventsByVideo(Object.fromEntries(bundles.map(bundle => [bundle.video.id, bundle.events])))
      setJobsByVideo(Object.fromEntries(bundles.map(bundle => [bundle.video.id, bundle.job])))
      await refreshActiveJobs()
      bundles.forEach(bundle => {
        if (bundle.job) watchJob(bundle.job)
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Backend nicht erreichbar')
    } finally {
      setLoading(false)
    }
  }, [refreshActiveJobs, watchJob])

  useEffect(() => {
    const sockets = socketsRef.current
    const initialLoad = window.setTimeout(() => void refreshAll(), 0)
    const interval = window.setInterval(() => void refreshActiveJobs(), 5000)
    return () => {
      window.clearTimeout(initialLoad)
      window.clearInterval(interval)
      sockets.forEach(socket => socket.close())
      sockets.clear()
    }
  }, [refreshActiveJobs, refreshAll])

  const streets = useMemo(() => videos.map(videoToStreet), [videos])
  const findings = useMemo(() => {
    return videos.flatMap(video => groupEventsToFindings(video, eventsByVideo[video.id] ?? []))
  }, [eventsByVideo, videos])
  const archiveEntries = useMemo(
    () => videos.map(video => toArchiveEntry(video, eventsByVideo[video.id] ?? [], jobsByVideo[video.id])),
    [eventsByVideo, jobsByVideo, videos],
  )

  const updateStatus = useCallback(async (id: string, status: ValidationStatus, note?: string) => {
    const target = findings.find(finding => finding.id === id)
    if (!target) return
    const eventIds = target.sourceEventIds?.length ? target.sourceEventIds : target.eventId ? [target.eventId] : []
    if (eventIds.length === 0) return
    setError(null)
    try {
      const updatedEvents = await Promise.all(eventIds.map(eventId => reviewEvent(eventId, status, note ?? target.note ?? undefined, { resolveReminder: true })))
      setEventsByVideo(prev => {
        const next = { ...prev }
        for (const updated of updatedEvents) {
          const existing = next[updated.video_id] ?? []
          next[updated.video_id] = existing.map(event => event.id === updated.id ? updated : event)
        }
        return next
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Review konnte nicht gespeichert werden')
    }
  }, [findings])

  const updateReminder = useCallback(async (id: string, months: 6 | 12) => {
    const target = findings.find(finding => finding.id === id)
    if (!target) return
    const eventIds = target.sourceEventIds?.length ? target.sourceEventIds : target.eventId ? [target.eventId] : []
    if (eventIds.length === 0) return
    const dueAt = addMonthsIso(months)
    setError(null)
    try {
      const updatedEvents = await Promise.all(eventIds.map(eventId => reviewEvent(eventId, target.st, target.note ?? undefined, { reminderDueAt: dueAt })))
      setEventsByVideo(prev => {
        const next = { ...prev }
        for (const updated of updatedEvents) {
          const existing = next[updated.video_id] ?? []
          next[updated.video_id] = existing.map(event => event.id === updated.id ? updated : event)
        }
        return next
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Wiedervorlage konnte nicht gespeichert werden')
    }
  }, [findings])

  const updateNote = useCallback(async (id: string, note: string) => {
    const target = findings.find(finding => finding.id === id)
    if (!target) return
    const eventIds = target.sourceEventIds?.length ? target.sourceEventIds : target.eventId ? [target.eventId] : []
    if (eventIds.length === 0) return
    setError(null)
    try {
      const updatedEvents = await Promise.all(eventIds.map(eventId => reviewEvent(eventId, target.st, note)))
      setEventsByVideo(prev => {
        const next = { ...prev }
        for (const updated of updatedEvents) {
          const existing = next[updated.video_id] ?? []
          next[updated.video_id] = existing.map(event => event.id === updated.id ? updated : event)
        }
        return next
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Notiz konnte nicht gespeichert werden')
    }
  }, [findings])

  const runAnalysis = useCallback(async (video: Video) => {
    setError(null)
    try {
      const job = await startAnalysis(video.id, MODEL_ID)
      setJobsByVideo(prev => ({ ...prev, [video.id]: job }))
      await refreshActiveJobs()
      watchJob(job)
      if (job.status === 'completed' || job.status === 'failed') {
        await refreshVideo(video.id)
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Analyse konnte nicht gestartet werden')
    }
  }, [refreshActiveJobs, refreshVideo, watchJob])

  const handleUpload = useCallback(async (files: File[], metadata?: UploadMetadata) => {
    if (files.length === 0) return
    setUploading(true)
    setError(null)
    try {
      for (const file of files) {
        let video = await uploadVideo(file, metadata)
        if (metadata?.location?.mode === 'address' && video.location.latitude == null && video.location.longitude == null) {
          try {
            const suggested = await suggestVideoLocation(video.id, metadata.location.address)
            video = suggested
            if (suggested.location.latitude != null && suggested.location.longitude != null) {
              video = await updateVideoLocation(video.id, {
                latitude: suggested.location.latitude,
                longitude: suggested.location.longitude,
                label: metadata.location.label || suggested.location.label || metadata.location.address,
                address: suggested.location.address || metadata.location.address,
                source: suggested.location.source || 'geocoder',
                status: 'confirmed',
                confidence: 1,
                raw_text: suggested.location.raw_text ?? null,
              })
            }
          } catch {
            // Address-only uploads stay valid; the map pin can be corrected later.
          }
        }
        setVideos(prev => upsertById(prev, video))
        await runAnalysis(video)
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Upload fehlgeschlagen')
    } finally {
      setUploading(false)
      await refreshAll()
    }
  }, [refreshAll, runAnalysis])

  const saveVideoLocation = useCallback(async (videoId: string, location: VideoLocationUpdate) => {
    setError(null)
    try {
      const video = await updateVideoLocation(videoId, location)
      setVideos(prev => upsertById(prev, video))
      return video
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Standort konnte nicht gespeichert werden'
      setError(message)
      throw caught
    }
  }, [])

  const requestVideoLocationSuggestion = useCallback(async (videoId: string, query?: string) => {
    setError(null)
    try {
      const video = await suggestVideoLocation(videoId, query)
      setVideos(prev => upsertById(prev, video))
      return video
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Standortvorschlag konnte nicht erstellt werden'
      setError(message)
      throw caught
    }
  }, [])

  const openStreet = useCallback((street: Street) => {
    setSelectedStreet(street)
    setHighlightedFindingId(null)
    setLevel(2)
  }, [])

  const onCrumb = (nextLevel: number) => {
    if (nextLevel === 0) setLevel(0)
    if (nextLevel === 1) setLevel(1)
    if (nextLevel === 2 && selectedStreet) setLevel(2)
    if (nextLevel === 3) setLevel(3)
    if (nextLevel === 4) setLevel(4)
  }

  const searchItems: SearchItem[] = [
    ...streets.map(street => {
      const streetFindings = findings.filter(finding => finding.street === street.id)
      const open = streetFindings.filter(finding => finding.st === 'pending' || finding.st === 'edited').length
      return {
        id: street.id,
        label: street.n,
        sub: `${shortId(street.id)} · ${street.len} · ${open} offen`,
        category: 'pruefauftrag' as const,
      }
    }),
    ...archiveEntries.map(entry => ({
      id: entry.id,
      label: entry.n,
      sub: `${entry.date} · ${entry.total} Befunde`,
      category: 'archiv' as const,
    })),
  ]

  const reminderItems: ReminderItem[] = findings
    .filter(finding => finding.reminderIsDue && finding.reminderDueAt)
    .map(finding => {
      const street = streets.find(candidate => candidate.id === finding.street)
      return {
        id: `${finding.id}-${finding.reminderDueAt}`,
        findingId: finding.id,
        streetId: finding.street,
        label: `${finding.id} · ${street?.n ?? shortId(finding.street)}`,
        sub: `${formatReminderShort(finding.reminderDueAt)} · ${finding.ts}`,
        dueAt: finding.reminderDueAt ?? '',
      }
    })

  const handleSearchNavigate = (item: SearchItem) => {
    if (item.category === 'pruefauftrag') {
      const street = streets.find(candidate => candidate.id === item.id)
      if (street) openStreet(street)
      return
    }
    setArchiveInitialId(item.id)
    setLevel(4)
  }

  const handleReminderNavigate = (item: ReminderItem) => {
    const street = streets.find(candidate => candidate.id === item.streetId)
    if (!street) return
    setSelectedStreet(street)
    setSelectedFinding(null)
    setHighlightedFindingId(item.findingId)
    setLevel(2)
  }

  const selectedStreetFindings = selectedStreet
    ? findings.filter(finding => finding.street === selectedStreet.id)
    : []
  const currentPopupFindings = selectedStreetFindings.length > 0
    ? selectedStreetFindings
    : findings

  return (
    <div className="shell">
      <TunnelBackground />
      {!user && <LoginScreen onLogin={setUser} />}
      {user && (
        <div className="app-layer">
          <TopBar
            level={level}
            onCrumb={onCrumb}
            searchItems={searchItems}
            reminderItems={reminderItems}
            onSearchNavigate={handleSearchNavigate}
            onReminderNavigate={handleReminderNavigate}
            user={user}
            onLogout={() => {
              setUser(null)
              setLevel(0)
            }}
          />
          {error && <SystemNotice message={error} onClose={() => setError(null)} />}
          {level === 0 && (
            <Dashboard
              findings={findings}
              archiveEntries={archiveEntries}
              activeJobs={activeJobs}
              videos={videos}
              loading={loading}
              uploading={uploading}
              onNavigateOrders={() => setLevel(1)}
              onNavigateStats={() => setLevel(3)}
              onNavigateArchive={() => setLevel(4)}
              onUpload={handleUpload}
            />
          )}
          {level === 1 && (
            <OrderOverview
              streets={streets}
              findings={findings}
              jobsByVideo={jobsByVideo}
              onBack={() => setLevel(0)}
              onOpen={openStreet}
              onLocationSave={saveVideoLocation}
              onLocationSuggest={requestVideoLocationSuggestion}
            />
          )}
          {level === 2 && selectedStreet && (
            <ReviewBoard
              street={selectedStreet}
              findings={selectedStreetFindings}
              job={jobsByVideo[selectedStreet.id] ?? null}
              onBack={() => setLevel(1)}
              onFinding={setSelectedFinding}
              onStatus={updateStatus}
              onReminder={updateReminder}
              highlightedFindingId={highlightedFindingId}
              onAnalyze={() => {
                const video = videos.find(candidate => candidate.id === selectedStreet.id)
                if (video) void runAnalysis(video)
              }}
            />
          )}
          {level === 3 && (
            <StatsPage streets={streets} findings={findings} onBack={() => setLevel(0)} />
          )}
          {level === 4 && (
            <ArchivePage
              key={archiveInitialId ?? 'archive'}
              entries={archiveEntries}
              findings={findings}
              initialEntryId={archiveInitialId}
              onBack={() => setLevel(0)}
            />
          )}
        </div>
      )}

      {user && selectedFinding && (
        <Level3Popup
          finding={selectedFinding}
          allFindings={currentPopupFindings}
          onClose={() => setSelectedFinding(null)}
          onUpdateStatus={updateStatus}
          onUpdateNote={updateNote}
        />
      )}
    </div>
  )
}
