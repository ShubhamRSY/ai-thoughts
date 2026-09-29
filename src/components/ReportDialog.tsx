"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { ShieldCheck } from "lucide-react";
import { CHILD_SAFETY, REPORT_REASONS, type ReportReason } from "@/lib/report-reasons";

/** Report sheet for a take or an account. Render it only while open. */
export default function ReportDialog({
  subject,
  signedIn,
  onSubmit,
  onClose,
}: {
  /** What is being reported, e.g. "take" or "account" — used in the copy. */
  subject: string;
  signedIn: boolean;
  onSubmit: (reason: ReportReason) => Promise<boolean>;
  onClose: () => void;
}) {
  const [reported, setReported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (reason: ReportReason) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (!(await onSubmit(reason))) {
        setError("Couldn’t send that report — try again.");
        return;
      }
      setReported(true);
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 sm:items-center">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close report" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-title"
        className="relative z-10 flex max-h-[min(85dvh,32rem)] w-full max-w-md flex-col rounded-t-2xl border border-[var(--border-base)] bg-[var(--surface)] shadow-xl sm:rounded-2xl"
      >
        {reported ? (
          <div className="flex flex-col items-center gap-3 px-5 py-8 text-center">
            <ShieldCheck className="h-8 w-8 text-[var(--accent)]" />
            <p className="text-sm font-semibold">Thanks — reported</p>
            <p className="text-xs text-[var(--muted)]">We&apos;ll take a look.</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-1 w-full rounded-full border border-[var(--border-base)] py-2.5 text-sm font-semibold"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-[var(--border-base)] px-5 py-3">
              <h3 id="report-title" className="font-display text-base font-semibold">
                Report this {subject}
              </h3>
              <button
                type="button"
                onClick={onClose}
                className="text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)]"
              >
                Cancel
              </button>
            </div>
            <div className="overflow-y-auto overscroll-contain px-5 py-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {!signedIn && <p className="mb-3 text-sm text-[var(--muted)]">Sign in to send a report.</p>}
              {error && <p className="mb-3 text-sm text-rose-700">{error}</p>}
              <div className="flex flex-col gap-2">
                {REPORT_REASONS.map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    disabled={busy || !signedIn}
                    onClick={() => void submit(reason)}
                    className="rounded-xl border border-[var(--border-base)] px-3 py-2.5 text-left text-sm hover:bg-[var(--surface-2)] disabled:opacity-50"
                  >
                    {reason === CHILD_SAFETY ? (
                      <>
                        <span className="font-semibold">{CHILD_SAFETY}</span>
                        <span className="block text-xs text-[var(--muted)]">
                          Sexualises, exploits or endangers someone under 18
                        </span>
                      </>
                    ) : (
                      reason
                    )}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs text-[var(--muted)]">
                If a child is in immediate danger, call your local emergency number first.
              </p>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
