import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Support — AI·Thoughts",
  description: "Supporters pay for the people who moderate.",
};

export default function SupportPage() {
  // No payment link configured → this page doesn't exist (same rule as the Store link).
  if (!BRAND.supportUrl) notFound();

  return (
    <div className="app-rail min-h-dvh py-8">
      <h1 className="font-display text-2xl font-bold text-[var(--foreground)]">Support {BRAND.shortName}</h1>
      <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
        Real people review every report, and
        that costs money. Supporters cover it — so the place stays around.
      </p>
      <a
        href={BRAND.supportUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-6 inline-flex rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[var(--surface)] hover:bg-[var(--accent-2)]"
      >
        Become a supporter
      </a>
    </div>
  );
}
