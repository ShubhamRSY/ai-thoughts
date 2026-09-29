"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause, Clapperboard } from "lucide-react";

interface VideoPlayerProps {
  src?: string;
  durationLabel?: string;
  onPlayChange?: (playing: boolean) => void;
  onProgress?: (time: number) => void;
  onElement?: (el: HTMLVideoElement | null) => void;
}

export default function VideoPlayer({
  src,
  durationLabel,
  onPlayChange,
  onProgress,
  onElement,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [current, setCurrent] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [failed, setFailed] = useState(false);
  const hasMedia = Boolean(src && src.trim() !== "");
  const showPlaceholder = !hasMedia || failed;

  useEffect(() => {
    setFailed(false);
    setPlaying(false);
    setProgress(0);
    setCurrent(0);
    setDurationSec(0);
  }, [src]);

  const wrapRef = (el: HTMLVideoElement | null) => {
    videoRef.current = el;
    onElement?.(el);
  };

  const toggle = async () => {
    const el = videoRef.current;
    if (!el || showPlaceholder) return;
    if (!el.paused) {
      el.pause();
      return;
    }
    try {
      await el.play();
    } catch {
      /* ignore autoplay blocks */
    }
  };

  const onTime = () => {
    const el = videoRef.current;
    if (!el) return;
    setCurrent(el.currentTime);
    onProgress?.(el.currentTime);
    if (el.duration && Number.isFinite(el.duration)) {
      setProgress((el.currentTime / el.duration) * 100);
      setDurationSec(el.duration);
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border-base)] bg-black">
      <div className="relative aspect-video w-full">
        {showPlaceholder ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[var(--surface-2)] text-[var(--muted)]">
            <Clapperboard className="h-8 w-8" />
            <span className="text-[11px]">{failed ? "Couldn’t play this video" : "No video yet"}</span>
          </div>
        ) : (
          <>
            <video
              ref={wrapRef}
              // #t=0.1 makes browsers (iOS Safari especially) paint a frame as
              // the thumbnail instead of a black box; there is no poster image.
              src={src && !src.includes("#") ? `${src}#t=0.1` : src}
              playsInline
              preload="metadata"
              className="h-full w-full object-cover"
              onPlay={() => {
                setPlaying(true);
                onPlayChange?.(true);
              }}
              onPause={() => {
                setPlaying(false);
                onPlayChange?.(false);
              }}
              onEnded={() => {
                setPlaying(false);
                onPlayChange?.(false);
              }}
              onTimeUpdate={onTime}
              onLoadedMetadata={onTime}
              onError={() => setFailed(true)}
            />
            <button
              type="button"
              onClick={() => void toggle()}
              className="absolute inset-0 flex items-center justify-center bg-black/0 transition hover:bg-black/20"
              aria-label={playing ? "Pause" : "Play"}
            >
              <span
                className={`flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-xl transition ${
                  playing ? "opacity-0 hover:opacity-100" : "opacity-100"
                }`}
              >
                {playing ? (
                  <Pause className="h-6 w-6" fill="currentColor" />
                ) : (
                  <Play className="ml-0.5 h-6 w-6" fill="currentColor" />
                )}
              </span>
            </button>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/70 to-transparent">
              <div className="absolute inset-x-0 bottom-0 px-3 pb-3">
                <div className="h-1 w-full overflow-hidden rounded-full bg-white/30">
                  <div
                    className="h-full rounded-full bg-white transition-[width] duration-150"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="mt-1 flex items-center justify-between text-[10px] font-medium text-white/80">
                  <span className="tabular-nums">{formatTime(current)}</span>
                  <span className="tabular-nums">{durationLabel ?? formatTime(durationSec)}</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function formatTime(sec: number) {
  if (!isFinite(sec) || sec <= 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
