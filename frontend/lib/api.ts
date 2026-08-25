import type { DamageEvent, Job, ModelOption, Report, Video, VideoLocationUpdate } from "@/lib/types";

export type UploadVideoMetadata = {
  meterStart?: string;
  meterEnd?: string;
  routeName?: string;
  pipeDiameter?: string;
  pipeMaterial?: string;
  inspectionDate?: string;
  location?: {
    mode: "shared" | "address";
    label?: string;
    address?: string;
    latitude?: string;
    longitude?: string;
  };
};

export function apiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000").replace(/\/$/, "");
}

export function wsBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_WS_BASE_URL || "ws://localhost:8000").replace(/\/$/, "");
}

export function apiUrl(path: string): string {
  return `${apiBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

export function mediaUrl(path: string): string {
  if (/^https?:\/\//.test(path)) {
    return path;
  }
  return apiUrl(path);
}

export function jobStreamUrl(jobId: string): string {
  return `${wsBaseUrl()}/api/jobs/${jobId}/stream`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...init,
    cache: "no-store"
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${detail}`);
  }
  return (await response.json()) as T;
}

export async function getVideos(): Promise<Video[]> {
  return request<Video[]>("/api/videos");
}

export async function getModels(): Promise<ModelOption[]> {
  return request<ModelOption[]>("/api/models");
}

export async function getVideo(videoId: string): Promise<Video> {
  return request<Video>(`/api/videos/${videoId}`);
}

export async function getLatestJob(videoId: string): Promise<Job | null> {
  return request<Job | null>(`/api/videos/${videoId}/jobs/latest`);
}

export async function getActiveJobs(): Promise<Job[]> {
  return request<Job[]>("/api/jobs/active");
}

export async function uploadVideo(
  file: File,
  meterStartOrMetadata?: string | UploadVideoMetadata,
  meterEnd?: string
): Promise<Video> {
  const metadata =
    typeof meterStartOrMetadata === "object"
      ? meterStartOrMetadata
      : { meterStart: meterStartOrMetadata, meterEnd };
  const form = new FormData();
  form.append("file", file);
  if (metadata.meterStart) {
    form.append("meter_start", metadata.meterStart);
  }
  if (metadata.meterEnd) {
    form.append("meter_end", metadata.meterEnd);
  }
  if (metadata.routeName) {
    form.append("route_name", metadata.routeName);
  }
  if (metadata.pipeDiameter) {
    form.append("pipe_diameter", metadata.pipeDiameter);
  }
  if (metadata.pipeMaterial) {
    form.append("pipe_material", metadata.pipeMaterial);
  }
  if (metadata.inspectionDate) {
    form.append("inspection_date", metadata.inspectionDate);
  }
  if (metadata.location?.label) {
    form.append("location_label", metadata.location.label);
  }
  if (metadata.location?.address) {
    form.append("location_address", metadata.location.address);
  }
  if (metadata.location?.latitude) {
    form.append("location_latitude", metadata.location.latitude);
  }
  if (metadata.location?.longitude) {
    form.append("location_longitude", metadata.location.longitude);
  }
  return request<Video>("/api/videos/upload", {
    method: "POST",
    body: form
  });
}

export async function updateVideoLocation(
  videoId: string,
  location: VideoLocationUpdate
): Promise<Video> {
  return request<Video>(`/api/videos/${videoId}/location`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(location)
  });
}

export async function suggestVideoLocation(videoId: string, query?: string): Promise<Video> {
  return request<Video>(`/api/videos/${videoId}/location/suggest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(query ? { query } : {})
  });
}

export async function startAnalysis(videoId: string, modelId?: string): Promise<Job> {
  const init: RequestInit = { method: "POST" };
  if (modelId) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify({ model_id: modelId });
  }
  return request<Job>(`/api/videos/${videoId}/analyze`, init);
}

export async function getEvents(videoId: string): Promise<DamageEvent[]> {
  return request<DamageEvent[]>(`/api/videos/${videoId}/events`);
}

export async function reviewEvent(
  eventId: string,
  status: DamageEvent["review_status"],
  note?: string,
  options?: {
    reminderDueAt?: string;
    resolveReminder?: boolean;
  }
): Promise<DamageEvent> {
  return request<DamageEvent>(`/api/events/${eventId}/review`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      status,
      note,
      ...(options?.reminderDueAt ? { reminder_due_at: options.reminderDueAt } : {}),
      ...(options?.resolveReminder ? { resolve_reminder: true } : {})
    })
  });
}

export async function getReport(videoId: string): Promise<Report> {
  return request<Report>(`/api/videos/${videoId}/report`);
}
