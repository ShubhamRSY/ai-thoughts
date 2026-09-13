import Link from "next/link";
import { CONTACT_EMAIL, LEGAL_UPDATED } from "@/lib/site";

export default function PrivacyPage() {
  return (
    <div className="app-rail min-h-dvh py-8">
      <h1 className="font-display text-2xl font-bold text-[var(--foreground)]">Privacy</h1>
      <p className="mt-1 text-xs text-[var(--muted)]">Last updated: {LEGAL_UPDATED}</p>

      <div className="mt-6 space-y-5 text-sm leading-relaxed text-[var(--foreground)]">
        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--foreground)]">What we collect</h2>
          <p className="text-[var(--muted)]">
            When you share a take, we store the media, text, your chosen handle/display name, the
            feeling, language, tags, and a content fingerprint for integrity. If you sign in, we
            store your email encrypted at rest (linked to a profile) and send one-time sign-in
            codes to that address.
            Optional features may also store: push-notification subscriptions, email-digest
            preferences, “feel with” (follow) relationships, and in-app activity about replies or
            reactions on your takes. Region ranking uses your browser timezone/language on your
            device and is not stored as a precise location.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--foreground)]">What&apos;s public</h2>
          <p className="text-[var(--muted)]">
            Your published takes, handle, display name, and reactions are public — that&apos;s what
            makes Voices live. Your email, push endpoints, digest settings, and reports you file are
            private.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--foreground)]">How media is handled</h2>
          <p className="text-[var(--muted)]">
            Voice and video clips are uploaded to cloud storage with a public URL so others can
            play them in the feed. We compute a SHA-256 fingerprint to detect tampering.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--foreground)]">Notifications &amp; email</h2>
          <p className="text-[var(--muted)]">
            If you enable Web Push or email digests, we use them only for activity on your takes,
            people you feel with, daily nudges you opted into, and the optional weekly Voices
            digest. You can turn these off anytime in You → Daily habits.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--foreground)]">Kids &amp; all ages</h2>
          <p className="text-[var(--muted)]">
            Voices is for all ages. We encourage adults to help children understand that what they
            post is public. Never post identifying details about yourself or others.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--foreground)]">Your rights</h2>
          <p className="text-[var(--muted)]">
            You can delete your own takes from the app while signed in. You can download a copy of
            your data or wipe your account from You → Your data / Delete account. For help, use the{" "}
            <Link href="/contact" className="text-[var(--accent)] underline-offset-2 hover:underline">
              contact form
            </Link>{" "}
            or email{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-[var(--accent)] underline-offset-2 hover:underline"
            >
              {CONTACT_EMAIL}
            </a>
            . We retain minimal data needed to keep Voices safe.
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
