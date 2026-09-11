import Link from "next/link";
import { LEGAL_UPDATED } from "@/lib/site";

export default function TermsPage() {
  return (
    <div className="mx-auto min-h-dvh w-full max-w-[430px] px-5 py-8">
      <h1 className="font-display text-2xl font-bold text-[var(--foreground)]">Terms of Use</h1>
      <p className="mt-1 text-xs text-[var(--muted)]">Last updated: {LEGAL_UPDATED}</p>

      <div className="mt-6 space-y-5 text-sm leading-relaxed text-[var(--muted)]">
        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--foreground)]">1. What the pulse is</h2>
          <p>
            AI·Thoughts is a public space where people of all ages share how AI makes them feel —
            by voice, video, or words. It&apos;s a pulse: live, open, and honest.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--foreground)]">2. Your takes are public</h2>
          <p>
            Anything you share appears publicly and may be seen, reacted to, and echoed by others.
            Don&apos;t post anything you wouldn&apos;t want a stranger to see or hear. All-ages rules
            apply — keep it kind.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--foreground)]">3. Content and conduct</h2>
          <p>
            You&apos;re responsible for what you post. We won&apos;t tolerate hate, harassment,
            explicit content, doxxing, or anything that harms someone. Community keepers review
            reports and can remove takes.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--foreground)]">4. Accounts</h2>
          <p>
            Sign-in uses a one-time code emailed to you. Don&apos;t share codes. Impersonation or
            abuse of accounts may lead to removal from the pulse.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--foreground)]">5. No guarantee</h2>
          <p>
            The service is provided &ldquo;as is&rdquo; and &ldquo;as available.&rdquo; We may change,
            pause, or end features at any time. We aren&apos;t liable for content posted by users or
            for the availability of the service.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--foreground)]">6. Changes</h2>
          <p>
            We may update these terms from time to time. Continuing to use the pulse means you
            accept the latest version.
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
