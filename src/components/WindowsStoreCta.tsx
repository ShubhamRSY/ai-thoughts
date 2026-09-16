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

  if (url) {
    return (
      <div className={className}>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClassName}
        >
          {BRAND.windowsStoreLabel}
        </a>
        <p className="mt-2 text-center text-[11px] text-[var(--muted)]">
          Install from the Microsoft Store — updates come through the Store
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      <button type="button" className={buttonClassName} disabled aria-disabled="true">
        Coming soon on Microsoft Store
      </button>
      <p className="mt-2 text-center text-[11px] text-[var(--muted)]">
        Windows listing is in progress. On PC, use Voices in the browser at aito.social for now.
      </p>
    </div>
  );
}
