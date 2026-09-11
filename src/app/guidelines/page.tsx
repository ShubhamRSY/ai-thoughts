import Link from "next/link";
import { LEGAL_UPDATED } from "@/lib/site";

export default function GuidelinesPage() {
  return (
    <div className="mx-auto min-h-dvh w-full max-w-[430px] px-5 py-8">
      <h1 className="font-display text-2xl font-bold text-[var(--foreground)]">Community Guidelines</h1>
      <p className="mt-1 text-xs text-[var(--muted)]">Last updated: {LEGAL_UPDATED}</p>

      <div className="mt-6 space-y-6 text-sm leading-relaxed text-[var(--muted)]">
        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--foreground)]">The one rule</h2>
          <p>
            Every feeling about AI belongs here — that&apos;s the whole idea. Be honest, be kind,
            and remember a person is on the other end of every take.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--foreground)]">What we remove</h2>
          <ul className="ml-4 list-disc space-y-1">
            <li>Hate, harassment, threats, or bullying of any kind</li>
            <li>Explicit sexual content or nudity</li>
            <li>Doxxing or posting others&apos; private info</li>
            <li>Spam, impersonation, or coordinated fake content</li>
            <li>Content that endangers a person, especially young people</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--foreground)]">How to report</h2>
          <p>
            Use the menu on any take → <em>Report this take</em>, pick a reason, and our
            community keepers review it. Reports are confidential.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--foreground)]">If we ask you to change</h2>
          <p>
            Take a breath, we&apos;re on your side. If a take is removed, it&apos;s to keep everyone
            — including you — safe. You can always share how you feel again, kindly.
          </p>
        </section>
      </div>

      <div className="mt-8">
        <Link href="/" className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]">
          ← Back home
        </Link>
      </div>
    </div>
  );
}
