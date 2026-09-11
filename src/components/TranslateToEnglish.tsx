"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Languages, Loader2 } from "lucide-react";

interface TranslateToEnglishProps {
  text: string;
  sourceLang?: string;
  /**
   * `link` — text button (posts)
   * `dropdown` — compact select under replies
   */
  variant?: "link" | "dropdown";
}

export default function TranslateToEnglish({
  text,
  sourceLang,
  variant = "link",
}: TranslateToEnglishProps) {
  const [view, setView] = useState<"original" | "english">("original");
  const [loading, setLoading] = useState(false);
  const [translation, setTranslation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const listId = useId();

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const fetchTranslation = useCallback(async () => {
    if (translation) return translation;
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
        return null;
      }
      const t = data.translation as string;
      setTranslation(t);
      return t;
    } catch {
      setError("Network error");
      return null;
    } finally {
      setLoading(false);
    }
  }, [text, sourceLang, translation]);

  const chooseEnglish = async () => {
    setMenuOpen(false);
    const t = await fetchTranslation();
    if (t) setView("english");
  };

  const chooseOriginal = () => {
    setMenuOpen(false);
    setView("original");
    setError(null);
  };

  if (!text.trim()) return null;

  if (variant === "dropdown") {
    return (
      <div className="mt-1.5" ref={menuRef}>
        <div className="relative inline-block">
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={menuOpen}
            aria-controls={listId}
            disabled={loading}
            onClick={() => setMenuOpen((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--border-base)] bg-[var(--surface)] px-2 py-0.5 text-[10px] font-medium text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--foreground)] disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Languages className="h-3 w-3" strokeWidth={2} />
            )}
            {view === "english" ? "English" : "Original"}
            <ChevronDown className="h-3 w-3 opacity-70" />
          </button>

          {menuOpen && (
            <ul
              id={listId}
              role="listbox"
              className="absolute left-0 z-20 mt-1 min-w-[10.5rem] overflow-hidden rounded-lg border border-[var(--border-base)] bg-[var(--surface)] py-1 shadow-md"
            >
              <li role="option" aria-selected={view === "original"}>
                <button
                  type="button"
                  onClick={chooseOriginal}
                  className={`flex w-full px-3 py-1.5 text-left text-xs transition hover:bg-[var(--surface-2)] ${
                    view === "original" ? "font-semibold text-[var(--foreground)]" : "text-[var(--muted)]"
                  }`}
                >
                  Original
                </button>
              </li>
              <li role="option" aria-selected={view === "english"}>
                <button
                  type="button"
                  onClick={() => void chooseEnglish()}
                  className={`flex w-full px-3 py-1.5 text-left text-xs transition hover:bg-[var(--surface-2)] ${
                    view === "english" ? "font-semibold text-[var(--foreground)]" : "text-[var(--muted)]"
                  }`}
                >
                  Translate to English
                </button>
              </li>
            </ul>
          )}
        </div>

        {error && <p className="mt-1 text-[11px] text-rose-700">{error}</p>}

        {view === "english" && translation && (
          <div className="mt-1.5 rounded-lg border border-[var(--border-base)] bg-[var(--surface-2)] px-2.5 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
              English
            </p>
            <p lang="en" className="mt-1 text-xs leading-relaxed text-[var(--foreground)]">
              {translation}
            </p>
          </div>
        )}
      </div>
    );
  }

  // Link variant (posts)
  const onLinkClick = async () => {
    if (view === "english") {
      setView("original");
      return;
    }
    const t = await fetchTranslation();
    if (t) setView("english");
  };

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => void onLinkClick()}
        disabled={loading}
        className={`inline-flex items-center gap-1.5 text-[11px] font-medium transition ${
          view === "english"
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
          : view === "english"
            ? "Show original"
            : "Translate to English"}
      </button>

      {error && <p className="mt-1 text-[11px] text-rose-700">{error}</p>}

      {view === "english" && translation && (
        <div className="mt-2 rounded-xl border border-[var(--border-base)] bg-[var(--surface-2)] px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
            English
          </p>
          <p lang="en" className="mt-1 text-sm leading-relaxed text-[var(--foreground)]">
            {translation}
          </p>
        </div>
      )}
    </div>
  );
}
