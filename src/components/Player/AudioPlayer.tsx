"use client";

import { useRef, useState } from "react";
import { Play, Pause, Volume2, VolumeX, AudioLines } from "lucide-react";

interface AudioPlayerProps {
  src?: string;
  durationLabel?: string;
  onPlayChange?: (playing: boolean) => void;
  onProgress?: (time: number) => void;
  onElement?: (el: HTMLAudioElement | null) => void;
}

export default function AudioPlayer({
  src,
  durationLabel,
  onPlayChange,
  onProgress,
  onElement,
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [muted, setMuted] = useState(false);
  const [current, setCurrent] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const hasMedia = Boolean(src && src.trim() !== "");

  const wrapRef = (el: HTMLAudioElement | null) => {
    audioRef.current = el;
    onElement?.(el);
  };

  const toggle = async () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.src && !el.paused) {
      el.pause();
    } else {
      try {
        await el.play();
      } catch {
        /* autoplay / no media — ignore */
      }
    }
  };

  const onTime = () => {
    const el = audioRef.current;
    if (!el) return;
    setCurrent(el.currentTime);
    onProgress?.(el.currentTime);
    if (el.duration) {
      setProgress((el.currentTime / el.duration) * 100);
      setDurationSec(el.duration);
    }
  };

  return (
    <div className="rounded-xl border border-[var(--border-base)] bg-[var(--surface-2)] p-3">
      {hasMedia && (
        <audio
          ref={wrapRef}
          src={src}
          preload="metadata"
          muted={muted}
          onPlay={() => {
            setPlaying(true);
            onPlayChange?.(true);
          }}
          onPause={() => {
            setPlaying(false);
            onPlayChange?.(false);
          }}
          onTimeUpdate={onTime}
          onLoadedMetadata={onTime}
        />
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={toggle}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-white transition hover:bg-[var(--accent-2)]"
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? (
            <Pause className="h-5 w-5" fill="currentColor" />
          ) : (
            <Play className="ml-0.5 h-5 w-5" fill="currentColor" />
          )}
        </button>

        <div className="flex-1">
          {/* Fake waveform bars made from the progress */}
          <div className="mb-1.5 flex h-8 items-end gap-0.5">
            {Array.from({ length: 36 }).map((_, i) => {
              const base = 0.3 + ((i * 13) % 7) / 10;
              const height = hasMedia && progress > ((i + 1) / 36) * 100 ? 1 : base;
              return (
                <span
                  key={i}
                  className="flex-1 rounded-full transition-all duration-150"
                  style={{
                    height: `${height * 100}%`,
                    background:
                      hasMedia && progress > ((i + 1) / 36) * 100
                        ? "linear-gradient(180deg,#0f766e,#14b8a6)"
                        : "#d4dde3",
                  }}
                />
              );
            })}
          </div>
          <div className="flex items-center justify-between text-[11px] text-[var(--muted)]">
            <span className="tabular-nums">{formatTime(current)}</span>
            <span className="tabular-nums">{durationLabel ?? formatTime(durationSec)}</span>
          </div>
        </div>

        <button
          onClick={() => setMuted((m) => !m)}
          className="shrink-0 text-[var(--muted)] transition hover:text-[var(--foreground)]"
          aria-label={muted ? "Unmute" : "Mute"}
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
      </div>

      {!hasMedia && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-dashed border-[var(--border-base)] bg-white px-3 py-2 text-[11px] text-[var(--muted)]">
          <AudioLines className="h-3.5 w-3.5" />
          Placeholder audio — drop an <span className="font-mono text-[var(--foreground)]">.mp3</span> in{" "}
          <span className="font-mono text-[var(--foreground)]">/public/media</span> and point{" "}
          <span className="font-mono text-[var(--foreground)]">mediaUrl</span> at it.
        </div>
      )}
    </div>
  );
}

function formatTime(sec: number) {
  if (!isFinite(sec) || sec <= 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
