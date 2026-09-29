"use client";

import { BRAND } from "@/lib/brand";

interface WindowsStoreCtaProps {
  className?: string;
  /** Extra class for the primary button look */
  buttonClassName?: string;
  /** The "updates come through the Store" line under the button */
  showNote?: boolean;
}

/**
 * A Windows PC browser — not our own Windows app (Electron puts "Electron/"
 * in its user agent), where offering the download makes no sense.
 */
export function isWindowsBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /Windows NT/.test(ua) && !/Electron\//.test(ua);
}

/** Microsoft Store CTA — never sends people to GitHub. */
export default function WindowsStoreCta({
  className,
  buttonClassName = "landing-btn landing-btn-primary",
  showNote = true,
}: WindowsStoreCtaProps) {
  const url = BRAND.windowsStoreUrl;
  // Only empty if NEXT_PUBLIC_MS_STORE_URL is set to "" on purpose to hide it.
  if (!url) return null;

  return (
    <div className={className}>
      <a href={url} target="_blank" rel="noopener noreferrer" className={buttonClassName}>
        {BRAND.windowsStoreLabel}
      </a>
      {showNote && (
        <p className="mt-2 text-center text-[11px] text-[var(--muted)]">
          Install from the Microsoft Store — updates come through the Store
        </p>
      )}
    </div>
  );
}
