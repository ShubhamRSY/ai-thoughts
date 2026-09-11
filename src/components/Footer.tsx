import Link from "next/link";

export default function Footer() {
  return (
    <footer className="app-pad border-t border-[var(--border-base)] py-8">
      <p className="font-display text-sm text-[var(--foreground)]">AI·Thoughts</p>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-[var(--muted)]">
        <Link href="/terms" className="hover:text-[var(--foreground)]">Terms</Link>
        <Link href="/privacy" className="hover:text-[var(--foreground)]">Privacy</Link>
        <Link href="/guidelines" className="hover:text-[var(--foreground)]">Guidelines</Link>
        <Link href="/contact" className="hover:text-[var(--foreground)]">Contact</Link>
        <Link href="/install" className="hover:text-[var(--foreground)]">Install</Link>
        <Link href="/keeper" className="hover:text-[var(--muted)]">Keepers</Link>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-[var(--muted)]">
        Every feeling about AI belongs here.
      </p>
    </footer>
  );
}
