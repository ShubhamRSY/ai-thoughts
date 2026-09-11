import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-[var(--border-base)] bg-[var(--surface)]/70 px-[var(--shell-pad)] py-6">
      <div className="shell-raw flex w-full flex-col gap-3">
        <div className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
          <span className="inline-block rounded-md bg-[var(--accent)] px-1.5 py-0.5 text-[9px] font-bold text-white">
            AI
          </span>
          <span className="font-display text-[var(--foreground)]">AI·Thoughts</span>
          <span>— The Public Pulse</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[var(--muted)]">
          <Link href="/terms" className="transition hover:text-[var(--foreground)]">
            Terms
          </Link>
          <Link href="/install" className="transition hover:text-[var(--foreground)]">
            Install
          </Link>
          <Link href="/privacy" className="transition hover:text-[var(--foreground)]">
            Privacy
          </Link>
          <Link href="/guidelines" className="transition hover:text-[var(--foreground)]">
            Community Guidelines
          </Link>
          <Link href="/contact" className="transition hover:text-[var(--foreground)]">
            Contact
          </Link>
          <Link href="/keeper" className="transition hover:text-[var(--muted)]">
            Keepers Desk
          </Link>
        </div>
        <p className="text-[11px] leading-relaxed text-[var(--muted)]">
          Every feeling about AI belongs here. Made with care for all ages, all
          languages, all hearts.
        </p>
      </div>
    </footer>
  );
}
