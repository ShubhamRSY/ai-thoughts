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

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function KeeperPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isLive()) {
        if (!cancelled) {
          setAuthorized(false);
          setLoading(false);
        }
        return;
      }
      const keeper = await isKeeper();
      if (cancelled) return;
      setAuthorized(keeper);
      if (keeper) {
        const rows = await fetchReports();
        if (!cancelled) setReports(rows ?? []);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = async () => {
    if (!isLive()) return;
    const keeper = await isKeeper();
    setAuthorized(keeper);
    if (keeper) {
      const rows = await fetchReports();
      setReports(rows ?? []);
    }
    setLoading(false);
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
        <RefreshCw className="h-5 w-5 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (authorized !== true) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col px-4 pt-6">
        <Link
          href="/"
          className="mb-4 flex w-fit items-center gap-1.5 text-sm text-zinc-400 transition hover:text-zinc-200"
        >
          <ArrowLeft className="h-4 w-4" /> Back to the pulse
        </Link>
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/50 px-6 py-10 text-center">
          <ShieldCheck className="h-10 w-10 text-zinc-600" />
          <h1 className="text-lg font-bold text-zinc-100">Keepers only</h1>
          <p className="max-w-xs text-sm text-zinc-400">
            This is the moderation desk for community keepers. It&apos;s invite-only — if you
            think you should have access, ask a current keeper.
          </p>
          {!isLive() && (
            <p className="text-xs text-amber-400/90">
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
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/60 text-zinc-400 transition hover:text-zinc-200"
            aria-label="Back to the pulse"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="flex items-center gap-1.5 text-base font-bold text-zinc-100">
              <ShieldCheck className="h-5 w-5 text-violet-400" /> Keepers Desk
            </h1>
            <p className="text-[11px] text-zinc-500">
              {reports.length} open {reports.length === 1 ? "report" : "reports"} to review
            </p>
          </div>
        </div>
        <button
          onClick={() => void refresh()}
          aria-label="Refresh"
          className="flex h-9 items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 text-xs font-medium text-zinc-300 transition hover:text-zinc-100"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </header>

      {reports.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/40 px-6 py-12 text-center">
          <span className="text-3xl">🌿</span>
          <p className="text-sm font-semibold text-zinc-200">All clear</p>
          <p className="max-w-xs text-xs text-zinc-500">
            No open reports right now. The pulse is feeling peaceful.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {reports.map((r) => (
            <li
              key={r.id}
              className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4"
            >
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <Flag className="h-3.5 w-3.5 text-rose-400" />
                <span className="font-semibold text-rose-300">{r.reason}</span>
                <span>·</span>
                <span>{timeAgo(r.created_at)}</span>
              </div>
              <p className="mt-2 text-sm text-zinc-200">
                {r.reported_handle ?? "unknown"}
              </p>
              {r.content_snippet && (
                <p className="mt-1 line-clamp-2 text-xs text-zinc-400">
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
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-700 disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" /> Keep &amp; resolve
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
