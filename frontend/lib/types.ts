export type Video = {
  id: string;
  original_filename: string;
  stored_filename: string;
  preview_filename?: string | null;
  content_type?: string | null;
  size_bytes: number;
  duration_seconds?: number | null;
  fps?: number | null;
  width?: number | null;
  height?: number | null;
  meter_start?: number | null;
  meter_end?: number | null;
  route_name?: string | null;
  pipe_diameter?: string | null;
  pipe_material?: string | null;
  inspection_date?: string | null;
  created_at: string;
  video_url: string;
  location: VideoLocation;
  overlay: VideoOverlay;
};

export type VideoOverlay = {
  raw_text?: string | null;
  confidence?: number | null;
  street?: string | null;
  city?: string | null;
  dn?: string | null;
  material?: string | null;
  distance_m?: number | null;
  direction?: string | null;
  inspection_date?: string | null;
  inspection_time?: string | null;
  upstream_id?: string | null;
  downstream_id?: string | null;
  clock_position?: string | null;
  tilt_percent?: number | null;
};

export type VideoLocation = {
  latitude?: number | null;
  longitude?: number | null;
  label?: string | null;
  address?: string | null;
  source?: string | null;
  status: "missing" | "suggested" | "confirmed";
  confidence?: number | null;
  raw_text?: string | null;
  updated_at?: string | null;
};

export type VideoLocationUpdate = {
  latitude?: number | null;
  longitude?: number | null;
  label?: string | null;
  address?: string | null;
  source?: string | null;
  status?: VideoLocation["status"];
  confidence?: number | null;
  raw_text?: string | null;
};

export type Job = {
  id: string;
  video_id: string;
  model_id: string;
  status: "queued" | "running" | "completed" | "failed";
  progress: number;
  message?: string | null;
  error?: string | null;
  rq_job_id?: string | null;
  created_at: string;
  updated_at: string;
  started_at?: string | null;
  completed_at?: string | null;
};

export type ModelOption = {
  id: string;
  label: string;
  architecture: string;
  source: string;
  source_url: string;
  license: string;
  description: string;
  cached: boolean;
  lazy_download: boolean;
  filename?: string | null;
  classes: string[];
};

export type DamageEvent = {
  id: string;
  video_id: string;
  class_name: string;
  confidence: number;
  bbox: number[];
  snapshot_url?: string | null;
  snapshot_frame_index?: number | null;
  snapshot_detections: DamageDetection[];
  start_time_seconds: number;
  end_time_seconds: number;
  meter_start?: number | null;
  meter_end?: number | null;
  detection_count: number;
  review_status: "pending" | "accepted" | "edited" | "rejected";
  review_note?: string | null;
  reminder_due_at?: string | null;
  reminder_created_at?: string | null;
  reminder_resolved_at?: string | null;
  overlay: VideoOverlay;
  created_at: string;
  updated_at: string;
};

export type DamageDetection = {
  id: string;
  event_id?: string | null;
  video_id: string;
  frame_index: number;
  timestamp_seconds: number;
  meter?: number | null;
  class_name: string;
  confidence: number;
  bbox: number[];
  mask_path?: string | null;
  source_model: string;
};

export type Report = {
  video: Video;
  summary: {
    event_count: number;
    accepted: number;
    edited: number;
    rejected: number;
    pending: number;
    classes: Record<string, number>;
  };
  events: DamageEvent[];
  generated_at: string;
  report_path: string;
};
