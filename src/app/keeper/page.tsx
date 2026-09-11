"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldCheck, ArrowLeft, Flag, RefreshCw, Check } from "lucide-react";
import {
  fetchReports,
  resolveReport,
  deletePost,
  isKeeper,
  type ReportRow,
  isLive,
} from "@/lib/db";
import { useAuth } from "@/hooks/useAuth";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

type ContactRow = {
  id: string;
  email: string;
  message: string;
  kind: string;
  createdAt: string;
};

export default function KeeperPage() {
  const { user, loading: authLoading } = useAuth();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);

  const loadContacts = async () => {
    try {
      const res = await fetch("/api/contact");
      if (!res.ok) return;
      const data = await res.json();
      setContacts(data.requests ?? []);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    (async () => {
      if (!isLive() || !user) {
        if (!cancelled) {
          setAuthorized(false);
          setLoading(false);
        }
        return;
      }
      const keeper = await isKeeper(user.handle);
      if (cancelled) return;
      setAuthorized(keeper);
      if (keeper) {
        const rows = await fetchReports();
        if (!cancelled) setReports(rows ?? []);
        await loadContacts();
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user]);

  const refresh = async () => {
    if (!isLive() || !user) return;
    const keeper = await isKeeper(user.handle);
    setAuthorized(keeper);
    if (keeper) {
      const rows = await fetchReports();
      setReports(rows ?? []);
      await loadContacts();
    }
    setLoading(false);
  };

  const resolveContact = async (id: string) => {
    setWorking(id);
    try {
      await fetch("/api/contact", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setContacts((prev) => prev.filter((c) => c.id !== id));
    } finally {
      setWorking(null);
    }
  };

  const handleDelete = async (r: ReportRow) => {
    setWorking(r.id);
    const ok = await deletePost(r.post_id);
    if (ok) await resolveReport(r.id);
    setReports((prev) => prev.filter((x) => x.id !== r.id));
    setWorking(null);
  };

  const handleResolve = async (r: ReportRow) => {
    setWorking(r.id);
    await resolveReport(r.id);
    setReports((prev) => prev.filter((x) => x.id !== r.id));
    setWorking(null);
  };

  if (loading) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-[430px] items-center justify-center">
        <RefreshCw className="h-5 w-5 animate-spin text-[var(--muted)]" />
      </div>
    );
  }

  if (authorized !== true) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col px-4 pt-6">
        <Link
          href="/"
          className="mb-4 flex w-fit items-center gap-1.5 text-sm text-[var(--muted)] transition hover:text-[var(--foreground)]"
        >
          <ArrowLeft className="h-4 w-4" /> Back to the pulse
        </Link>
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-[var(--border-base)] bg-white px-6 py-10 text-center shadow-sm shadow-slate-900/5">
          <ShieldCheck className="h-10 w-10 text-[var(--muted)]" />
          <h1 className="font-display text-lg font-bold text-[var(--foreground)]">Keepers only</h1>
          <p className="max-w-xs text-sm text-[var(--muted)]">
            This is the moderation desk for community keepers. It&apos;s invite-only — if you
            think you should have access, ask a current keeper.
          </p>
          {!isLive() && (
            <p className="text-xs text-amber-700">
              The database isn&apos;t connected in this environment, so the desk is offline.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-dvh w-full max-w-[430px] px-4 pb-24 pt-6">
      <header className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Link
            href="/"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-base)] bg-white text-[var(--muted)] transition hover:text-[var(--foreground)]"
            aria-label="Back to the pulse"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="font-display flex items-center gap-1.5 text-base font-bold text-[var(--foreground)]">
              <ShieldCheck className="h-5 w-5 text-[var(--accent)]" /> Keepers Desk
            </h1>
            <p className="text-[11px] text-[var(--muted)]">
              {reports.length} open {reports.length === 1 ? "report" : "reports"}
              {contacts.length > 0
                ? ` · ${contacts.length} contact ${contacts.length === 1 ? "request" : "requests"}`
                : ""}
            </p>
          </div>
        </div>
        <button
          onClick={() => void refresh()}
          aria-label="Refresh"
          className="flex h-9 items-center gap-1 rounded-lg border border-[var(--border-base)] bg-white px-3 text-xs font-medium text-[var(--foreground)] transition hover:bg-[var(--surface-2)]"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </header>

      {reports.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-[var(--border-base)] bg-white px-6 py-12 text-center shadow-sm shadow-slate-900/5">
          <p className="text-sm font-semibold text-[var(--foreground)]">All clear</p>
          <p className="max-w-xs text-xs text-[var(--muted)]">
            No open reports right now. The pulse is feeling peaceful.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {reports.map((r) => (
            <li
              key={r.id}
              className="rounded-2xl border border-[var(--border-base)] bg-white p-4 shadow-sm shadow-slate-900/5"
            >
              <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                <Flag className="h-3.5 w-3.5 text-rose-500" />
                <span className="font-semibold text-rose-700">{r.reason}</span>
                <span>·</span>
                <span>{timeAgo(r.created_at)}</span>
              </div>
              <p className="mt-2 text-sm text-[var(--foreground)]">
                {r.reported_handle ?? "unknown"}
              </p>
              {r.content_snippet && (
                <p className="mt-1 line-clamp-2 text-xs text-[var(--muted)]">
                  “{r.content_snippet}”
                </p>
              )}
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={() => handleDelete(r)}
                  disabled={working === r.id}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-rose-500 disabled:opacity-50"
                >
                  {working === r.id ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : "Remove take"}
                </button>
                <button
                  onClick={() => handleResolve(r)}
                  disabled={working === r.id}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--border-base)] bg-[var(--surface-2)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] transition hover:bg-white disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" /> Keep &amp; resolve
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {contacts.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-[var(--foreground)]">Contact requests</h2>
          <ul className="flex flex-col gap-3">
            {contacts.map((c) => (
              <li key={c.id} className="rounded-2xl border border-[var(--border-base)] bg-white p-4 shadow-sm shadow-slate-900/5">
                <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                  <span className="font-semibold capitalize text-[var(--accent)]">{c.kind}</span>
                  <span>·</span>
                  <span>{timeAgo(c.createdAt)}</span>
                </div>
                <p className="mt-2 text-sm text-[var(--foreground)]">{c.email}</p>
                <p className="mt-1 whitespace-pre-wrap text-xs text-[var(--muted)]">{c.message}</p>
                <button
                  onClick={() => void resolveContact(c.id)}
                  disabled={working === c.id}
                  className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--border-base)] bg-[var(--surface-2)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] transition hover:bg-white disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" /> Mark resolved
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
