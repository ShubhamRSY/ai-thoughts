import type { Metadata } from "next";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { CONTACT_EMAIL, LEGAL_UPDATED, getSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "DMCA / Copyright Policy",
  description: `How to send a copyright (DMCA) takedown notice to ${BRAND.shortName}.`,
  alternates: {
    canonical: "/dmca",
  },
};

export default function DmcaPage() {
  const site = getSiteUrl();

  return (
    <div className="app-rail min-h-dvh py-8">
      <h1 className="font-display text-2xl font-bold text-[var(--foreground)]">
        Copyright &amp; DMCA Policy
      </h1>
      <p className="mt-1 text-xs text-[var(--muted)]">Last updated: {LEGAL_UPDATED}</p>
      <p className="mt-2 text-sm text-[var(--muted)]">
        {BRAND.shortName} ({BRAND.name}) respects the intellectual property of others and expects its
        community to do the same. This page explains how to report content you believe infringes a
        copyright you own or control.
      </p>

      <div className="mt-6 space-y-5 text-sm leading-relaxed text-[var(--muted)]">
        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--foreground)]">1. Where to send notices</h2>
          <p className="mb-2">
            Send takedown notices and counternotices to our designated agent by email:
          </p>
          <p className="rounded-xl border border-[var(--border-base)] bg-[var(--surface)] px-4 py-3 font-mono text-xs text-[var(--foreground)]">
            {CONTACT_EMAIL}
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--foreground)]">
            2. Takedown notices
          </h2>
          <p className="mb-2">Your notice must include enough information for us to act on it:</p>
          <ul className="ml-4 list-disc space-y-1.5">
            <li>A physical or electronic signature of the copyright owner or an authorized agent.</li>
            <li>Identify the copyrighted work you believe is infringed (and, if multiple works on one page, a representative list).</li>
            <li>Identify the material you want removed and enough detail for us to locate it — for a take, the post&apos;s URL; for a comment, the conversation it appears in.</li>
            <li>Your contact details (email address, telephone number, and mail address).</li>
            <li>A statement of good faith that the material is not authorized by the owner, its agent, or the law.</li>
            <li>A statement, under penalty of perjury, that the information in your notice is accurate and that you are the owner or authorized to act on the owner&apos;s behalf.</li>
            <li>Your name and a declaration that you agree to the jurisdiction of the courts in the place where we operate, and that you accept service of process from the person who provided the claimed-infringing material.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--foreground)]">3. What happens next</h2>
          <p>
            We review notices and remove or disable access to material we believe in good faith is
            infringing, typically within two business days. Because {BRAND.shortName} content is
            public, removals are treated like moderation actions: flagged for review by our{" "}
            <Link href="/keeper" className="text-[var(--accent)] underline underline-offset-2">
              keepers
            </Link>{" "}
            and logged to our security audit trail.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--foreground)]">4. Counternotices</h2>
          <p>
            If your content was removed and you believe the removal was a mistake or misidentification,
            you may send a counternotice to the same address with: your signature; identification of
            the removed material and where it appeared; a statement of good faith that it was removed
            by mistake or misidentification; and your contact details, consent to local jurisdiction,
            and agreement to accept service of process. We forward counternotices to the original
            claimant; when no further action is filed, we may restore the content,
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--foreground)]">5. Repeat infringers</h2>
          <p>
            Accounts that repeatedly host infringing material are subject to suspension. Good-faith
            flags and removals under this policy do not count toward that, and malicious or abusive
            DMCA notices are themselves treated as abuse of the platform and are{" "}
            <Link href="/support" className="text-[var(--accent)] underline underline-offset-2">
              reportable
            </Link>
            .
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--foreground)]">6. Non-copyright abuse</h2>
          <p>
            This policy is only for copyright. For harassment, impersonation, or other community
            issues, use the report option on a take or comment, or write us on our{" "}
            <a href={`https://${site.replace(/^https?:\/\//, "")}/contact`} className="text-[var(--accent)] underline underline-offset-2">
              contact page
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}