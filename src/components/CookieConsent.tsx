"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const CONSENT_KEY = "aito.consent.v1";

/**
 * Consent banner for the site's cookie + local-storage usage. AiTo is
 * essential-only: sessions live in a signed cookie and preferences in local
 * storage — no tracking or advertising cookie is ever set — so the banner is a
 * truthful notice, not a blocker. The choice is remembered locally.
 */
export default function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    let dismissed = "0";
    try {
      dismissed = localStorage.getItem(CONSENT_KEY) ?? "0";
    } catch {
      /* storage unavailable — keep showing */
    }
    if (dismissed !== "1") setVisible(true);
  }, []);

  const accept = () => {
    try {
      localStorage.setItem(CONSENT_KEY, "1");
    } catch {
      /* ignore */
    }
    setVisible(false);
  };

  // Inside the app the fixed banner sat over the bottom nav, so members
  // couldn't reach "You" until they dismissed it — and they already agreed to
  // the Privacy Policy at sign-in. Public pages keep the notice.
  const inApp = ["/app", "/keeper", "/admin"].some((p) => pathname === p || pathname?.startsWith(p + "/"));
  if (!visible || inApp) return null;

  return (
    <div
      role="region"
      aria-label="Cookie notice"
      className="fixed inset-x-0 bottom-0 z-50 px-3 pb-3"
    >
      <div className="mx-auto flex max-h-[50dvh] max-w-xl flex-col gap-3 overflow-y-auto rounded-2xl border border-[var(--border-base)] bg-[var(--surface)] p-4 shadow-lg">
        <p className="text-xs leading-relaxed text-[var(--muted)]">
          We only use <span className="font-medium text-[var(--foreground)]">essential</span>{" "}
          cookies and local storage — to keep you signed in and remember your preferences. No
          tracking or ads. See our{" "}
          <Link
            href="/privacy"
            className="text-[var(--accent)] underline underline-offset-2"
          >
            Privacy Policy
          </Link>
          .
        </p>
        <button
          type="button"
          onClick={accept}
          className="inline-flex w-fit rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-[var(--surface)] hover:bg-[var(--accent-2)]"
        >
          Got it
        </button>
      </div>
    </div>
  );
}