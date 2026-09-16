"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { BRAND } from "@/lib/brand";

/**
 * Public invite landing for a Circle page — join then open in the app.
 */
export default function CircleInvitePage() {
  const params = useParams();
  const router = useRouter();
  const slug = typeof params.slug === "string" ? params.slug : "";
  const [name, setName] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    fetch(`/api/communities/${encodeURIComponent(slug)}`, { cache: "no-store" })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (cancelled) return;
        if (!ok) {
          setError(d.error || "Page not found");
          return;
        }
        setName(d.community?.name ?? slug);
        setDescription(d.community?.description ?? "");
      })
      .catch(() => {
        if (!cancelled) setError("Couldn’t load page");
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/communities/${encodeURIComponent(slug)}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "join" }),
      });
      const data = await res.json();
      if (res.status === 401) {
        router.push(`/sign-in?next=${encodeURIComponent(`/c/${slug}`)}`);
        return;
      }
      if (!res.ok) {
        setError(data.error || "Couldn’t join");
        return;
      }
      router.push(`/app?circle=${encodeURIComponent(slug)}`);
    } catch {
      setError("Couldn’t join");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-rail flex min-h-dvh flex-col justify-center py-12">
      <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
        {BRAND.shortName} · Circle
      </p>
      <h1 className="mt-2 font-display text-2xl font-bold text-[var(--foreground)]">
        {name || "…"}
      </h1>
      {description && (
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{description}</p>
      )}
      {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}
      <button
        type="button"
        disabled={busy || !slug || Boolean(error && !name)}
        onClick={() => void join()}
        className="mt-6 w-full rounded-full bg-[var(--accent)] py-3 text-sm font-semibold text-[var(--surface)] disabled:opacity-50"
      >
        {busy ? "Joining…" : "Join this page"}
      </button>
      <Link
        href={`/app?circle=${encodeURIComponent(slug)}`}
        className="mt-3 text-center text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
      >
        Open in Voices
      </Link>
    </div>
  );
}
