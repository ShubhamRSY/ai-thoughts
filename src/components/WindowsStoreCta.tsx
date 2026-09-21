"use client";

import { BRAND } from "@/lib/brand";

interface WindowsStoreCtaProps {
  className?: string;
  /** Extra class for the primary button look */
  buttonClassName?: string;
}

/** Microsoft Store CTA — never sends people to GitHub. */
export default function WindowsStoreCta({
  className,
  buttonClassName = "landing-btn landing-btn-primary",
}: WindowsStoreCtaProps) {
  const url = BRAND.windowsStoreUrl;
  // No listing yet → say nothing. Set NEXT_PUBLIC_MS_STORE_URL to bring it back.
  if (!url) return null;

  return (
    <div className={className}>
      <a href={url} target="_blank" rel="noopener noreferrer" className={buttonClassName}>
        {BRAND.windowsStoreLabel}
      </a>
      <p className="mt-2 text-center text-[11px] text-[var(--muted)]">
        Install from the Microsoft Store — updates come through the Store
      </p>
    </div>
  );
}
