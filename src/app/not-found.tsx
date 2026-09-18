import Link from "next/link";
import BrandMark from "@/components/BrandMark";
import { BRAND } from "@/lib/brand";

export const metadata = {
  title: `Page not found — ${BRAND.shortName}`,
};

export default function NotFound() {
  return (
    <div className="app-frame">
      <div className="app-pad flex min-h-dvh flex-col items-center justify-center text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent)] shadow-sm">
          <BrandMark className="h-9 w-9" />
        </div>
        <h1 className="font-display mt-6 text-2xl font-medium tracking-tight text-[var(--foreground)]">
          This page wandered off
        </h1>
        <p className="mt-2 max-w-[32ch] text-sm leading-relaxed text-[var(--muted)]">
          Nothing lives at this address. Maybe a take was deleted, or the link’s a typo.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-[var(--surface)] hover:bg-[var(--accent-2)]"
          >
            Back home
          </Link>
          <Link
            href="/app"
            className="rounded-full border border-[var(--border-base)] px-5 py-2.5 text-sm font-semibold text-[var(--foreground)] hover:border-[var(--accent)]"
          >
            Open the feed
          </Link>
        </div>
      </div>
    </div>
  );
}
