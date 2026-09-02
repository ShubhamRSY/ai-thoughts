import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-zinc-800/60 bg-zinc-950/40 px-4 py-6">
      <div className="mx-auto flex w-full max-w-[430px] flex-col gap-3">
        <div className="flex items-center gap-2 text-[11px] text-zinc-500">
          <span className="inline-block rounded-md bg-gradient-to-br from-violet-500 to-indigo-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
            AI
          </span>
          <span>AI·Thoughts — The Public Pulse</span>
        </div>
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-zinc-400">
          <Link
            href="/terms"
            className="transition hover:text-zinc-200"
          >
            Terms
          </Link>
          <Link
            href="/privacy"
            className="transition hover:text-zinc-200"
          >
            Privacy
          </Link>
          <Link
            href="/guidelines"
            className="transition hover:text-zinc-200"
          >
            Community Guidelines
          </Link>
          <Link
            href="/keeper"
            className="transition hover:text-zinc-500"
          >
            Keepers Desk
          </Link>
        </nav>
        <p className="text-[11px] leading-relaxed text-zinc-600">
          Every feeling about AI belongs here. Made with care for all ages, all
          languages, all hearts.
        </p>
      </div>
    </footer>
  );
}
