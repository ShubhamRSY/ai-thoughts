import Link from "next/link";
import { BRAND } from "@/lib/brand";

export default function Footer({ hideRunBy = false }: { hideRunBy?: boolean }) {
  return (
    <footer className="app-pad border-t border-[var(--border-base)] py-8">
      <p className="font-display text-sm text-[var(--foreground)]">{BRAND.name}</p>
      <p className="mt-1 text-xs text-[var(--muted)]">{BRAND.tagline}</p>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-[var(--muted)]">
        <Link href="/terms" className="hover:text-[var(--foreground)]">Terms</Link>
        <Link href="/privacy" className="hover:text-[var(--foreground)]">Privacy</Link>
        <Link href="/dmca" className="hover:text-[var(--foreground)]">DMCA</Link>
        <Link href="/guidelines" className="hover:text-[var(--foreground)]">Guidelines</Link>
        <Link href="/trust" className="hover:text-[var(--foreground)]">Trust</Link>
        {BRAND.supportUrl && (
          <Link href="/support" className="hover:text-[var(--foreground)]">Support</Link>
        )}
        <Link href="/contact" className="hover:text-[var(--foreground)]">Contact</Link>
        <Link href="/install" className="hover:text-[var(--foreground)]">Install</Link>
        <Link href="/keeper" className="hover:text-[var(--muted)]">Keepers</Link>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-[var(--muted)]">
        {BRAND.trustLine}
      </p>
      <p className="mt-3 text-[11px] leading-relaxed text-[var(--muted)]">
        {BRAND.footerLine}
      </p>
      {!hideRunBy && (
        <p className="mt-2 text-[10px] uppercase tracking-widest text-[var(--muted)]">
          {BRAND.runBy}
        </p>
      )}
    </footer>
  );
}
