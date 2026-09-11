"use client";

import { useRef, useState, useEffect } from "react";
import { Captions, Volume2, VolumeX, Globe, ChevronDown, ChevronUp } from "lucide-react";
import type { TranscriptSegment } from "@/lib/types";

interface TranscriptPanelProps {
  segments: TranscriptSegment[];
  language?: string;
  languageLabel?: string;
  currentTime: number;
  onSeek?: (time: number) => void;
}

function fmt(t: number) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function TranscriptPanel({
  segments,
  language,
  languageLabel,
  currentTime,
  onSeek,
}: TranscriptPanelProps) {
  const [open, setOpen] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const activeRef = useRef<HTMLButtonElement | null>(null);

  const fullText = segments.map((s) => s.text).join(" ");
  const activeIdx = segments.reduce((acc, s, i) => (currentTime >= s.time ? i : acc), -1);

  // Auto-scroll the highlighted line into view while media plays.
  useEffect(() => {
    if (open && activeRef.current) {
      activeRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [activeIdx, open]);

  useEffect(() => {
    return () => {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);

  const speak = () => {
    if (!("speechSynthesis" in window)) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const utter = new SpeechSynthesisUtterance(fullText);
    utter.rate = 1.02;
    if (language) utter.lang = language;
    const voices = window.speechSynthesis.getVoices();
    const match =
      voices.find((v) => v.lang.toLowerCase().startsWith((language || "en").toLowerCase())) ||
      voices.find((v) => v.lang.startsWith("en"));
    if (match) utter.voice = match;
    utter.onend = () => setSpeaking(false);
    utter.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utter);
  };

  return (
    <div className="rounded-xl border border-[var(--border-base)] bg-[var(--surface-2)]">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="flex items-center gap-2">
          <Captions className="h-4 w-4 text-[var(--accent)]" />
          <span className="text-xs font-semibold text-[var(--foreground)]">Transcript</span>
          {languageLabel && (
            <span className="flex items-center gap-1 rounded-md bg-white px-1.5 py-0.5 text-[10px] font-medium text-[var(--muted)]">
              <Globe className="h-2.5 w-2.5" />
              {languageLabel}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={speak}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-[var(--muted)] transition hover:bg-white hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={speaking ? "Stop reading transcript" : "Listen to transcript"}
            title={speaking ? "Stop" : "Listen to this take"}
          >
            {speaking ? (
              <VolumeX className="h-3.5 w-3.5 text-red-500" />
            ) : (
              <Volume2 className="h-3.5 w-3.5" />
            )}
            {speaking ? "Stop" : "Listen"}
          </button>
          <button
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-[var(--muted)] transition hover:bg-white hover:text-[var(--foreground)]"
            aria-expanded={open}
            aria-label={open ? "Hide transcript" : "Show transcript"}
          >
            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {open ? "Hide" : "Show"}
          </button>
        </div>
      </div>

      {open && (
        <div
          className="max-h-52 space-y-0.5 overflow-y-auto border-t border-[var(--border-base)] px-2 py-1.5"
          role="list"
          aria-label="Transcript with time markers"
        >
          {segments.map((seg, i) => {
            const active = i === activeIdx;
            return (
              <button
                key={i}
                ref={active ? activeRef : undefined}
                onClick={() => {
                  onSeek?.(seg.time);
                  setOpen(true);
                }}
                role="listitem"
                className={`flex w-full items-start gap-2 rounded-lg px-2 py-1 text-left text-xs leading-relaxed transition ${
                  active
                    ? "bg-teal-50 text-teal-900"
                    : "text-[var(--foreground)] hover:bg-white"
                }`}
                title="Jump to this part of the clip"
              >
                <span
                  className={`mt-px shrink-0 font-mono text-[10px] tabular-nums ${
                    active ? "text-teal-700" : "text-[var(--muted)]"
                  }`}
                >
                  {fmt(seg.time)}
                </span>
                <span lang={language} dir="auto">
                  {seg.text}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
