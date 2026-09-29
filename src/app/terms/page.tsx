import Link from "next/link";
import type { Metadata } from "next";
import { CONTACT_EMAIL, LEGAL_UPDATED, OPERATOR } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of Use — AI·Thoughts",
  description: "The terms for sharing and using AI·Thoughts, the public pulse for how AI makes people feel.",
};

export default function TermsPage() {
  return (
    <div className="app-rail min-h-dvh py-8">
      <h1 className="font-display text-2xl font-bold text-[var(--foreground)]">Terms of Use</h1>
      <p className="mt-1 text-xs text-[var(--muted)]">Last updated: {LEGAL_UPDATED}</p>

      <div className="mt-6 space-y-5 text-sm leading-relaxed text-[var(--muted)]">
        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--foreground)]">1. What the pulse is</h2>
          <p>
            AI·Thoughts (AiTo) is a public space where adults share how AI makes them feel — by
            voice, video, or words. It&apos;s a pulse: live, open, and honest. It is run by{" "}
            {OPERATOR.description} based in {OPERATOR.region}, and you can reach us at{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-[var(--accent)] underline underline-offset-2">
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--foreground)]">2. Your takes are public</h2>
          <p>
            Anything you share appears publicly and may be seen, reacted to, and echoed by others.
            Don&apos;t post anything you wouldn&apos;t want a stranger to see or hear. Keep it kind.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--foreground)]">3. Content and conduct</h2>
          <p>
            You&apos;re responsible for what you post. We won&apos;t tolerate hate, harassment,
            explicit content, doxxing, or anything that harms someone. Community keepers review
            reports and can remove takes.
          </p>
          <p className="mt-2">
            There is zero tolerance for objectionable content and abusive users. You can report any
            take, comment, or account, and block anyone. We act on reports within 24 hours: content
            that breaks these rules is removed and the accounts behind it are suspended. Only post
            what you have the right to share — copyright owners can send takedown requests through
            our <Link href="/dmca" className="text-[var(--accent)] underline underline-offset-2">DMCA page</Link>.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--foreground)]">4. Child safety</h2>
          <p>
            Content that sexualises, exploits, grooms, or endangers anyone under 18 is banned
            without exception. It is hidden as soon as it&apos;s reported, removed, and the account
            behind it is suspended. We preserve evidence and report child sexual exploitation to
            the National Center for Missing &amp; Exploited Children (NCMEC) and to law
            enforcement. If you see it, report it with the <em>Child safety</em> reason. If a child
            is in immediate danger, contact your local emergency services first.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--foreground)]">5. Accounts and age</h2>
          <p>
            You must be 18 or older to use AiTo; you confirm this every time you sign in. We close
            any account we learn belongs to someone under 18. Sign-in uses a one-time code emailed
            to you. Don&apos;t share codes. Impersonation or abuse of accounts may lead to removal
            from the pulse.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--foreground)]">6. No guarantee</h2>
          <p>
            The service is provided &ldquo;as is&rdquo; and &ldquo;as available.&rdquo; We may change,
            pause, or end features at any time. We aren&apos;t liable for content posted by users or
            for the availability of the service.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--foreground)]">7. Governing law</h2>
          <p>
            These terms are governed by the laws of {OPERATOR.governingLaw}. Nothing here takes away
            rights you have under the consumer-protection laws of the place you live.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--foreground)]">8. Changes</h2>
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
