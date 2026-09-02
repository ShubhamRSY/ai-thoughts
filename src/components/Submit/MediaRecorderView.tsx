"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Video, Play, Pause, RotateCcw, CheckCircle2 } from "lucide-react";
import { useMediaRecorder } from "@/hooks/useMediaRecorder";

export interface CapturedClip {
  blob: Blob | null;
  duration: number;
}

interface MediaRecorderViewProps {
  kind: "audio" | "video";
  onCaptured?: (clip: CapturedClip) => void;
}

function formatDur(s: number) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function formatBytes(b: number) {
  if (b <= 0) return "0 KB";
  return b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

export default function MediaRecorderView({ kind, onCaptured }: MediaRecorderViewProps) {
  const { status, error, duration, blob, previewUrl, stream, start, stop, reset } =
    useMediaRecorder(kind);
  const Icon = kind === "audio" ? Mic : Video;
  const isRecording = status === "recording";
  const isVideo = kind === "video";
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLVideoElement | HTMLAudioElement>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);

  // Report the captured clip up to the publish flow whenever it changes.
  useEffect(() => {
    onCaptured?.({ blob, duration: blob ? duration : 0 });
  }, [blob, duration, onCaptured]);

  // Live camera/mic preview while recording
  useEffect(() => {
    const v = videoRef.current;
    if (v && stream) {
      v.srcObject = stream;
      v.play().catch(() => {});
    }
  }, [stream]);

  // Play / pause the captured clip
  const togglePreview = () => {
    const el = previewRef.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => {});
    else el.pause();
  };

  return (
    <div
      className={`relative overflow-hidden rounded-xl border ${
        isRecording ? "border-red-500/50" : "border-zinc-800"
      }`}
    >
      {/* Capture / preview area */}
      {status === "recording" && isVideo ? (
        <div className="relative aspect-video w-full bg-black">
          <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
          <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-red-500/90 px-2 py-0.5 text-[11px] font-semibold text-white">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
            </span>
            REC
          </span>
          <span className="absolute right-3 top-3 rounded-full bg-zinc-900/80 px-2.5 py-1 font-mono text-xs text-amber-300 tabular-nums">
            {formatDur(duration)}
          </span>
        </div>
      ) : status === "recording" ? (
        <div className="relative flex aspect-video flex-col items-center justify-center gap-3 bg-zinc-900/60">
          <span className="inline-flex h-16 w-16 animate-pulse items-center justify-center rounded-full bg-red-500/20">
            <Mic className="h-8 w-8 text-red-400" />
          </span>
          <span className="flex items-center gap-2 text-xs font-medium text-red-300">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-400" />
            </span>
            REC {formatDur(duration)}
          </span>
        </div>
      ) : previewUrl ? (
        <div className="relative">
          {isVideo ? (
            <div className="relative aspect-video w-full bg-black">
              <video
                ref={previewRef as React.Ref<HTMLVideoElement>}
                src={previewUrl}
                playsInline
                onPlay={() => setPreviewPlaying(true)}
                onPause={() => setPreviewPlaying(false)}
                className="h-full w-full object-cover"
              />
              <button
                onClick={togglePreview}
                className="absolute inset-0 flex items-center justify-center bg-black/0 transition hover:bg-black/20"
                aria-label={previewPlaying ? "Pause preview" : "Play preview"}
              >
                <span
                  className={`flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-zinc-950 shadow-xl transition ${
                    previewPlaying ? "opacity-0 hover:opacity-100" : "opacity-100"
                  }`}
                >
                  {previewPlaying ? (
                    <Pause className="h-5 w-5" fill="currentColor" />
                  ) : (
                    <Play className="ml-0.5 h-5 w-5" fill="currentColor" />
                  )}
                </span>
              </button>
            </div>
          ) : (
            <div className="relative flex aspect-video flex-col items-center justify-center gap-2 bg-zinc-900/60">
              <audio
                ref={previewRef as React.Ref<HTMLAudioElement>}
                src={previewUrl}
                onPlay={() => setPreviewPlaying(true)}
                onPause={() => setPreviewPlaying(false)}
                className="hidden"
              />
              <span className="animate-pop-in flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-3xl">
                ✅
              </span>
              <button
                onClick={togglePreview}
                className="flex items-center gap-1.5 rounded-full bg-zinc-800 px-4 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-zinc-700"
              >
                {previewPlaying ? (
                  <Pause className="h-3.5 w-3.5" fill="currentColor" />
                ) : (
                  <Play className="h-3.5 w-3.5" fill="currentColor" />
                )}
                {previewPlaying ? "Pause clip" : "Play clip"}
              </button>
              <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-300">
                <CheckCircle2 className="h-4 w-4" />
                Saved — {formatBytes(blob?.size ?? 0)} recorded
              </p>
            </div>
          )}
          <span className="absolute right-3 top-3 rounded-full bg-zinc-900/80 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
            Captured
          </span>
        </div>
      ) : (
        <div className="flex aspect-video flex-col items-center justify-center gap-2 bg-zinc-900/50">
          <span
            className={`flex h-16 w-16 items-center justify-center rounded-2xl ${
              status === "error" || status === "requesting"
                ? "bg-red-500/10"
                : "bg-zinc-800"
            }`}
          >
            {status === "requesting" ? (
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-500 border-t-transparent" />
            ) : (
              <Icon className="h-8 w-8 text-zinc-400" />
            )}
          </span>
          {status === "error" && (
            <p className="max-w-xs px-4 text-center text-xs text-red-400">
              {error ?? "Recording failed."}
            </p>
          )}
        </div>
      )}

      {/* Status + controls */}
      <div className="space-y-3 border-t border-zinc-800/70 px-4 py-3">
        <p className="min-h-[1.25rem] text-center text-sm">
          {status === "idle" && (
            <span className="text-zinc-400">
              {isVideo
                ? "Roll the clip. Camera + mic will turn on."
                : "Speak your raw take. Your mic will turn on."}
            </span>
          )}
          {status === "requesting" && (
            <span className="text-amber-300">
              Asking for {isVideo ? "camera + mic" : "mic"} access…
            </span>
          )}
          {status === "recording" && (
            <span className="text-zinc-300">
              {isVideo ? "Recording — look alive. 🎬" : "Recording — say your piece."}
            </span>
          )}
          {status === "stopped" && (
            <span className="text-emerald-300">
              {previewUrl
                ? "Saved — preview it above, then add details and post."
                : "Done. Add details and post."}
            </span>
          )}
        </p>

        <div className="flex flex-wrap items-center justify-center gap-2">
          {status === "idle" || status === "error" ? (
            <button
              onClick={() => start()}
              className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-violet-500 to-indigo-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 transition hover:brightness-110"
            >
              <span className="h-2.5 w-2.5 rounded-full bg-white" />
              Start{isVideo ? " Recording" : " Recording"}
            </button>
          ) : status === "requesting" ? (
            <button disabled className="cursor-not-allowed rounded-lg bg-zinc-800 px-5 py-2.5 text-sm font-semibold text-zinc-500">
              Waiting…
            </button>
          ) : status === "recording" ? (
            <button
              onClick={stop}
              className="flex items-center gap-2 rounded-lg bg-red-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-600"
            >
              <span className="h-3 w-3 rounded-sm bg-white" /> Stop & Keep
            </button>
          ) : (
            <button
              onClick={reset}
              className="flex items-center gap-2 rounded-lg border border-zinc-700 px-5 py-2.5 text-sm font-semibold text-zinc-300 transition hover:bg-zinc-800"
            >
              <RotateCcw className="h-4 w-4" /> Record Again
            </button>
          )}
        </div>

        {blob && blob.size > 0 && status === "stopped" && (
          <p className="animate-pop-in text-center text-xs font-medium text-emerald-300">
            ✅ Saved {formatBytes(blob.size)} ·{" "}
            <span className="font-mono">{blob.type.replace(/^[^/]+\//, "")}</span> · preview ready
          </p>
        )}
      </div>
    </div>
  );
}
