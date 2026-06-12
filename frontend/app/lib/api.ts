export const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export type Mode = "auto" | "ai" | "manual";
export type Provider = "gemini" | "openai";
export type Quality = "360p" | "480p" | "720p" | "1080p";
export type Format = "reels" | "landscape" | "square";

export interface ManualClip {
  start: number;
  end: number;
}

export interface ProcessRequest {
  url: string;
  mode: Mode;
  provider: Provider;
  quality: Quality;
  target_duration: number;
  max_clips: number;
  format: Format;
  auto_tracking: boolean;
  output_prefix: string;
  use_variation: boolean;
  manual_clips?: ManualClip[];
  gemini_api_key?: string;
  openai_api_key?: string;
  openai_base_url?: string;
  openai_chat_model?: string;
  subtitle_style?: string;
  audio_fade?: boolean;
  watermark_text?: string;
  subtitle_position?: string;
  split_screen?: boolean;
}

export interface Clip {
  index: number;
  title: string;
  hook: string;
  reason: string;
  score: number;
  start: number;
  end: number;
  duration: number;
  clip_url: string;
  srt_url: string;
}

export interface JobStatus {
  status: "queued" | "downloading" | "transcribing" | "analyzing" | "cutting" | "done" | "error";
  progress: number;
  clips: Clip[];
  video_title?: string;
  video_duration?: number;
  resolution?: string;
  quality_note?: string;
  transcript?: string;
  error?: string;
}

export interface VideoMeta {
  title: string;
  duration: number;
  thumbnail: string;
  uploader: string;
  view_count: number;
  available_qualities: string[];
}

export async function fetchMetadata(url: string): Promise<VideoMeta> {
  const res = await fetch(`${API}/api/video/metadata`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error("Failed to fetch metadata");
  return res.json();
}

export async function startProcess(req: ProcessRequest): Promise<{ job_id: string }> {
  const res = await fetch(`${API}/api/video/process`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error("Failed to start processing");
  return res.json();
}

export async function getStatus(jobId: string): Promise<JobStatus> {
  const res = await fetch(`${API}/api/video/status/${jobId}`);
  if (!res.ok) throw new Error("Failed to fetch status");
  return res.json();
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function mmssToSec(mmss: string): number {
  try {
    const [m, s] = mmss.split(":").map(Number);
    return m * 60 + s;
  } catch {
    return 0;
  }
}

export const STATUS_LABELS: Record<string, string> = {
  queued: "Queued...",
  downloading: "Downloading video",
  transcribing: "Transcribing audio",
  analyzing: "AI analyzing moments",
  cutting: "Cutting clips",
  done: "Done!",
  error: "Error",
};
