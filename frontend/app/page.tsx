"use client";

import { useState, useEffect, useRef } from "react";
import {
  Scissors, Zap, Download, FileText, ChevronDown,
  AlertCircle, Loader2, Plus, Trash2,
  Copy, Info, Maximize, CheckCircle,
  Sparkles, Sliders, Key, Eye, EyeOff, Check,
  ExternalLink, Video, Compass, Clock
} from "lucide-react";
import {
  fetchMetadata, startProcess, getStatus,
  formatDuration, mmssToSec, STATUS_LABELS,
  API,
  type VideoMeta, type JobStatus, type Clip,
  type Mode, type Provider, type Quality, type Format, type ManualClip,
} from "./lib/api";

const POLL_INTERVAL = 2500;

interface ApiProfile {
  id: string;
  name: string;
  geminiApiKey: string;
  openaiApiKey: string;
  openaiBaseUrl: string;
  openaiChatModel: string;
  transcriptionProvider: string;
  customTranscribeKey: string;
  customTranscribeBase: string;
  customTranscribeModel: string;
  aiProvider?: string;
}

// Profiles removed to simplify direct API Key settings

function getYouTubeId(url: string): string | null {
  try {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  } catch {
    return null;
  }
}

function getFormatFromResolution(res?: string): "reels" | "landscape" | "square" {
  if (!res) return "landscape";
  const parts = res.split("x");
  if (parts.length === 2) {
    const w = parseInt(parts[0], 10);
    const h = parseInt(parts[1], 10);
    if (!isNaN(w) && !isNaN(h)) {
      if (w < h) return "reels";
      if (w === h) return "square";
    }
  }
  return "landscape";
}

export default function Home() {
  // ── URL & Meta ──
  const [url, setUrl] = useState("");
  const [meta, setMeta] = useState<VideoMeta | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);

  const videoId = getYouTubeId(url);
  const [mounted, setMounted] = useState(false);

  // ── Manual Timeline Slider States ──
  const [manualStartSec, setManualStartSec] = useState(0);
  const [manualEndSec, setManualEndSec] = useState(60);
  const [showCropSimulator, setShowCropSimulator] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // ── Subtitle States ──
  const [subtitleStyle, setSubtitleStyle] = useState<string>("none");

  // ── YouTube postMessage: receive current time from iframe ──
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (!e.data) return;
      try {
        const data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        if (data.event === "infoDelivery" && data.info?.currentTime !== undefined) {
          setCurrentTime(data.info.currentTime);
        }
      } catch {}
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // Reset currentTime when video changes
  useEffect(() => {
    setCurrentTime(0);
  }, [videoId]);

  // Sync sliders when video meta loads, restoring saved markers if they exist
  useEffect(() => {
    if (meta && videoId) {
      const savedStart = localStorage.getItem(`clipforge_manual_start_${videoId}`);
      const savedEnd = localStorage.getItem(`clipforge_manual_end_${videoId}`);
      if (savedStart !== null) {
        setManualStartSec(Number(savedStart));
      } else {
        setManualStartSec(0);
      }
      if (savedEnd !== null) {
        setManualEndSec(Number(savedEnd));
      } else {
        setManualEndSec(Math.min(meta.duration, 60));
      }
    }
  }, [meta, videoId]);

  // Save manual markers to localStorage
  useEffect(() => {
    if (videoId && meta) {
      localStorage.setItem(`clipforge_manual_start_${videoId}`, manualStartSec.toString());
      localStorage.setItem(`clipforge_manual_end_${videoId}`, manualEndSec.toString());
    }
  }, [manualStartSec, manualEndSec, videoId, meta]);


  // ── Settings ──
  const [mode, setMode] = useState<Mode>("ai");
  const [provider, setProvider] = useState<Provider>("gemini");
  const [quality, setQuality] = useState<Quality>("720p");
  const [targetDuration, setTargetDuration] = useState(60);
  const [customDuration, setCustomDuration] = useState(false);
  const [maxClips, setMaxClips] = useState(3);
  const [format, setFormat] = useState<Format>("reels");
  const [autoTracking, setAutoTracking] = useState(false);
  const [outputPrefix, setOutputPrefix] = useState("");
  const [useVariation, setUseVariation] = useState(false);

  // ── New Video Customization States ──
  const [subtitlePosition, setSubtitlePosition] = useState<string>("bottom");
  const [audioFade, setAudioFade] = useState<boolean>(false);
  const [addWatermark, setAddWatermark] = useState<boolean>(false);
  const [watermarkText, setWatermarkText] = useState<string>("");
  const [splitScreen, setSplitScreen] = useState<boolean>(false);

  // ── Manual clips ──
  const [manualClips, setManualClips] = useState<ManualClip[]>([]);
  const [manualStart, setManualStart] = useState("00:00");
  const [manualEnd, setManualEnd] = useState("01:00");

  // ── Job state ──
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [error, setError] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── History state ──
  interface HistoryJob extends JobStatus {
    jobId: string;
  }
  const [history, setHistory] = useState<HistoryJob[]>([]);

  // ── Theming & Explanation states ──
  const [theme, setTheme] = useState<string>("dark");
  const [infoOpen, setInfoOpen] = useState(false);

  // ── Profiles States ──
  const [profiles, setProfiles] = useState<ApiProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");
  const [newProfileName, setNewProfileName] = useState("");
  const [showAddProfileInput, setShowAddProfileInput] = useState(false);
  const [showDeleteConfirmId, setShowDeleteConfirmId] = useState<string>("");

  // ── API Keys States ──
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState("");
  const [openaiChatModel, setOpenaiChatModel] = useState("");

  // ── Transcription settings states ──
  const [useLocalWhisper, setUseLocalWhisper] = useState(false);
  const [cloudProvider, setCloudProvider] = useState("gemini");
  const transcriptionProvider = useLocalWhisper ? "local" : cloudProvider;
  const [customTranscribeKey, setCustomTranscribeKey] = useState("");
  const [customTranscribeBase, setCustomTranscribeBase] = useState("");
  const [customTranscribeModel, setCustomTranscribeModel] = useState("whisper-1");
  const [showTranscribeKey, setShowTranscribeKey] = useState(false);

  const [profilesOpen, setProfilesOpen] = useState(false);
  const [transcribeOpen, setTranscribeOpen] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clipSummary, setClipSummary] = useState(false);



  // Load all localStorage states on mount
  useEffect(() => {
    // 1. Theme
    const savedTheme = localStorage.getItem("clipforge_theme");
    if (savedTheme) {
      setTheme(savedTheme);
    }
    
    // 2. Profiles
    const savedProfiles = localStorage.getItem("clipforge_profiles_v3");
    const savedSelectedId = localStorage.getItem("clipforge_selected_profile_id_v3");
    let initialProfiles: ApiProfile[] = [];
    let initialSelectedId = "";
    
    if (savedProfiles) {
      try {
        initialProfiles = JSON.parse(savedProfiles);
      } catch {}
    }
    
    if (initialProfiles.length === 0) {
      const defaultProf: ApiProfile = {
        id: "prof_default",
        name: "My Keys",
        geminiApiKey: localStorage.getItem("clipforge_gemini_api_key") || "",
        openaiApiKey: localStorage.getItem("clipforge_openai_api_key") || "",
        openaiBaseUrl: localStorage.getItem("clipforge_openai_base_url") || "",
        openaiChatModel: localStorage.getItem("clipforge_openai_chat_model") || "",
        transcriptionProvider: localStorage.getItem("clipforge_transcription_provider") || "gemini",
        customTranscribeKey: localStorage.getItem("clipforge_custom_transcribe_key") || "",
        customTranscribeBase: localStorage.getItem("clipforge_custom_transcribe_base") || "",
        customTranscribeModel: localStorage.getItem("clipforge_custom_transcribe_model") || "whisper-1",
        aiProvider: "gemini",
      };
      initialProfiles = [defaultProf];
      initialSelectedId = "prof_default";
      localStorage.setItem("clipforge_profiles_v3", JSON.stringify(initialProfiles));
      localStorage.setItem("clipforge_selected_profile_id_v3", "prof_default");
    } else {
      initialSelectedId = savedSelectedId || initialProfiles[0].id;
    }
    
    setProfiles(initialProfiles);
    setSelectedProfileId(initialSelectedId);

    const savedClipSummary = localStorage.getItem("clipforge_clip_summary");
    if (savedClipSummary) setClipSummary(savedClipSummary === "true");

    // 3. History
    const savedHistory = localStorage.getItem("clipforge_history");
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error("Failed to load history:", e);
      }
    }

    // 4. Mode, URL, Meta
    const savedMode = localStorage.getItem("clipforge_mode");
    if (savedMode) {
      setMode(savedMode as Mode);
    }
    const savedUrl = localStorage.getItem("clipforge_url");
    if (savedUrl) {
      setUrl(savedUrl);
    }
    const savedMeta = localStorage.getItem("clipforge_meta");
    if (savedMeta) {
      try {
        setMeta(JSON.parse(savedMeta));
      } catch (e) {
        console.error("Failed to parse saved meta:", e);
      }
    }

    // Load customization settings
    const savedFormat = localStorage.getItem("clipforge_format");
    if (savedFormat) setFormat(savedFormat as Format);
    const savedSubtitleStyle = localStorage.getItem("clipforge_subtitle_style");
    if (savedSubtitleStyle) setSubtitleStyle(savedSubtitleStyle);
    const savedSubtitlePosition = localStorage.getItem("clipforge_subtitle_position");
    if (savedSubtitlePosition) setSubtitlePosition(savedSubtitlePosition);
    const savedAudioFade = localStorage.getItem("clipforge_audio_fade");
    if (savedAudioFade) setAudioFade(savedAudioFade === "true");
    const savedAddWatermark = localStorage.getItem("clipforge_add_watermark");
    if (savedAddWatermark) setAddWatermark(savedAddWatermark === "true");
    const savedWatermarkText = localStorage.getItem("clipforge_watermark_text");
    if (savedWatermarkText) setWatermarkText(savedWatermarkText);
    const savedSplitScreen = localStorage.getItem("clipforge_split_screen");
    if (savedSplitScreen) setSplitScreen(savedSplitScreen === "true");

    // Set mounted to true after all initial state is loaded
    setMounted(true);
  }, []);

  // Save theme
  useEffect(() => {
    if (mounted) {
      localStorage.setItem("clipforge_theme", theme);
    }
  }, [theme, mounted]);

  // Load selected profile settings into inputs
  useEffect(() => {
    if (selectedProfileId) {
      const active = profiles.find((p) => p.id === selectedProfileId);
      if (active) {
        setGeminiApiKey(active.geminiApiKey || "");
        setOpenaiApiKey(active.openaiApiKey || "");
        setOpenaiBaseUrl(active.openaiBaseUrl || "");
        setOpenaiChatModel(active.openaiChatModel || "");
        setProvider((active.aiProvider as Provider) || "gemini");
        const prov = active.transcriptionProvider || "gemini";
        if (prov === "local") {
          setUseLocalWhisper(true);
          setCloudProvider("gemini");
        } else {
          setUseLocalWhisper(false);
          setCloudProvider(prov);
        }
        setCustomTranscribeKey(active.customTranscribeKey || "");
        setCustomTranscribeBase(active.customTranscribeBase || "");
        setCustomTranscribeModel(active.customTranscribeModel || "whisper-1");
      }
    }
  }, [selectedProfileId, profiles]);

  // Save selected profile ID to localStorage
  useEffect(() => {
    if (mounted && selectedProfileId) {
      localStorage.setItem("clipforge_selected_profile_id_v3", selectedProfileId);
    }
  }, [selectedProfileId, mounted]);

  // Save history to localStorage
  useEffect(() => {
    if (mounted) {
      localStorage.setItem("clipforge_history", JSON.stringify(history));
    }
  }, [history, mounted]);

  // Save mode to localStorage
  useEffect(() => {
    if (mounted) {
      localStorage.setItem("clipforge_mode", mode);
    }
  }, [mode, mounted]);

  // Save url to localStorage
  useEffect(() => {
    if (mounted) {
      localStorage.setItem("clipforge_url", url);
    }
  }, [url, mounted]);

  // Save customization options
  useEffect(() => {
    if (mounted) {
      localStorage.setItem("clipforge_format", format);
    }
  }, [format, mounted]);

  useEffect(() => {
    if (mounted) {
      localStorage.setItem("clipforge_subtitle_style", subtitleStyle);
    }
  }, [subtitleStyle, mounted]);

  useEffect(() => {
    if (mounted) {
      localStorage.setItem("clipforge_subtitle_position", subtitlePosition);
    }
  }, [subtitlePosition, mounted]);

  useEffect(() => {
    if (mounted) {
      localStorage.setItem("clipforge_audio_fade", audioFade.toString());
    }
  }, [audioFade, mounted]);

  useEffect(() => {
    if (mounted) {
      localStorage.setItem("clipforge_add_watermark", addWatermark.toString());
    }
  }, [addWatermark, mounted]);

  useEffect(() => {
    if (mounted) {
      localStorage.setItem("clipforge_watermark_text", watermarkText);
    }
  }, [watermarkText, mounted]);

  useEffect(() => {
    if (mounted) {
      localStorage.setItem("clipforge_split_screen", splitScreen.toString());
    }
  }, [splitScreen, mounted]);

  useEffect(() => {
    if (mounted) {
      localStorage.setItem("clipforge_clip_summary", clipSummary.toString());
    }
  }, [clipSummary, mounted]);

  // Save meta and url cache to localStorage
  useEffect(() => {
    if (mounted) {
      if (meta) {
        localStorage.setItem("clipforge_meta", JSON.stringify(meta));
        localStorage.setItem("clipforge_meta_url", url);
      } else {
        localStorage.removeItem("clipforge_meta");
        localStorage.removeItem("clipforge_meta_url");
      }
    }
  }, [meta, url, mounted]);

  // Auto-fetch metadata asynchronously in the background as a quality/views enhancement
  useEffect(() => {
    const isYT = url.includes("youtube.com") || url.includes("youtu.be");
    if (!url || !isYT) {
      setMeta(null);
      localStorage.removeItem("clipforge_meta");
      localStorage.removeItem("clipforge_meta_url");
      return;
    }

    const timeout = setTimeout(async () => {
      try {
        // Fetch metadata in background to enrich views & qualities, but do NOT block manual sliders
        const data = await fetchMetadata(url);
        setMeta((prev) => {
          if (!prev) return data;
          return {
            ...prev,
            view_count: data.view_count,
            available_qualities: data.available_qualities,
          };
        });
      } catch {
        // silent
      }
    }, 1500); // Debounce to allow player to load first
    return () => clearTimeout(timeout);
  }, [url]);

  // Poll job
  useEffect(() => {
    if (!jobId) return;
    pollRef.current = setInterval(async () => {
      try {
        const status = await getStatus(jobId);
        setJob(status);
        if (status.status === "done") {
          clearInterval(pollRef.current!);
          setHistory((prev) => {
            if (prev.some((h) => h.jobId === jobId)) return prev;
            return [{ ...status, jobId }, ...prev];
          });
          setJobId(null);
          setJob(null);
        } else if (status.status === "error") {
          clearInterval(pollRef.current!);
          setError(status.error || "Processing failed");
          setJobId(null);
          setJob(null);
        }
      } catch (e: any) {
        // silent
      }
    }, POLL_INTERVAL);
    return () => clearInterval(pollRef.current!);
  }, [jobId]);

  const handleDeleteClip = async (jId: string, clipIndex: number, clipUrl: string, srtUrl: string) => {
    try {
      await fetch(`${API}/api/video/delete-clip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jId,
          clip_index: clipIndex,
          clip_url: clipUrl,
          srt_url: srtUrl,
        }),
      });
    } catch (e) {
      console.error("Failed to delete clip on server:", e);
    }
    setHistory((prev) => {
      return prev
        .map((item) => {
          if (item.jobId !== jId) return item;
          const updatedClips = item.clips.filter((c) => c.index !== clipIndex);
          return { ...item, clips: updatedClips };
        })
        .filter((item) => item.clips.length > 0);
    });
  };

  const handleDeleteJob = async (jId: string) => {
    try {
      await fetch(`${API}/api/video/delete-job`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: jId }),
      });
    } catch (e) {
      console.error("Failed to delete job on server:", e);
    }
    setHistory((prev) => prev.filter((item) => item.jobId !== jId));
  };

  const handleClearAllHistory = async () => {
    try {
      await fetch(`${API}/api/video/cleanup`, { method: "POST" });
    } catch (e) {
      console.error("Failed to run cleanup:", e);
    }
    setHistory([]);
    setShowClearConfirm(false);
  };

  const handleSaveProfile = () => {
    if (!selectedProfileId) return;
    const updated = profiles.map((p) => {
      if (p.id === selectedProfileId) {
        return {
          ...p,
          geminiApiKey,
          openaiApiKey,
          openaiBaseUrl,
          openaiChatModel,
          transcriptionProvider,
          customTranscribeKey,
          customTranscribeBase,
          customTranscribeModel,
          aiProvider: provider,
        };
      }
      return p;
    });
    setProfiles(updated);
    localStorage.setItem("clipforge_profiles_v3", JSON.stringify(updated));
    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
      setProfilesOpen(false);
    }, 1000);
  };

  const handleProcess = async () => {
    if (!url) return;
    setError("");
    setJob(null);
    try {
      const { job_id } = await startProcess({
        url,
        mode,
        provider,
        quality,
        target_duration: targetDuration,
        max_clips: maxClips,
        format,
        auto_tracking: autoTracking,
        output_prefix: outputPrefix.trim() || "clip",
        use_variation: useVariation,
        manual_clips: mode === "manual" ? manualClips : undefined,
        gemini_api_key: geminiApiKey.trim() || undefined,
        openai_api_key: openaiApiKey.trim() || undefined,
        openai_base_url: openaiBaseUrl.trim() || undefined,
        openai_chat_model: openaiChatModel.trim() || undefined,
        subtitle_style: subtitleStyle,
        audio_fade: audioFade,
        watermark_text: addWatermark ? watermarkText : "",
        subtitle_position: subtitleStyle !== "none" ? subtitlePosition : "bottom",
        split_screen: splitScreen,
        clip_summary: clipSummary,
        transcription_provider: transcriptionProvider,
        custom_transcribe_key: customTranscribeKey.trim() || undefined,
        custom_transcribe_base: customTranscribeBase.trim() || undefined,
        custom_transcribe_model: customTranscribeModel.trim() || undefined,
      });
      setJobId(job_id);
      setJob({ status: "queued", progress: 0, clips: [] });
    } catch (e: any) {
      setError(e.message);
    }
  };

  const addManualClip = () => {
    const start = mmssToSec(manualStart);
    const end = mmssToSec(manualEnd);
    if (end <= start) return;
    setManualClips((prev) => [...prev, { start, end }]);
  };

  const addManualClipFromSec = (start: number, end: number) => {
    if (end <= start) return;
    setManualClips((prev) => [...prev, { start, end }]);
  };

  const seekToTime = (sec: number) => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    iframe.contentWindow.postMessage(
      JSON.stringify({ event: "command", func: "seekTo", args: [sec, true] }),
      "*"
    );
    setCurrentTime(sec);
  };

  const isProcessing = job && job.status !== "done" && job.status !== "error";
  const canProcess = url && (mode !== "manual" || manualClips.length > 0);

  return (
    <div className={`theme-${theme} relative flex flex-col lg:flex-row min-h-screen lg:h-screen lg:overflow-hidden bg-surface-900 text-white selection:bg-indigo-500/30 selection:text-white lg:transition-colors lg:duration-500 overflow-x-hidden bg-tech-grid`}>
      {/* Background glow blobs — clipped to prevent horizontal overflow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-500/10 blur-[60px] lg:blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-pink-500/5 blur-[60px] lg:blur-[120px]" />
      </div>

      {/* LEFT COLUMN: Sidebar Console */}
      <aside className="w-full lg:w-[420px] xl:w-[460px] border-b lg:border-b-0 lg:border-r border-white/5 lg:h-screen lg:sticky lg:top-0 flex flex-col bg-surface-800/60 lg:backdrop-blur-xl z-20 lg:overflow-y-auto lg:overscroll-y-contain scrollbar-premium lg:animate-fade-in-left">
        {/* Branding header */}
        <div className="p-6 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 group-hover:scale-110 transition-transform duration-300">
              <Scissors className="text-pure-white w-4 h-4 group-hover:rotate-12 transition-transform" />
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-white to-white/70 bg-clip-text text-transparent">ClipForge</span>
              <span className="ml-2 text-[10px] font-bold font-mono text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">BETA</span>
            </div>
          </div>
          {/* Active Job indicator icon if processing */}
          {isProcessing && (
            <div className="flex items-center gap-1.5 bg-indigo-500/10 px-2.5 py-1 rounded-full border border-indigo-500/20 animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-ping"></span>
              <span className="text-[10px] font-mono text-indigo-300 uppercase font-bold">Forging</span>
            </div>
          )}
        </div>

        {/* Theme & Doc Selector bar */}
        <div className="px-6 py-3 border-b border-white/5 bg-surface-900/20 flex items-center justify-between">
          <button
            onClick={() => setInfoOpen(true)}
            className="flex items-center gap-1 text-[11px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors bg-indigo-500/10 px-2.5 py-1 rounded-lg border border-indigo-500/25"
          >
            <Info size={12} /> How it Works
          </button>
          
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-white/40 font-mono mr-1">Theme:</span>
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              className="bg-surface-900 border border-white/10 rounded-lg px-2 py-0.5 text-[10px] focus:outline-none focus:border-indigo-500/40 text-white font-semibold cursor-pointer"
            >
              <option value="dark">🌑 Slate Dark</option>
              <option value="light">☀️ Light Velvet</option>
              <option value="cyberpunk">⚡ Cyberpunk</option>
              <option value="emerald">🌲 Emerald</option>
            </select>
          </div>
        </div>

        {/* Console Inputs */}
        <div className="p-6 space-y-6 flex-1">
          {/* Section 1: YouTube URL */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-mono text-white/40 uppercase tracking-widest flex items-center gap-1.5">
                <ExternalLink size={12} className="text-indigo-400" /> YouTube Video Source
              </label>
              {url && (
                <button onClick={() => setUrl("")} className="text-xs text-white/30 hover:text-white/60 transition-colors">
                  Clear
                </button>
              )}
            </div>
            <div className="relative">
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Paste video link here..."
                className="w-full bg-surface-900 border border-white/10 rounded-xl pl-4 pr-10 py-3.5 text-sm placeholder-white/20 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 transition-all glass-input"
              />
              <div className="absolute right-3.5 top-3.5 text-white/20">
                <Compass size={16} className={metaLoading ? "animate-spin text-indigo-400" : ""} />
              </div>
            </div>

            {/* Shimmer skeleton or meta details */}
            {metaLoading && (
              <div className="bg-white/[0.01] border border-white/5 rounded-xl p-3 flex gap-3 animate-pulse">
                <div className="w-20 h-12 rounded-lg bg-white/5 shimmer flex-shrink-0" />
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-3 bg-white/5 shimmer rounded w-5/6" />
                  <div className="h-2 bg-white/5 shimmer rounded w-1/2" />
                </div>
              </div>
            )}

            {meta && !metaLoading && (
              <div className="flex gap-3 bg-surface-900/60 border border-white/5 rounded-xl p-3 hover:border-indigo-500/20 transition-all duration-300 group">
                {meta.thumbnail && (
                  <div className="relative overflow-hidden rounded-lg w-20 h-12 flex-shrink-0 border border-white/10 shadow border-white/10">
                    <img src={meta.thumbnail} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-white/80 truncate">{meta.title}</p>
                  <p className="text-[10px] text-white/40 mt-1 font-mono">
                    {meta.uploader} · {formatDuration(meta.duration)}
                  </p>
                  {meta.view_count && (
                    <p className="text-[9px] text-white/30 font-mono mt-0.5">
                      {meta.view_count.toLocaleString()} views
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Section 2: AI Analyzer & Profile Settings */}
          <div className="glass rounded-xl border border-white/5 overflow-hidden">
            <button
              onClick={() => setProfilesOpen(!profilesOpen)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/[0.02] transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                <Key size={14} className="text-indigo-400" />
                <span className="text-xs font-semibold text-white/80">AI Analyzer & Profile Settings</span>
                {(geminiApiKey || openaiApiKey) ? (
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/10">
                    Custom Keys Active
                  </span>
                ) : (
                  <span className="text-[10px] font-mono text-white/40 bg-white/5 px-2 py-0.5 rounded-full border border-white/5">
                    Default (.env)
                  </span>
                )}
              </div>
              <ChevronDown size={14} className={`text-white/40 transition-transform duration-300 ${profilesOpen ? "rotate-180" : ""}`} />
            </button>

            {profilesOpen && (
              <div className="px-4 pb-4 border-t border-white/5 pt-3 space-y-3 bg-surface-900/30">
                {/* 🔒 Security Notice Banner for User Trust */}
                <div className="flex items-start gap-2 text-[10px] text-indigo-300 bg-indigo-500/10 p-2.5 rounded-lg border border-indigo-500/20 leading-normal font-sans">
                  <CheckCircle size={12} className="flex-shrink-0 mt-0.5 text-indigo-400" />
                  <span><strong>Security Guarantee:</strong> Your API keys are saved locally in your own browser's secure cache (localStorage). They never pass through our servers and are sent directly to the official AI provider endpoints.</span>
                </div>

                {/* Profiles Selector and Delete */}
                <div className="space-y-1.5 border border-white/5 rounded-lg p-2.5 bg-black/15 animate-scale-up">
                  <label className="text-[9px] font-mono text-white/30 uppercase">Active Profile</label>
                  <div className="flex gap-2">
                    <select
                      value={selectedProfileId}
                      onChange={(e) => setSelectedProfileId(e.target.value)}
                      className="flex-1 bg-surface-900 border border-white/10 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-indigo-500/40 text-white font-semibold cursor-pointer"
                    >
                      <option value="" disabled>-- Select Profile --</option>
                      {profiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          👤 {p.name}
                        </option>
                      ))}
                    </select>

                    {selectedProfileId && (
                      showDeleteConfirmId === selectedProfileId ? (
                        <div className="flex items-center gap-1 bg-red-950/20 border border-red-500/20 px-2 rounded-lg animate-scale-up">
                          <span className="text-[9px] text-red-400 font-bold">Delete?</span>
                          <button
                            type="button"
                            onClick={() => {
                              const updated = profiles.filter((p) => p.id !== selectedProfileId);
                              setProfiles(updated);
                              localStorage.setItem("clipforge_profiles_v3", JSON.stringify(updated));
                              setSelectedProfileId(updated.length > 0 ? updated[0].id : "");
                              setShowDeleteConfirmId("");
                            }}
                            className="text-[9px] bg-red-600 text-white px-1.5 py-0.5 rounded font-bold"
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowDeleteConfirmId("")}
                            className="text-[9px] bg-white/10 text-white/80 px-1.5 py-0.5 rounded font-bold"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowDeleteConfirmId(selectedProfileId)}
                          className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/25 px-2.5 rounded-lg text-xs transition-colors flex items-center justify-center"
                          title="Delete active profile"
                        >
                          <Trash2 size={12} />
                        </button>
                      )
                    )}
                  </div>

                  {/* Add Profile Form (Inline, no native popups) */}
                  {showAddProfileInput ? (
                    <div className="flex gap-1.5 items-center animate-scale-up pt-1.5 border-t border-white/5 mt-1.5">
                      <input
                        type="text"
                        placeholder="Profile name..."
                        value={newProfileName}
                        onChange={(e) => setNewProfileName(e.target.value)}
                        className="flex-1 bg-surface-900 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-indigo-500/45"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!newProfileName.trim()) return;
                          const newProf: ApiProfile = {
                            id: "prof_" + Math.random().toString(36).substring(2, 11),
                            name: newProfileName.trim(),
                            geminiApiKey: "",
                            openaiApiKey: "",
                            openaiBaseUrl: "",
                            openaiChatModel: "",
                            transcriptionProvider: "gemini",
                            customTranscribeKey: "",
                            customTranscribeBase: "",
                            customTranscribeModel: "whisper-1",
                            aiProvider: "gemini",
                          };
                          const updated = [...profiles, newProf];
                          setProfiles(updated);
                          localStorage.setItem("clipforge_profiles_v3", JSON.stringify(updated));
                          setSelectedProfileId(newProf.id);
                          setNewProfileName("");
                          setShowAddProfileInput(false);
                        }}
                        className="bg-indigo-500 hover:bg-indigo-600 text-pure-white px-2.5 py-1 rounded-lg text-xs font-bold transition-all"
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setNewProfileName("");
                          setShowAddProfileInput(false);
                        }}
                        className="text-white/40 hover:text-white/60 text-xs px-1"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowAddProfileInput(true)}
                      className="w-full border border-dashed border-white/10 hover:border-indigo-500/30 hover:bg-white/[0.01] text-white/50 hover:text-indigo-400 py-1.5 rounded-lg text-[10px] font-semibold transition-all mt-1 flex items-center justify-center gap-1"
                    >
                      <Plus size={10} /> Create New Profile
                    </button>
                  )}
                </div>

                {selectedProfileId && (
                  <div className="space-y-2.5 border border-white/5 rounded-lg p-3 bg-black/10 animate-scale-up">
                    {/* Rename profile inline */}
                    <div className="space-y-1">
                      <label className="text-[9px] font-mono text-white/30 uppercase">Profile Name</label>
                      <input
                        type="text"
                        value={profiles.find((p) => p.id === selectedProfileId)?.name || ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          setProfiles((prev) =>
                            prev.map((p) => (p.id === selectedProfileId ? { ...p, name: val } : p))
                          );
                        }}
                        className="w-full bg-surface-900 border border-white/10 rounded-md px-2.5 py-1 text-xs focus:outline-none focus:border-indigo-500/40 text-white font-semibold"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-mono text-white/30 uppercase">AI Analyzer Provider</label>
                      <select
                        value={provider}
                        onChange={(e) => setProvider(e.target.value as Provider)}
                        className="w-full bg-surface-900 border border-white/10 rounded-md px-2.5 py-1 text-xs focus:outline-none focus:border-indigo-500/40 text-white font-semibold cursor-pointer"
                      >
                        <option value="gemini">Google Gemini API (Default)</option>
                        <option value="openai">OpenAI / Custom Universal Proxy</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      {provider === "gemini" && (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <label className="text-[9px] font-mono text-white/30 uppercase">Gemini API Key (AI Analyzer)</label>
                            <button
                              type="button"
                              onClick={() => setShowGeminiKey(!showGeminiKey)}
                              className="text-white/40 hover:text-white/60 text-[10px] flex items-center gap-1"
                            >
                              {showGeminiKey ? <EyeOff size={10} /> : <Eye size={10} />}
                              {showGeminiKey ? "Hide" : "Show"}
                            </button>
                          </div>
                          <input
                            type={showGeminiKey ? "text" : "password"}
                            value={geminiApiKey}
                            onChange={(e) => setGeminiApiKey(e.target.value)}
                            placeholder="AIzaSy..."
                            className="w-full bg-surface-900 border border-white/10 rounded-md px-2.5 py-1 text-xs focus:outline-none focus:border-indigo-500/40 text-white font-mono"
                          />
                          <p className="text-[9px] text-white/40 mt-0.5 leading-tight">For Google Gemini moments suggestion.</p>
                        </div>
                      )}

                      {provider === "openai" && (
                        <div className="space-y-2 animate-scale-up">
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <label className="text-[9px] font-mono text-white/30 uppercase">OpenAI API Key (AI Analyzer)</label>
                              <button
                                type="button"
                                onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                                className="text-white/40 hover:text-white/60 text-[10px] flex items-center gap-1"
                              >
                                {showOpenaiKey ? <EyeOff size={10} /> : <Eye size={10} />}
                                {showOpenaiKey ? "Hide" : "Show"}
                              </button>
                            </div>
                            <input
                              type={showOpenaiKey ? "text" : "password"}
                              value={openaiApiKey}
                              onChange={(e) => setOpenaiApiKey(e.target.value)}
                              placeholder="sk-..."
                              className="w-full bg-surface-900 border border-white/10 rounded-md px-2.5 py-1 text-xs focus:outline-none focus:border-indigo-500/40 text-white font-mono"
                            />
                            <p className="text-[9px] text-white/40 mt-0.5 leading-tight">For OpenAI GPT moments suggestion.</p>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <label className="text-[9px] font-mono text-white/30 uppercase">Base URL</label>
                              <input
                                type="text"
                                value={openaiBaseUrl}
                                onChange={(e) => setOpenaiBaseUrl(e.target.value)}
                                placeholder="https://api.openai.com/v1"
                                className="w-full bg-surface-900 border border-white/10 rounded-md px-2 py-1 text-xs focus:outline-none focus:border-indigo-500/40 text-white"
                              />
                              <p className="text-[9px] text-white/30 mt-0.5 leading-tight">Custom proxy (dinoiki, DeepSeek, etc.).</p>
                            </div>

                            <div className="space-y-1">
                              <label className="text-[9px] font-mono text-white/30 uppercase">Model</label>
                              <input
                                type="text"
                                value={openaiChatModel}
                                onChange={(e) => setOpenaiChatModel(e.target.value)}
                                placeholder="gpt-4o"
                                className="w-full bg-surface-900 border border-white/10 rounded-md px-2 py-1 text-xs focus:outline-none focus:border-indigo-500/40 text-white"
                              />
                              <p className="text-[9px] text-white/30 mt-0.5 leading-tight">Moments analysis model.</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Audio Transcription Settings removed from inside profile keys */}

                    {/* Save button for user assurance and feedback */}
                    <button
                      type="button"
                      onClick={() => {
                        handleSaveProfile();
                      }}
                      className="w-full bg-indigo-500 hover:bg-indigo-600 text-pure-white py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow shadow-indigo-500/10 mt-3"
                    >
                      {saveSuccess ? (
                        <>✓ Saved Successfully!</>
                      ) : (
                        <>💾 Save Profile Settings</>
                      )}
                    </button>
                  </div>
                )}

                {!selectedProfileId && (
                  <p className="text-[10px] text-white/35 leading-relaxed italic bg-black/15 p-2.5 rounded-lg border border-white/5">
                    💡 No active profile selected. To override backend API configurations, click &quot;Create New Profile&quot; above.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Section 2.5: Audio Transcription Settings */}
          <div className="glass rounded-xl border border-white/5 overflow-hidden">
            <button
              onClick={() => setTranscribeOpen(!transcribeOpen)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/[0.02] transition-colors text-left"
              type="button"
            >
              <div className="flex items-center gap-2">
                <FileText size={14} className="text-indigo-400" />
                <span className="text-xs font-semibold text-white/80">Audio Transcription Settings</span>
                {useLocalWhisper ? (
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/10">
                    Local Whisper (Free)
                  </span>
                ) : (
                  <span className="text-[10px] font-mono text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/10 uppercase font-bold">
                    Cloud ({cloudProvider})
                  </span>
                )}
              </div>
              <ChevronDown size={14} className={`text-white/40 transition-transform duration-300 ${transcribeOpen ? "rotate-180" : ""}`} />
            </button>

            {transcribeOpen && (
              <div className="px-4 pb-4 border-t border-white/5 pt-3 space-y-3 bg-surface-900/30">
                {/* Toggle switch for Local Whisper */}
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/10 hover:bg-emerald-500/[0.08] transition-colors">
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-white/90">🎙️ Local Whisper (Offline VPS)</span>
                    <span className="text-[9px] text-emerald-400 font-mono">Free forever, no API keys</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={useLocalWhisper}
                      onChange={(e) => setUseLocalWhisper(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-white/30 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                </div>

                {/* If Local Whisper is enabled, show the nice info alert */}
                {useLocalWhisper && (
                  <div className="text-[9px] text-emerald-300 bg-emerald-500/5 p-2.5 rounded-lg border border-emerald-500/10 leading-snug animate-scale-up font-sans">
                    💡 Local Whisper transcribes offline using a lightweight model directly on your VPS. Free forever, no API keys required! Make sure PyTorch and openai-whisper are installed on the server.
                  </div>
                )}

                {/* If Local Whisper is disabled, let the user choose a cloud provider */}
                {!useLocalWhisper && (
                  <div className="space-y-2 animate-scale-up">
                    <div className="space-y-1">
                      <label className="text-[9px] font-mono text-white/30 uppercase">Cloud Provider</label>
                      <select
                        value={cloudProvider}
                        onChange={(e) => setCloudProvider(e.target.value)}
                        className="w-full bg-surface-900 border border-white/10 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-indigo-500/40 text-white cursor-pointer font-semibold"
                      >
                        <option value="gemini">Google Gemini API (Free Tier available)</option>
                        <option value="openai">OpenAI Whisper API (Paid)</option>
                        <option value="custom">Custom/Universal API Proxy (dinoiki, etc.)</option>
                      </select>
                    </div>

                    {cloudProvider === "gemini" && (
                      <div className="space-y-2 animate-scale-up">
                        <p className="text-[9px] text-indigo-300 bg-indigo-500/5 p-2.5 rounded-lg border border-indigo-500/10 leading-snug font-sans">
                          💡 Gemini free tier transcribes audio files within Google AI Studio quota limits.
                        </p>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <label className="text-[9px] font-mono text-white/30 uppercase">Gemini Transcribe API Key</label>
                            <button
                              type="button"
                              onClick={() => setShowTranscribeKey(!showTranscribeKey)}
                              className="text-white/40 hover:text-white/60 text-[10px] flex items-center gap-1"
                            >
                              {showTranscribeKey ? <EyeOff size={10} /> : <Eye size={10} />}
                              {showTranscribeKey ? "Hide" : "Show"}
                            </button>
                          </div>
                          <input
                            type={showTranscribeKey ? "text" : "password"}
                            value={customTranscribeKey}
                            onChange={(e) => setCustomTranscribeKey(e.target.value)}
                            placeholder="Leave blank to use main Gemini key..."
                            className="w-full bg-surface-900 border border-white/10 rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:border-indigo-500/40 text-white font-mono"
                          />
                        </div>
                      </div>
                    )}

                    {(cloudProvider === "openai" || cloudProvider === "custom") && (
                      <div className="space-y-2.5 border border-white/5 rounded-lg p-2.5 bg-black/10">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <label className="text-[9px] font-mono text-white/30 uppercase">Transcribe API Key</label>
                            <button
                              type="button"
                              onClick={() => setShowTranscribeKey(!showTranscribeKey)}
                              className="text-white/40 hover:text-white/60 text-[10px] flex items-center gap-1"
                            >
                              {showTranscribeKey ? <EyeOff size={10} /> : <Eye size={10} />}
                              {showTranscribeKey ? "Hide" : "Show"}
                            </button>
                          </div>
                          <input
                            type={showTranscribeKey ? "text" : "password"}
                            value={customTranscribeKey}
                            onChange={(e) => setCustomTranscribeKey(e.target.value)}
                            placeholder="Leave blank to use main OpenAI key..."
                            className="w-full bg-surface-900 border border-white/10 rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:border-indigo-500/40 text-white font-mono"
                          />
                        </div>

                        {cloudProvider === "custom" && (
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <label className="text-[9px] font-mono text-white/30 uppercase">Transcribe Base URL</label>
                              <input
                                type="text"
                                value={customTranscribeBase}
                                onChange={(e) => setCustomTranscribeBase(e.target.value)}
                                placeholder="e.g. https://api.openai.com/v1"
                                className="w-full bg-surface-900 border border-white/10 rounded-md px-2 py-1 text-xs focus:outline-none focus:border-indigo-500/40 text-white"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-[9px] font-mono text-white/30 uppercase">Transcribe Model</label>
                              <input
                                type="text"
                                value={customTranscribeModel}
                                onChange={(e) => setCustomTranscribeModel(e.target.value)}
                                placeholder="whisper-1"
                                className="w-full bg-surface-900 border border-white/10 rounded-md px-2 py-1 text-xs focus:outline-none focus:border-indigo-500/40 text-white"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section 3: Mode Selector */}
          <div className="space-y-2">
            <label className="text-xs font-mono text-white/40 uppercase tracking-widest flex items-center gap-1.5">
              <Sliders size={12} className="text-indigo-400" /> Mode Selection
            </label>
            <div className="flex gap-1 bg-surface-900 rounded-xl p-1 border border-white/5">
              {([
                { value: "ai", label: "🧠 AI Suggested" },
                { value: "auto", label: "⚡ Auto" },
                { value: "manual", label: "✂️ Manual" },
              ] as { value: Mode; label: string }[]).map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setMode(value)}
                  className={`flex-1 text-xs py-2.5 rounded-lg font-medium transition-all ${
                    mode === value
                      ? "bg-indigo-500 text-pure-white shadow shadow-indigo-500/20"
                      : "text-white/40 hover:text-white/70"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>



          {/* Section 4: Advanced Tuning parameters */}
          {mode !== "manual" && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-mono text-white/40">Duration / Clip</label>
                {!customDuration ? (
                  <select
                    value={targetDuration}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "custom") { setCustomDuration(true); return; }
                      setTargetDuration(Number(v));
                    }}
                    className="w-full bg-surface-900 border border-white/10 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:border-indigo-500/40 text-white"
                  >
                    {[15, 30, 60, 90, 120].map((n) => (
                      <option key={n} value={n}>{n} seconds</option>
                    ))}
                    <option value="custom">Custom...</option>
                  </select>
                ) : (
                  <div className="flex gap-1">
                    <input
                      type="number"
                      min={5}
                      max={300}
                      value={targetDuration}
                      onChange={(e) => setTargetDuration(Number(e.target.value))}
                      className="flex-1 bg-surface-900 border border-white/10 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:border-indigo-500/40 text-white"
                    />
                    <button
                      onClick={() => setCustomDuration(false)}
                      className="text-white/30 hover:text-white/60 text-xs px-1.5 bg-surface-900 border border-white/10 rounded"
                    >
                      ↩
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-mono text-white/40">Clip Count</label>
                  <span className="text-xs font-mono text-indigo-400 font-bold">{maxClips} clips</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={5}
                  value={maxClips}
                  onChange={(e) => setMaxClips(Number(e.target.value))}
                  className="w-full accent-indigo-500 mt-1 cursor-pointer h-1.5 bg-white/5 rounded-lg appearance-none"
                />
              </div>
            </div>
          )}

          {/* Configuration Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-white/40 uppercase">Quality</label>
              <select
                value={quality}
                onChange={(e) => setQuality(e.target.value as Quality)}
                className="w-full bg-surface-900 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] focus:outline-none focus:border-indigo-500/40 text-white"
              >
                {["360p", "480p", "720p", "1080p"].map((q) => (
                  <option key={q} value={q}>{q}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-mono text-white/40 uppercase">Format</label>
              <div className="flex gap-1 bg-surface-900 rounded-lg p-0.5 border border-white/10">
                {(["reels", "landscape", "square"] as Format[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFormat(f)}
                    className={`flex-1 text-[10px] py-1 rounded-md font-semibold transition-all ${
                      format === f ? "bg-indigo-500 text-pure-white shadow-sm" : "text-white/40 hover:text-white/60"
                    }`}
                  >
                    {f === "reels" ? "9:16" : f === "landscape" ? "16:9" : "1:1"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Subtitle Style Selector */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-white/40 uppercase">Burn-in Subtitles Style</label>
            <select
              value={subtitleStyle}
              onChange={(e) => setSubtitleStyle(e.target.value)}
              className="w-full bg-surface-900 border border-white/10 rounded-lg px-3 py-2.5 text-xs focus:outline-none focus:border-indigo-500/40 text-white font-semibold cursor-pointer"
            >
              <option value="none">❌ No Subtitles (Clean Video)</option>
              <option value="capcut">💛 CapCut Style (Yellow, bold outline)</option>
              <option value="tiktok">🤍 TikTok Style (White, bold outline)</option>
              <option value="karaoke">💙 Karaoke Style (Cyan text, bold outline)</option>
              <option value="minimal">🖋️ Minimal Style (Clean, small subtitles)</option>
            </select>
          </div>

          {/* Subtitle Position Selector */}
          {subtitleStyle !== "none" && (
            <div className="space-y-1 transition-all duration-300">
              <label className="text-[10px] font-mono text-white/40 uppercase">Subtitle Position</label>
              <select
                value={subtitlePosition}
                onChange={(e) => setSubtitlePosition(e.target.value)}
                className="w-full bg-surface-900 border border-white/10 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500/40 text-white font-semibold cursor-pointer"
              >
                <option value="bottom">⬇️ Bottom (Default)</option>
                <option value="center">↕️ Center / Middle</option>
                <option value="top">⬆️ Top</option>
              </select>
            </div>
          )}

          {/* Prefix + Toggles */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-mono text-white/40 uppercase">Output Prefix</label>
              <input
                value={outputPrefix}
                onChange={(e) => setOutputPrefix(e.target.value)}
                placeholder="clip"
                className="w-full bg-surface-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500/40"
              />
            </div>
            <div className="flex flex-col gap-2 justify-center pt-3">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoTracking}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setAutoTracking(checked);
                    if (checked) setSplitScreen(false);
                  }}
                  className="accent-indigo-500 w-3.5 h-3.5 rounded border-white/10"
                />
                <span className="text-[11px] text-white/60 hover:text-white/80 transition-colors">🎯 Auto Tracking</span>
              </label>
              {format === "reels" && (
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={splitScreen}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setSplitScreen(checked);
                      if (checked) setAutoTracking(false);
                    }}
                    className="accent-indigo-500 w-3.5 h-3.5 rounded border-white/10"
                  />
                  <span className="text-[11px] text-white/60 hover:text-white/80 transition-colors">🎙️ Podcast Duo Split</span>
                </label>
              )}
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={audioFade}
                  onChange={(e) => setAudioFade(e.target.checked)}
                  className="accent-indigo-500 w-3.5 h-3.5 rounded border-white/10"
                />
                <span className="text-[11px] text-white/60 hover:text-white/80 transition-colors">🔊 Audio Fade (1s)</span>
              </label>
              {mode === "ai" && (
                <>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={useVariation}
                      onChange={(e) => setUseVariation(e.target.checked)}
                      className="accent-indigo-500 w-3.5 h-3.5 rounded border-white/10"
                    />
                    <span className="text-[11px] text-white/60 hover:text-white/80 transition-colors">🔄 Variation</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={clipSummary}
                      onChange={(e) => setClipSummary(e.target.checked)}
                      className="accent-indigo-500 w-3.5 h-3.5 rounded border-white/10"
                    />
                    <span className="text-[11px] text-white/60 hover:text-white/80 transition-colors">📝 Scene Summary</span>
                  </label>
                </>
              )}
            </div>
          </div>

          {/* Custom Watermark */}
          <div className="space-y-2 border-t border-white/5 pt-3">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={addWatermark}
                onChange={(e) => setAddWatermark(e.target.checked)}
                className="accent-indigo-500 w-3.5 h-3.5 rounded border-white/10"
              />
              <span className="text-xs text-white/60 hover:text-white/80 transition-colors font-semibold">🏷️ Add Custom Watermark</span>
            </label>
            {addWatermark && (
              <input
                value={watermarkText}
                onChange={(e) => setWatermarkText(e.target.value)}
                placeholder="Enter watermark text..."
                className="w-full bg-surface-900 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500/40"
              />
            )}
          </div>

          {/* Error Banner */}
          {error && (
            <div className="flex items-start gap-2.5 text-red-400 text-xs bg-red-500/10 px-3.5 py-3 rounded-xl border border-red-500/20">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Start Forging Button */}
          <button
            onClick={handleProcess}
            disabled={!canProcess || !!isProcessing}
            className={`w-full button-premium disabled:opacity-40 disabled:cursor-not-allowed text-pure-white font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 text-sm glow-border ${
              canProcess && !isProcessing ? "pulse-glow" : ""
            }`}
          >
            {isProcessing ? (
              <><Loader2 size={16} className="animate-spin text-pure-white" /> Forging Video Clips...</>
            ) : (
              <><Zap size={16} className="text-pure-white fill-white" /> Forge Video Clips</>
            )}
          </button>
        </div>
      </aside>

      {/* RIGHT COLUMN: Main Workspace */}
      <main className="flex-1 flex flex-col bg-gradient-to-br from-surface-900 via-surface-900 to-indigo-950/15 lg:overflow-y-auto lg:overscroll-y-contain lg:animate-fade-in-right">
        {/* Workspace Top Bar */}
        <header className="px-6 lg:px-10 py-5 border-b border-white/5 flex items-center justify-between bg-surface-900/40 lg:backdrop-blur-md">
          <div>
            <h1 className="font-heading text-lg font-bold text-white tracking-wide">Workspace Console</h1>
            <p className="text-xs text-white/40 mt-0.5 font-mono">Process monitors and generated video libraries</p>
          </div>
          {history.length > 0 && (
            showClearConfirm ? (
              <div className="flex items-center gap-2 animate-scale-up">
                <span className="text-xs text-red-400 font-semibold font-mono">Delete all files?</span>
                <button
                  onClick={handleClearAllHistory}
                  className="text-xs bg-red-600 hover:bg-red-700 text-white px-2.5 py-1.5 rounded-md transition-all font-bold shadow shadow-red-600/10"
                >
                  Yes
                </button>
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="text-xs bg-white/10 hover:bg-white/20 text-white/70 px-2.5 py-1.5 rounded-md transition-all font-bold"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowClearConfirm(true)}
                className="flex items-center gap-1.5 text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 px-3.5 py-2 rounded-lg border border-red-500/25 transition-all font-semibold"
              >
                <Trash2 size={13} /> Clear All Files
              </button>
            )
          )}
        </header>

        {/* Workspace Area */}
        <div className="flex-1 p-6 lg:p-10 space-y-8 max-w-[1600px] w-full mx-auto">
          {/* 1. Active job indicator */}
          {job && job.status !== "done" && job.status !== "error" && (
            <div className="glass rounded-3xl p-6 border border-indigo-500/15 pulse-glow space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                    <Loader2 size={16} className="animate-spin text-indigo-400" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-white tracking-wide">
                      {STATUS_LABELS[job.status]}
                    </span>
                    {(job as any).download_speed && (
                      <span className="text-xs text-indigo-300 ml-2 font-mono">
                        ({(job as any).download_speed} · ETA: {(job as any).download_eta})
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-sm font-mono font-bold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-0.5 rounded-full">
                  {job.progress}%
                </span>
              </div>

              {/* Progress bar */}
              <div className="h-2 bg-surface-700/60 rounded-full overflow-hidden border border-white/5">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500 rounded-full transition-all duration-500"
                  style={{ width: `${job.progress}%` }}
                />
              </div>

              {/* Horizontal Stepper checklist */}
              <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-white/5">
                {["downloading", "transcribing", "analyzing", "cutting", "done"].map((step, idx) => {
                  const steps = ["downloading", "transcribing", "analyzing", "cutting", "done"];
                  const currentIndex = steps.indexOf(job.status);
                  const stepIndex = steps.indexOf(step);
                  const isCompleted = stepIndex < currentIndex;
                  const isActive = stepIndex === currentIndex;

                  const stepIcons: Record<string, any> = {
                    downloading: Download,
                    transcribing: FileText,
                    analyzing: Sparkles,
                    cutting: Scissors,
                    done: CheckCircle
                  };
                  const StepIcon = stepIcons[step] || Loader2;

                  return (
                    <div
                      key={step}
                      className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${
                        isCompleted
                          ? "text-indigo-400 bg-indigo-500/5 border-indigo-500/20 font-medium"
                          : isActive
                          ? "text-pure-white bg-indigo-500/15 border-indigo-500/40 font-semibold shadow-inner shadow-indigo-500/5 pulse-glow"
                          : "text-white/20 bg-white/[0.005] border-white/5"
                      }`}
                    >
                      <StepIcon size={14} className={isActive ? "text-indigo-400 animate-pulse" : isCompleted ? "text-indigo-400" : "text-white/10"} />
                      <span className="text-xs capitalize tracking-wide">{step === "downloading" ? "Fetch" : step === "transcribing" ? "Transcribe" : step === "analyzing" ? "Analyze" : step === "cutting" ? "Render" : "Finish"}</span>
                      {isCompleted && <Check size={12} className="ml-auto text-indigo-400" />}
                    </div>
                  );
                })}
              </div>

              {/* Detailed tip with beautiful explainer */}
              <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-2xl p-4 flex gap-3 items-start text-xs leading-relaxed text-indigo-200/70">
                <Info size={16} className="text-indigo-400 flex-shrink-0 mt-0.5" />
                <div>
                  {job.status === "queued" && (
                    <p>
                      <strong>Sistem Mengantre:</strong> Menunggu slot pemrosesan video Anda... Pemuatan file akan segera dimulai secara otomatis.
                    </p>
                  )}
                  {job.status === "downloading" && (
                    <p>
                      <strong>Mengunduh Video YouTube:</strong> Pengunduh mengunduh resolusi {quality} langsung ke folder penyimpanan lokal Anda. Kecepatan download sangat bergantung pada koneksi internet server backend Anda.
                    </p>
                  )}
                  {job.status === "transcribing" && (
                    <p>
                      <strong>Mengekstrak Suara & Transkripsi:</strong> Mengambil audio mentah dari video lalu mengirimkannya ke Google Gemini API untuk mengekstrak teks ucapan lengkap beserta penanda waktu (timestamp) di setiap kalimat.
                    </p>
                  )}
                  {job.status === "analyzing" && (
                    <p>
                      <strong>Mencari Potongan Viral (AI):</strong> Transkrip teks video dianalisis menggunakan teknologi AI pintar {provider === "gemini" ? "Gemini 1.5 Pro" : "GPT-4o"} untuk mengidentifikasi momen paling seru, hook terkuat, dan memberikan skor viralitas (1-10) untuk setiap bagian.
                    </p>
                  )}
                  {job.status === "cutting" && (
                    <p>
                      <strong>Pemotongan & Render FFmpeg:</strong> Server lokal memotong klip video sesuai penanda waktu terpilih, memperbesar video (crop) agar pas ke format {format === "reels" ? "Reels 9:16" : format === "square" ? "Square 1:1" : "Landscape 16:9"} menggunakan filter Gaussian Blur dinamis pada bagian background.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 2. Error box */}
          {job?.status === "error" && (
            <div className="glass rounded-3xl p-6 border border-red-500/20 bg-red-500/[0.02] space-y-3">
              <div className="flex items-center gap-2.5 text-red-400 font-bold">
                <AlertCircle size={18} /> Error Processing Clip
              </div>
              <p className="text-xs text-white/50 font-mono bg-black/20 p-3 rounded-lg border border-white/5 whitespace-pre-wrap">{job.error}</p>
            </div>
          )}

          {/* Manual Video Player Editor & Timeline Slider */}
          {mode === "manual" && url && (
            <div className="bg-surface-800 border border-white/5 p-5 rounded-3xl shadow-xl">
              <div className="flex items-center justify-between border-b border-white/5 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <Video className="text-indigo-400 w-5 h-5" />
                  <h3 className="font-heading font-bold text-sm text-white">Manual Timeline Clip Editor</h3>
                </div>
                <button
                  onClick={() => setShowCropSimulator(!showCropSimulator)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-all font-semibold flex items-center gap-1.5 ${
                    showCropSimulator
                      ? "bg-indigo-500/25 text-indigo-300 border-indigo-500/40"
                      : "bg-surface-700 hover:bg-surface-600 text-white/70 border-white/10"
                  }`}
                >
                  🎬 {showCropSimulator ? "Hide Crop Frame" : "Simulate Crop Frame"}
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left side: Player, Timeline Track, and Inline Compact Action Row (col-span 2) */}
                <div className="lg:col-span-2 space-y-4">
                  {/* Player & Crop Simulator */}
                  <div className="relative aspect-video w-full rounded-2xl overflow-hidden border border-white/10 bg-black/80 flex items-center justify-center group/player">
                    {videoId ? (
                      <iframe
                        key={videoId}
                        ref={iframeRef}
                        src={`https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1&enablejsapi=1`}
                        className="w-full h-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        title="YouTube video player"
                        onLoad={() => {
                          // Subscribe to time updates via postMessage
                          iframeRef.current?.contentWindow?.postMessage(
                            JSON.stringify({ event: "listening" }),
                            "*"
                          );
                        }}
                      />
                    ) : (
                      <div className="text-center text-xs text-white/30 p-10 font-mono">
                        Visual player only supports YouTube links. Please type timestamps manually in the console.
                      </div>
                    )}

                    {/* Crop simulator overlay */}
                    {showCropSimulator && videoId && (
                      <div
                        onClick={() => setShowCropSimulator(false)}
                        className="absolute inset-0 pointer-events-none flex items-center justify-center cursor-pointer"
                        title="Click to hide crop frame"
                      >
                        {format === "reels" ? (
                          <div className="h-full aspect-[9/16] border-2 border-dashed border-indigo-400 bg-indigo-500/10 flex items-center justify-center shadow-[0_0_50px_rgba(99,102,241,0.25)] animate-pulse">
                            <span className="text-[10px] font-mono text-indigo-300 font-bold bg-black/80 px-2.5 py-1 rounded-md border border-indigo-500/20">
                              Reels 9:16 Crop Zone
                            </span>
                          </div>
                        ) : format === "square" ? (
                          <div className="h-full aspect-square border-2 border-dashed border-indigo-400 bg-indigo-500/10 flex items-center justify-center shadow-[0_0_50px_rgba(99,102,241,0.25)] animate-pulse">
                            <span className="text-[10px] font-mono text-indigo-300 font-bold bg-black/80 px-2.5 py-1 rounded-md border border-indigo-500/20">
                              Square 1:1 Crop Zone
                            </span>
                          </div>
                        ) : (
                          <div className="w-full h-full border-2 border-dashed border-indigo-400 bg-indigo-500/5 flex items-center justify-center">
                            <span className="text-[10px] font-mono text-indigo-300 font-bold bg-black/80 px-2.5 py-1 rounded-md border border-indigo-500/20">
                              Landscape 16:9 Zone
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Interactive Timeline Range Picker */}
                  {meta ? (
                    <div className="space-y-4 pt-2">
                      {/* Visual Timeline Bar with S/E markers + playhead */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs font-mono mb-1">
                          <span className="text-white/50 font-semibold flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse inline-block" />
                            Timeline
                            <span className="text-cyan-400 ml-1">{formatDuration(currentTime)}</span>
                          </span>
                          <span className="text-white/40">
                            <span className="text-emerald-400">{formatDuration(manualStartSec)}</span>
                            {" → "}
                            <span className="text-rose-400">{formatDuration(manualEndSec)}</span>
                            <span className="text-indigo-400 ml-1.5 font-bold">({manualEndSec - manualStartSec}s)</span>
                          </span>
                        </div>

                        {/* Clickable timeline track */}
                        <div
                          className="relative h-4 bg-surface-800 rounded-full border border-surface-700/40 cursor-pointer my-4 flex items-center select-none"
                          onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const pct = (e.clientX - rect.left) / rect.width;
                            const targetSec = Math.round(pct * meta.duration);
                            // Move whichever marker (S or E) is closer to click
                            const distToStart = Math.abs(targetSec - manualStartSec);
                            const distToEnd = Math.abs(targetSec - manualEndSec);
                            if (distToStart <= distToEnd) {
                              setManualStartSec(Math.min(targetSec, manualEndSec - 1));
                            } else {
                              setManualEndSec(Math.max(targetSec, manualStartSec + 1));
                            }
                            seekToTime(targetSec);
                          }}
                        >
                          {/* Selected range fill */}
                          <div
                            className="absolute top-0 bottom-0 rounded-full bg-gradient-to-r from-emerald-500/30 to-rose-500/30 border-l-2 border-l-emerald-500 border-r-2 border-r-rose-500"
                            style={{
                              left: `${(manualStartSec / meta.duration) * 100}%`,
                              width: `${((manualEndSec - manualStartSec) / meta.duration) * 100}%`,
                            }}
                          />

                          {/* Start Marker Pin (S - Green) */}
                          <div
                            className="absolute top-[-5px] bottom-[-5px] w-[2px] bg-emerald-500 z-10"
                            style={{ left: `${(manualStartSec / meta.duration) * 100}%` }}
                          >
                            <div className="absolute top-[-13px] left-[-7px] w-4 h-4 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center shadow-lg shadow-emerald-500/50">
                              <span className="text-[7px] font-black text-white font-mono">S</span>
                            </div>
                          </div>

                          {/* End Marker Pin (E - Red) */}
                          <div
                            className="absolute top-[-5px] bottom-[-5px] w-[2px] bg-rose-500 z-10"
                            style={{ left: `${(manualEndSec / meta.duration) * 100}%` }}
                          >
                            <div className="absolute top-[-13px] left-[-7px] w-4 h-4 rounded-full bg-rose-500 border-2 border-white flex items-center justify-center shadow-lg shadow-rose-500/50">
                              <span className="text-[7px] font-black text-white font-mono">E</span>
                            </div>
                          </div>

                          {/* Cyan Playhead (current video position) */}
                          {meta.duration > 0 && (
                            <div
                              className="absolute top-[-7px] bottom-[-7px] w-[2px] bg-cyan-400 z-20 pointer-events-none transition-none"
                              style={{ left: `${Math.min((currentTime / meta.duration) * 100, 100)}%` }}
                            >
                              {/* Diamond head */}
                              <div className="absolute top-[-4px] left-[-4px] w-2.5 h-2.5 rotate-45 bg-cyan-400 border border-white shadow-md shadow-cyan-400/60" />
                            </div>
                          )}

                          {/* Duration label inside the selected region */}
                          {((manualEndSec - manualStartSec) / meta.duration) > 0.1 && (
                            <div
                              className="absolute top-0 bottom-0 flex items-center justify-center pointer-events-none"
                              style={{
                                left: `${(manualStartSec / meta.duration) * 100}%`,
                                width: `${((manualEndSec - manualStartSec) / meta.duration) * 100}%`,
                              }}
                            >
                              <span className="text-[9px] font-mono font-bold text-white/60 bg-black/50 px-1 rounded">
                                {manualEndSec - manualStartSec}s
                              </span>
                            </div>
                          )}
                        </div>
                        <p className="text-[10px] text-white/25 font-mono">
                          Klik timeline untuk pindah marker terdekat • Putar video lalu tekan 📍 untuk tandai
                        </p>
                      </div>

                      {/* Draggable Sliders for Start & End */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1 bg-surface-900/40 p-2.5 rounded-xl border border-white/5">
                          <div className="flex items-center justify-between text-[11px] font-mono">
                            <span className="text-white/40 font-semibold uppercase tracking-wider text-[9px]">Start Marker</span>
                            <span className="text-emerald-400 font-bold">{formatDuration(manualStartSec)}</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={meta.duration}
                            value={manualStartSec}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setManualStartSec(val);
                              seekToTime(val);
                              if (val >= manualEndSec) {
                                setManualEndSec(Math.min(meta.duration, val + 1));
                              }
                            }}
                            className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-white/10 rounded-lg appearance-none"
                          />
                        </div>

                        <div className="space-y-1 bg-surface-900/40 p-2.5 rounded-xl border border-white/5">
                          <div className="flex items-center justify-between text-[11px] font-mono">
                            <span className="text-white/40 font-semibold uppercase tracking-wider text-[9px]">End Marker</span>
                            <span className="text-rose-400 font-bold">{formatDuration(manualEndSec)}</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={meta.duration}
                            value={manualEndSec}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setManualEndSec(val);
                              seekToTime(val);
                              if (val <= manualStartSec) {
                                setManualStartSec(Math.max(0, val - 1));
                              }
                            }}
                            className="w-full accent-rose-500 cursor-pointer h-1.5 bg-white/10 rounded-lg appearance-none"
                          />
                        </div>
                      </div>

                      {/* Inline Compact Action Row */}
                      <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-surface-900/60 border border-white/5 p-3 rounded-2xl animate-scale-up">
                        <div className="flex gap-2 w-full md:w-auto">
                          <button
                            type="button"
                            onClick={() => {
                              const t = Math.floor(currentTime);
                              setManualStartSec(t);
                              if (t >= manualEndSec) setManualEndSec(Math.min(meta.duration, t + 1));
                            }}
                            className="flex-1 md:flex-initial text-xs bg-emerald-500/10 hover:bg-emerald-500/25 active:scale-95 text-emerald-400 border border-emerald-500/25 px-3 py-2 rounded-xl font-bold flex items-center justify-center gap-1.5 min-w-[120px]"
                            title={`Tandai waktu saat ini (${formatDuration(currentTime)}) sebagai Start`}
                          >
                            📍 Mark Start
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const t = Math.floor(currentTime);
                              setManualEndSec(t);
                              if (t <= manualStartSec) setManualStartSec(Math.max(0, t - 1));
                            }}
                            className="flex-1 md:flex-initial text-xs bg-rose-500/10 hover:bg-rose-500/25 active:scale-95 text-rose-400 border border-rose-500/25 px-3 py-2 rounded-xl font-bold flex items-center justify-center gap-1.5 min-w-[120px]"
                            title={`Tandai waktu saat ini (${formatDuration(currentTime)}) sebagai End`}
                          >
                            📍 Mark End
                          </button>
                        </div>

                        <div className="text-xs font-mono text-center md:text-left">
                          <span className="text-white/40">Range:</span>{" "}
                          <span className="text-emerald-400 font-bold">{formatDuration(manualStartSec)}</span>{" "}
                          ➔{" "}
                          <span className="text-rose-400 font-bold">{formatDuration(manualEndSec)}</span>{" "}
                          <span className="text-indigo-400 font-bold">({manualEndSec - manualStartSec}s)</span>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            addManualClipFromSec(manualStartSec, manualEndSec);
                          }}
                          className="w-full md:w-auto bg-indigo-500 hover:bg-indigo-600 text-pure-white px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow shadow-indigo-500/15"
                        >
                          <Plus size={14} /> Add Clip Timeline
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-white/35 text-center py-2 font-mono">
                      Loading timeline metadata sliders...
                    </div>
                  )}
                </div>

                {/* Right side: Added Clips List and Manual typing inputs (col-span 1) */}
                <div className="lg:col-span-1 self-start bg-surface-900/60 border border-white/5 p-4 rounded-2xl flex flex-col space-y-4">
                  <div className="space-y-4">
                    <p className="text-[11px] font-mono text-indigo-400 uppercase tracking-widest font-bold flex items-center justify-between border-b border-white/5 pb-2">
                      <span>Clip List Manager</span>
                      <span className="bg-indigo-500/10 px-2 py-0.5 rounded-full text-[10px]">
                        {manualClips.length} added
                      </span>
                    </p>

                    {/* Manual Cut Inputs (typed) */}
                    <div className="space-y-3 bg-surface-800/40 p-3 rounded-xl border border-white/5">
                      <p className="text-[10px] font-mono text-white/40 uppercase">Add Timestamp Manually</p>
                      <div className="flex gap-2 items-end">
                        <div className="flex-1 space-y-1">
                          <label className="text-[9px] text-white/40 uppercase font-mono">Start (MM:SS)</label>
                          <input
                            value={manualStart}
                            onChange={(e) => setManualStart(e.target.value)}
                            placeholder="00:00"
                            className="w-full bg-surface-900 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500/40 font-mono"
                          />
                        </div>
                        <div className="flex-1 space-y-1">
                          <label className="text-[9px] text-white/40 uppercase font-mono">End (MM:SS)</label>
                          <input
                            value={manualEnd}
                            onChange={(e) => setManualEnd(e.target.value)}
                            placeholder="01:00"
                            className="w-full bg-surface-900 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500/40 font-mono"
                          />
                        </div>
                        <button
                          onClick={addManualClip}
                          className="bg-indigo-500 hover:bg-indigo-600 text-pure-white px-2.5 py-2.5 rounded-lg transition-all flex items-center justify-center"
                          title="Add Custom Clip"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Added clips scrolling list */}
                    <div className="space-y-2">
                      <p className="text-[10px] font-mono text-white/40 uppercase">Clips Added to Queue</p>
                      {manualClips.length > 0 ? (
                        <div className="space-y-1.5 max-h-[280px] overflow-y-auto scrollbar-premium pr-1">
                          {manualClips.map((c, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between bg-surface-800/80 rounded-xl px-3 py-2 border border-white/5 hover:border-white/10 transition-all group"
                            >
                              <div className="flex flex-col">
                                <span className="text-[11px] text-white/80 font-mono font-bold">
                                  Clip #{i + 1}
                                </span>
                                <span className="text-[10px] text-white/40 font-mono mt-0.5">
                                  {formatDuration(c.start)} ➔ {formatDuration(c.end)} ({c.end - c.start}s)
                                </span>
                              </div>
                              <button
                                onClick={() => setManualClips((prev) => prev.filter((_, j) => j !== i))}
                                className="text-white/20 hover:text-red-400 transition-colors p-1"
                                title="Remove clip"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8 border border-dashed border-white/5 rounded-xl text-xs text-white/20 font-mono">
                          No clips added yet.<br />Use timeline or type above.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Clear all action */}
                  {manualClips.length > 0 && (
                    <div className="flex justify-end pt-2 border-t border-white/5">
                      <button
                        onClick={() => setManualClips([])}
                        className="text-[10px] text-red-400/60 hover:text-red-400 transition-colors font-bold font-mono flex items-center gap-1"
                      >
                        <Trash2 size={10} /> Clear all manual clips
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}


          {/* 3. Empty State (no history) */}
          {history.length === 0 && (!job || job.status === "done" || job.status === "error") && !(mode === "manual" && url) && (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-6 max-w-lg mx-auto animate-scale-up">
              {/* Premium Animated SVG illustration */}
              <div className="relative w-36 h-36 flex items-center justify-center">
                {/* Orbit concentric circles */}
                <div className="absolute inset-0 rounded-full border border-dashed border-indigo-500/25 animate-spin-slow" />
                <div className="absolute inset-3 rounded-full border border-indigo-500/10" />
                <div className="absolute inset-8 rounded-full border border-dashed border-pink-500/15 animate-spin-slow" style={{ animationDirection: "reverse" }} />
                
                {/* Glowing neon center circle */}
                <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30 float-slow border border-white/10">
                  <Scissors className="text-pure-white w-7 h-7" />
                </div>

                {/* Floating particle markers */}
                <div className="absolute top-2 right-4 w-3 h-3 rounded-full bg-pink-500/40 blur-[2px] float-slow-delay" />
                <div className="absolute bottom-4 left-2 w-2 h-2 rounded-full bg-indigo-400/50 blur-[1px] float-slow" />
              </div>

              <div className="space-y-2">
                <h3 className="font-heading text-2xl font-extrabold text-white tracking-tight bg-gradient-to-r from-indigo-400 via-violet-400 to-pink-500 bg-clip-text text-transparent">Ready to Forge Viral Clips</h3>
                <p className="text-sm text-white/40 leading-relaxed">
                  Masukkan URL video YouTube di panel kontrol sebelah kiri untuk mengekstrak momen terbaik menjadi video vertikal Reels/TikTok.
                </p>
              </div>

              {/* Grid bullet features */}
              <div className="grid grid-cols-2 gap-3 w-full text-left pt-4">
                <div className="p-3 bg-white/[0.01] border border-white/5 rounded-xl text-xs flex gap-2 items-start">
                  <Sparkles size={14} className="text-indigo-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-white/80">AI Suggested Moments</h4>
                    <p className="text-white/40 text-[10px] mt-0.5">Membaca transkrip dan menandai hook viral.</p>
                  </div>
                </div>
                <div className="p-3 bg-white/[0.01] border border-white/5 rounded-xl text-xs flex gap-2 items-start">
                  <Compass size={14} className="text-indigo-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-white/80">Gaussian Background Blur</h4>
                    <p className="text-white/40 text-[10px] mt-0.5">Mempercantik video 16:9 menjadi 9:16 vertikal.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 4. Generation History List */}
          {history.length > 0 && (
            <div className="space-y-8">
              {history.map((jobItem) => (
                <div key={jobItem.jobId} className="space-y-4 bg-white/[0.01] p-5 lg:p-6 rounded-3xl border border-white/5 shadow-xl">
                  {/* Job Header Group */}
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between bg-surface-800 border border-white/5 p-4 rounded-2xl gap-3">
                    <div className="min-w-0 flex-1 flex gap-3 items-center">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500/10 to-violet-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 flex-shrink-0">
                        <Video size={18} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-sm text-white truncate max-w-xl">{jobItem.video_title || "Untitled Video"}</h3>
                        <p className="text-[11px] text-white/40 mt-0.5 font-mono">
                          {jobItem.clips.length} clips generated · {jobItem.resolution || "Unknown resolution"}
                          {jobItem.quality_note && <span className="text-indigo-400/80 ml-2 font-semibold">({jobItem.quality_note})</span>}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteJob(jobItem.jobId)}
                      title="Delete all files in this video group from disk"
                      className="flex items-center gap-1.5 text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 px-3.5 py-2 rounded-xl border border-red-500/25 transition-all font-semibold self-end md:self-auto"
                    >
                      <Trash2 size={13} /> Delete Group
                    </button>
                  </div>

                  {/* Responsive grid of clips */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
                    {jobItem.clips.map((clip) => (
                      <ClipCard
                        key={clip.index}
                        clip={clip}
                        jobId={jobItem.jobId}
                        videoUrl={(jobItem as any).video_url || url}
                        geminiApiKey={geminiApiKey}
                        openaiApiKey={openaiApiKey}
                        openaiBaseUrl={openaiBaseUrl}
                        openaiChatModel={openaiChatModel}
                        onDelete={handleDeleteClip}
                        format={jobItem.format || getFormatFromResolution(jobItem.resolution)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* DYNAMIC INFORMATION FLOW MODAL */}
      {infoOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fadeIn">
          <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-surface-800 border border-white/10 rounded-3xl p-6 lg:p-8 shadow-2xl flex flex-col scrollbar-premium text-white">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 text-indigo-400">
                  <Info size={16} />
                </div>
                <div>
                  <h2 className="font-heading text-lg font-bold text-white">How ClipForge Works</h2>
                  <p className="text-xs text-white/40 mt-0.5">Learn about the video processing pipeline and AI models</p>
                </div>
              </div>
              <button
                onClick={() => setInfoOpen(false)}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors font-bold"
              >
                ✕
              </button>
            </div>

            {/* Pipeline Flowchart Section */}
            <div className="py-6">
              <h3 className="text-xs font-mono text-indigo-400 uppercase tracking-widest mb-6 text-center font-bold">Interactive Processing Pipeline</h3>
              
              {/* SVG Dotted Line Flowchart */}
              <div className="relative flex flex-col lg:flex-row justify-between items-center gap-6 lg:gap-2 px-4 py-8 bg-surface-900/60 rounded-2xl border border-white/5">
                
                {/* Step 1: URL Input */}
                <div className="flex flex-col items-center text-center max-w-[120px] group relative cursor-help">
                  <div className="w-12 h-12 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-all duration-300 shadow shadow-indigo-500/5 group-hover:border-indigo-500/50">
                    <ExternalLink size={18} />
                  </div>
                  <span className="text-xs font-bold text-white/80 mt-2 block">1. Paste URL</span>
                  <span className="text-[9px] text-white/40 mt-0.5 block">Pasted YouTube link.</span>
                  {/* Tooltip detail */}
                  <div className="absolute bottom-full mb-2 hidden group-hover:block w-48 p-2.5 bg-surface-700 text-[10px] text-white/80 rounded-xl shadow-lg border border-white/10 text-left z-30 leading-normal">
                    User memasukkan link YouTube. Backend memicu pembacaan metadata video seperti durasi, judul, dan thumbnail secara real-time.
                  </div>
                </div>

                {/* Connector line 1 */}
                <div className="hidden lg:block flex-1 h-[2px] min-w-[30px] relative">
                  <svg className="absolute w-full h-[8px] top-[-3px] left-0 overflow-visible" fill="none">
                    <path id="path1" d="M 0 4 L 80 4" stroke="var(--brand-500)" strokeWidth="2" strokeDasharray="5,5" className="animate-flow-line" opacity="0.6" />
                    <circle r="3" fill="#00ffff" style={{ filter: "drop-shadow(0 0 3px #00ffff)" }}>
                      <animateMotion dur="2.4s" repeatCount="indefinite" path="M 0 4 L 80 4" />
                    </circle>
                  </svg>
                </div>

                {/* Step 2: yt-dlp download */}
                <div className="flex flex-col items-center text-center max-w-[120px] group relative cursor-help">
                  <div className="w-12 h-12 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-all duration-300 shadow shadow-indigo-500/5 group-hover:border-indigo-500/50">
                    <Download size={18} />
                  </div>
                  <span className="text-xs font-bold text-white/80 mt-2 block">2. Fetch Audio</span>
                  <span className="text-[9px] text-white/40 mt-0.5 block">Audio file downloaded.</span>
                  {/* Tooltip detail */}
                  <div className="absolute bottom-full mb-2 hidden group-hover:block w-48 p-2.5 bg-surface-700 text-[10px] text-white/80 rounded-xl shadow-lg border border-white/10 text-left z-30 leading-normal">
                    Mengunduh file audio/video berkualitas tinggi langsung menggunakan modul <strong>yt-dlp</strong> di komputer backend lokal Anda.
                  </div>
                </div>

                {/* Connector line 2 */}
                <div className="hidden lg:block flex-1 h-[2px] min-w-[30px] relative">
                  <svg className="absolute w-full h-[8px] top-[-3px] left-0 overflow-visible" fill="none">
                    <path id="path2" d="M 0 4 L 80 4" stroke="var(--brand-500)" strokeWidth="2" strokeDasharray="5,5" className="animate-flow-line" opacity="0.6" />
                    <circle r="3" fill="#ec4899" style={{ filter: "drop-shadow(0 0 3px #ec4899)" }}>
                      <animateMotion dur="2.0s" repeatCount="indefinite" path="M 0 4 L 80 4" />
                    </circle>
                  </svg>
                </div>

                {/* Step 3: Whisper Transcribe */}
                <div className="flex flex-col items-center text-center max-w-[120px] group relative cursor-help">
                  <div className="w-12 h-12 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-all duration-300 shadow shadow-indigo-500/5 group-hover:border-indigo-500/50">
                    <FileText size={18} />
                  </div>
                  <span className="text-xs font-bold text-white/80 mt-2 block">3. Transcribe</span>
                  <span className="text-[9px] text-white/40 mt-0.5 block">Speech-to-text conversion.</span>
                  {/* Tooltip detail */}
                  <div className="absolute bottom-full mb-2 hidden group-hover:block w-48 p-2.5 bg-surface-700 text-[10px] text-white/80 rounded-xl shadow-lg border border-white/10 text-left z-30 leading-normal">
                    Audio dikirim ke sistem untuk ditranskripsi menjadi teks naskah lengkap yang dilengkapi data penanda waktu di setiap katanya.
                  </div>
                </div>

                {/* Connector line 3 */}
                <div className="hidden lg:block flex-1 h-[2px] min-w-[30px] relative">
                  <svg className="absolute w-full h-[8px] top-[-3px] left-0 overflow-visible" fill="none">
                    <path id="path3" d="M 0 4 L 80 4" stroke="var(--brand-500)" strokeWidth="2" strokeDasharray="5,5" className="animate-flow-line" opacity="0.6" />
                    <circle r="3" fill="#facc15" style={{ filter: "drop-shadow(0 0 3px #facc15)" }}>
                      <animateMotion dur="2.2s" repeatCount="indefinite" path="M 0 4 L 80 4" />
                    </circle>
                  </svg>
                </div>

                {/* Step 4: AI Analysis */}
                <div className="flex flex-col items-center text-center max-w-[120px] group relative cursor-help">
                  <div className="w-12 h-12 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-all duration-300 shadow shadow-indigo-500/5 group-hover:border-indigo-500/50">
                    <Sparkles size={18} />
                  </div>
                  <span className="text-xs font-bold text-white/80 mt-2 block">4. AI Analysis</span>
                  <span className="text-[9px] text-white/40 mt-0.5 block">Gemini/GPT viral analysis.</span>
                  {/* Tooltip detail */}
                  <div className="absolute bottom-full mb-2 hidden group-hover:block w-48 p-2.5 bg-surface-700 text-[10px] text-white/80 rounded-xl shadow-lg border border-white/10 text-left z-30 leading-normal">
                    AI membaca naskah dan mengidentifikasi segmen percakapan paling menarik. Menghitung durasi ideal, hook kalimat, skor, dan alasan viralitas.
                  </div>
                </div>

                {/* Connector line 4 */}
                <div className="hidden lg:block flex-1 h-[2px] min-w-[30px] relative">
                  <svg className="absolute w-full h-[8px] top-[-3px] left-0 overflow-visible" fill="none">
                    <path id="path4" d="M 0 4 L 80 4" stroke="var(--brand-500)" strokeWidth="2" strokeDasharray="5,5" className="animate-flow-line" opacity="0.6" />
                    <circle r="3" fill="#a855f7" style={{ filter: "drop-shadow(0 0 3px #a855f7)" }}>
                      <animateMotion dur="1.8s" repeatCount="indefinite" path="M 0 4 L 80 4" />
                    </circle>
                  </svg>
                </div>

                {/* Step 5: FFmpeg render */}
                <div className="flex flex-col items-center text-center max-w-[120px] group relative cursor-help">
                  <div className="w-12 h-12 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-all duration-300 shadow shadow-indigo-500/5 group-hover:border-indigo-500/50">
                    <Scissors size={18} />
                  </div>
                  <span className="text-xs font-bold text-white/80 mt-2 block">5. Render</span>
                  <span className="text-[9px] text-white/40 mt-0.5 block">Cuts & background blur.</span>
                  {/* Tooltip detail */}
                  <div className="absolute bottom-full mb-2 hidden group-hover:block w-48 p-2.5 bg-surface-700 text-[10px] text-white/80 rounded-xl shadow-lg border border-white/10 text-left z-30 leading-normal">
                    Menggunakan program <strong>FFmpeg</strong> lokal untuk memotong video, melakukan resize vertikal (crop) otomatis, dan memburamkan latar belakang agar pas ke format Reels 9:16.
                  </div>
                </div>

                {/* Connector line 5 */}
                <div className="hidden lg:block flex-1 h-[2px] min-w-[30px] relative">
                  <svg className="absolute w-full h-[8px] top-[-3px] left-0 overflow-visible" fill="none">
                    <path id="path5" d="M 0 4 L 80 4" stroke="var(--brand-500)" strokeWidth="2" strokeDasharray="5,5" className="animate-flow-line" opacity="0.6" />
                    <circle r="3" fill="#10b981" style={{ filter: "drop-shadow(0 0 3px #10b981)" }}>
                      <animateMotion dur="2.6s" repeatCount="indefinite" path="M 0 4 L 80 4" />
                    </circle>
                  </svg>
                </div>

                {/* Step 6: Clip Ready */}
                <div className="flex flex-col items-center text-center max-w-[120px] group relative cursor-help">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-indigo-500 to-violet-600 flex items-center justify-center text-pure-white group-hover:scale-110 transition-all duration-300 shadow shadow-indigo-500/20 border border-white/10">
                    <CheckCircle size={18} />
                  </div>
                  <span className="text-xs font-bold text-white/80 mt-2 block">6. Viral Clip</span>
                  <span className="text-[9px] text-white/40 mt-0.5 block">Download & post!</span>
                  {/* Tooltip detail */}
                  <div className="absolute bottom-full mb-2 hidden group-hover:block w-48 p-2.5 bg-surface-700 text-[10px] text-white/80 rounded-xl shadow-lg border border-white/10 text-left z-30 leading-normal">
                    Klip video dan file subtitle (.srt) berhasil dibuat! Anda bisa mengunduhnya langsung ke galeri komputer Anda untuk diposting ke media sosial.
                  </div>
                </div>

              </div>
              <p className="text-[10px] text-white/35 text-center mt-3 italic">💡 Arahkan kursor Anda pada setiap langkah di atas untuk penjelasan detail teknis.</p>
            </div>

            {/* Feature explanations */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 flex-1">
              <div className="p-4 bg-surface-900/40 rounded-2xl border border-white/5 space-y-2">
                <h4 className="text-xs font-mono font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Sparkles size={14} /> AI Suggested Mode
                </h4>
                <p className="text-xs text-white/50 leading-relaxed">
                  Dalam mode ini, transkrip teks percakapan dibaca oleh AI (dinoiki). AI menganalisis ketegangan cerita, keseruan komedi, atau klimaks pembicaraan untuk menentukan potongan <strong>Hook Terkuat</strong>. Sistem memberi peringkat pada klip potensial berdasarkan nilai viralitas.
                </p>
              </div>

              <div className="p-4 bg-surface-900/40 rounded-2xl border border-white/5 space-y-2">
                <h4 className="text-xs font-mono font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Sliders size={14} /> Auto Tracking & Blur
                </h4>
                <p className="text-xs text-white/50 leading-relaxed">
                  Saat memotong video 16:9 menjadi 9:16 vertikal, jika <strong>Auto Tracking</strong> dicentang, AI memusatkan visual video ke objek pembicara aktif agar tidak terpotong ke samping. Ditambah efek <strong>Gaussian Blur</strong> pada background untuk menyembunyikan kekosongan bingkai.
                </p>
              </div>

              <div className="p-4 bg-surface-900/40 rounded-2xl border border-white/5 space-y-2">
                <h4 className="text-xs font-mono font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Key size={14} /> API Key Profiles
                </h4>
                <p className="text-xs text-white/50 leading-relaxed">
                  Anda dapat menyimpan beberapa profil API Key (Gemini API & OpenAI API) langsung dari browser Anda secara aman. Data ini disimpan sepenuhnya di <code>localStorage</code> komputer Anda, tidak dikirim ke pihak luar lain, dan disembunyikan dengan aman untuk menghindari kebocoran.
                </p>
              </div>

              <div className="p-4 bg-surface-900/40 rounded-2xl border border-white/5 space-y-2">
                <h4 className="text-xs font-mono font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Clock size={14} /> Manual Timeline Cutting
                </h4>
                <p className="text-xs text-white/50 leading-relaxed">
                  Bagi editor yang ingin kontrol manual penuh, pilih mode <strong>Manual</strong>. Anda dapat menentukan sendiri waktu mulai (start) dan selesai (end) dengan format MM:SS untuk memotong adegan tertentu, lalu mengekstrak klip dalam hitungan detik.
                </p>
              </div>
            </div>

            {/* Close footer */}
            <div className="border-t border-white/5 pt-4 mt-6 flex justify-end">
              <button
                onClick={() => setInfoOpen(false)}
                className="bg-indigo-500 hover:bg-indigo-600 text-pure-white px-5 py-2.5 rounded-xl text-xs font-bold transition-all"
              >
                Paham & Tutup
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}

function ClipCard({
  clip,
  jobId,
  videoUrl,
  geminiApiKey,
  openaiApiKey,
  openaiBaseUrl,
  openaiChatModel,
  onDelete,
  format
}: {
  clip: Clip;
  jobId: string;
  videoUrl: string;
  geminiApiKey: string;
  openaiApiKey: string;
  openaiBaseUrl: string;
  openaiChatModel: string;
  onDelete: (jobId: string, clipIndex: number, clipUrl: string, srtUrl: string) => void;
  format: "landscape" | "reels" | "square";
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [socialPost, setSocialPost] = useState<{ title: string; description: string; hashtags: string } | null>(null);
  const [socialLoading, setSocialLoading] = useState(false);
  const [socialExpanded, setSocialExpanded] = useState(false);
  const [socialCopied, setSocialCopied] = useState(false);

  const generateSocial = async () => {
    if (socialPost) {
      setSocialExpanded(!socialExpanded);
      return;
    }
    
    setSocialLoading(true);
    setSocialExpanded(true);
    try {
      const promptText = `Clip Title: ${clip.title}. Hook: ${clip.hook || "No hook provided."}`;
      const res = await fetch("http://localhost:8000/api/transcripts/generate-social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clip_transcript: promptText,
          provider: (geminiApiKey || (!geminiApiKey && !openaiApiKey)) ? "gemini" : "openai",
          gemini_api_key: geminiApiKey.trim() || undefined,
          openai_api_key: openaiApiKey.trim() || undefined,
          openai_base_url: openaiBaseUrl.trim() || undefined,
          openai_chat_model: openaiChatModel.trim() || undefined,
        })
      });
      if (res.ok) {
        const data = await res.json();
        setSocialPost(data);
      }
    } catch (e) {
      console.error("Failed to generate social post:", e);
    } finally {
      setSocialLoading(false);
    }
  };

  const handleCopySocial = () => {
    if (!socialPost) return;
    const textToCopy = `${socialPost.title}\n\n${socialPost.description}\n\n${socialPost.hashtags}`;
    navigator.clipboard.writeText(textToCopy);
    setSocialCopied(true);
    setTimeout(() => setSocialCopied(false), 2000);
  };

  const handleFullscreen = () => {
    if (videoRef.current) {
      if (videoRef.current.requestFullscreen) {
        videoRef.current.requestFullscreen();
      } else if ((videoRef.current as any).webkitRequestFullscreen) {
        (videoRef.current as any).webkitRequestFullscreen();
      } else if ((videoRef.current as any).msRequestFullscreen) {
        (videoRef.current as any).msRequestFullscreen();
      }
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(clip.clip_url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div 
      className="glass-card rounded-2xl overflow-hidden flex flex-col justify-between border border-white/5 group relative transition-all duration-300 hover:border-indigo-500/40 hover:shadow-[0_8px_32px_rgba(99,102,241,0.15)]"
      onMouseEnter={() => {
        if (videoRef.current) {
          videoRef.current.play().catch(() => {});
        }
      }}
      onMouseLeave={() => {
        if (videoRef.current) {
          videoRef.current.pause();
        }
      }}
    >
      {/* Background glow when hovering */}
      <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/5 to-pink-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
      
      <div className="p-5 flex-1 flex flex-col justify-between relative z-10">
        <div>
          {/* Badge score & duration metadata */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-[10px] font-bold font-mono text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">
                  #{clip.index + 1}
                </span>
                <span className="text-[10px] text-white/40 font-mono flex items-center gap-1">
                  <Clock size={10} />
                  {formatDuration(clip.start)} → {formatDuration(clip.end)} ({clip.duration}s)
                </span>
              </div>
              <h4 className="font-bold text-sm text-white/95 line-clamp-2 leading-snug group-hover:text-indigo-300 transition-colors" title={clip.title}>
                {clip.title}
              </h4>
            </div>
            {clip.score > 0 && (
              <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-surface-800/80 border border-white/5 flex flex-col items-center justify-center shadow-inner relative overflow-hidden group-hover:border-indigo-500/30 transition-colors">
                <span className="text-xs font-black text-indigo-400 flex items-center gap-0.5">
                  {clip.score}
                  {clip.score >= 8 && <Sparkles size={8} className="text-pink-400 animate-pulse" />}
                </span>
                <span className="text-[8px] text-white/30 uppercase tracking-wider font-mono font-bold">Score</span>
              </div>
            )}
          </div>

          {clip.hook && (
            <div className="mb-3.5 bg-white/[0.01] border border-white/[0.03] p-2.5 rounded-xl">
              <p className="text-[11px] text-white/50 italic leading-relaxed line-clamp-2">
                &quot;{clip.hook}&quot;
              </p>
            </div>
          )}

          {clip.summary && (
            <div className="mb-3.5 bg-indigo-500/5 border border-indigo-500/10 p-2.5 rounded-xl">
              <span className="text-[9px] font-mono text-indigo-300 uppercase font-semibold flex items-center gap-1">
                📝 Scene Summary
              </span>
              <p className="text-[10.5px] text-white/70 leading-relaxed mt-1 whitespace-pre-line">
                {clip.summary}
              </p>
            </div>
          )}

          {/* Video Player */}
          <div className={`mb-4 relative rounded-xl overflow-hidden border border-white/10 shadow-lg bg-black/60 group/player ${
            format === "reels" ? "aspect-[9/16] max-w-[260px] mx-auto w-full" :
            format === "square" ? "aspect-square max-w-[320px] mx-auto w-full" :
            "aspect-video w-full"
          }`}>
            <video
              ref={videoRef}
              src={clip.clip_url}
              controls
              muted
              loop
              preload="metadata"
              className="w-full h-full object-contain"
            />
          </div>
        </div>

        {/* Action Controls */}
        <div className="space-y-2 mt-auto pt-1">
          <a
            href={clip.clip_url}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-1.5 text-xs bg-indigo-500 hover:bg-indigo-600 text-pure-white py-2.5 rounded-xl transition-all font-bold shadow-md shadow-indigo-500/10 hover:shadow-indigo-500/20"
          >
            <Download size={13} /> Download Video
          </a>
          
          <div className="flex gap-1.5">
            {clip.srt_url && (
              <a
                href={clip.srt_url}
                target="_blank"
                rel="noopener noreferrer"
                title="Download SRT Subtitle file"
                className="flex-1 flex items-center justify-center gap-1 text-[10px] bg-surface-700 hover:bg-surface-600 text-white/80 py-2 rounded-lg border border-white/5 transition-all font-semibold"
              >
                <FileText size={11} /> SRT
              </a>
            )}
            <button
              onClick={handleFullscreen}
              title="Fullscreen Video"
              className="flex-1 flex items-center justify-center text-[10px] bg-surface-700 hover:bg-surface-600 text-white/80 py-2 rounded-lg border border-white/5 transition-all"
            >
              <Maximize size={11} />
            </button>
            <button
              onClick={handleCopy}
              title={copied ? "Copied!" : "Copy Link"}
              className={`flex-1 flex items-center justify-center text-[10px] py-2 rounded-lg border border-white/5 transition-all ${
                copied ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/30" : "bg-surface-700 hover:bg-surface-600 text-white/80"
              }`}
            >
              {copied ? <Check size={11} /> : <Copy size={11} />}
            </button>
            <button
              onClick={generateSocial}
              title="Generate AI Social Post Copy"
              className={`flex-1 flex items-center justify-center text-[10px] py-2 rounded-lg border border-white/5 transition-all ${
                socialExpanded ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/30" : "bg-surface-700 hover:bg-surface-600 text-white/80"
              }`}
            >
              <Sparkles size={11} className={socialLoading ? "animate-spin text-pink-400" : ""} />
            </button>
            <button
              onClick={() => onDelete(jobId, clip.index, clip.clip_url, clip.srt_url)}
              title="Delete clip from storage"
              className="flex-1 flex items-center justify-center text-[10px] bg-red-500/10 hover:bg-red-500/20 text-red-400 py-2 rounded-lg border border-red-500/10 transition-all"
            >
              <Trash2 size={11} />
            </button>
            {clip.reason && (
              <button
                onClick={() => setExpanded(!expanded)}
                title="AI Viral Reason Analysis"
                className={`flex-1 flex items-center justify-center text-[10px] py-2 rounded-lg border border-white/5 transition-all ${
                  expanded ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/30" : "bg-surface-700 hover:bg-surface-600 text-white/80"
                }`}
              >
                <ChevronDown size={11} className={`transition-transform duration-300 ${expanded ? "rotate-180" : ""}`} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Slide down AI reasoning details */}
      {expanded && clip.reason && (
        <div className="px-5 pb-5 border-t border-white/5 pt-4 bg-indigo-950/20 relative z-10">
          <div className="space-y-1">
            <span className="text-[9px] font-bold font-mono text-indigo-400 uppercase tracking-widest block">AI Viral Analysis</span>
            <p className="text-xs text-white/50 leading-relaxed font-normal">
              {clip.reason}
            </p>
          </div>
        </div>
      )}

      {/* Slide down AI Social post copy */}
      {socialExpanded && (
        <div className="px-5 pb-5 border-t border-white/5 pt-4 bg-surface-900/35 relative z-10 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold font-mono text-pink-400 uppercase tracking-widest block">AI Social Post Copy</span>
            {socialPost && (
              <button
                onClick={handleCopySocial}
                className="text-[9px] text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/25"
              >
                {socialCopied ? <Check size={8} /> : <Copy size={8} />}
                {socialCopied ? "Copied" : "Copy All"}
              </button>
            )}
          </div>
          {socialLoading ? (
            <div className="flex items-center gap-1.5 text-xs text-white/40 justify-center py-2">
              <Loader2 size={12} className="animate-spin text-indigo-400" />
              Writing viral copy...
            </div>
          ) : socialPost ? (
            <div className="space-y-2 text-xs leading-normal font-sans text-white/70">
              <div>
                <strong className="text-white block text-[10px] uppercase tracking-wider font-mono opacity-40">Viral Title:</strong>
                <p className="bg-black/20 p-2 rounded border border-white/5 font-semibold text-white/90 mt-0.5">{socialPost.title}</p>
              </div>
              <div>
                <strong className="text-white block text-[10px] uppercase tracking-wider font-mono opacity-40">Post Description:</strong>
                <p className="bg-black/20 p-2 rounded border border-white/5 whitespace-pre-wrap mt-0.5">{socialPost.description}</p>
              </div>
              <div>
                <strong className="text-white block text-[10px] uppercase tracking-wider font-mono opacity-40">Hashtags:</strong>
                <p className="bg-black/20 p-2 rounded border border-white/5 font-mono text-indigo-300 mt-0.5">{socialPost.hashtags}</p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-red-400 text-center py-1">Gagal memuat copywriting. Coba lagi.</p>
          )}
        </div>
      )}
    </div>
  );
}
