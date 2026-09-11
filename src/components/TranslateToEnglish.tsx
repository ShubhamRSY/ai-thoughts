"use client";

import { useCallback, useState } from "react";
import { Languages, Loader2 } from "lucide-react";

interface TranslateToEnglishProps {
  text: string;
  sourceLang?: string;
  /** Compact inline control for comments */
  compact?: boolean;
}

export default function TranslateToEnglish({
  text,
  sourceLang,
  compact = false,
}: TranslateToEnglishProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [translation, setTranslation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    if (translation) {
      setOpen((v) => !v);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, sourceLang }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Translation failed");
        return;
      }
      setTranslation(data.translation as string);
      setOpen(true);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [text, sourceLang, translation]);

  if (!text.trim()) return null;

  return (
    <div className={compact ? "mt-1" : "mt-2"}>
      <button
        type="button"
        onClick={() => void run()}
        disabled={loading}
        className={`inline-flex items-center gap-1.5 text-[11px] font-medium transition ${
          open
            ? "text-[var(--accent)]"
            : "text-[var(--muted)] hover:text-[var(--foreground)]"
        } disabled:opacity-60`}
      >
        {loading ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Languages className="h-3 w-3" strokeWidth={2} />
        )}
        {loading
          ? "Translating…"
          : translation && open
            ? "Hide English"
            : translation
              ? "Show English"
              : "Translate to English"}
      </button>

      {error && <p className="mt-1 text-[11px] text-rose-700">{error}</p>}

      {open && translation && (
        <div
          className={`mt-2 rounded-xl border border-[var(--border-base)] bg-[var(--surface-2)] ${
            compact ? "px-2.5 py-2" : "px-3 py-2.5"
          }`}
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
            English
          </p>
          <p
            lang="en"
            className={`mt-1 leading-relaxed text-[var(--foreground)] ${
              compact ? "text-xs" : "text-sm"
            }`}
          >
            {translation}
          </p>
        </div>
      )}
    </div>
  );
}
