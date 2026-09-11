import Link from "next/link";
import { CONTACT_EMAIL, LEGAL_UPDATED } from "@/lib/site";

export default function PrivacyPage() {
  return (
    <div className="mx-auto min-h-dvh w-full max-w-[430px] px-5 py-8">
      <h1 className="text-2xl font-bold text-zinc-100">Privacy</h1>
      <p className="mt-1 text-xs text-zinc-500">Last updated: {LEGAL_UPDATED}</p>

      <div className="mt-6 space-y-5 text-sm leading-relaxed text-zinc-300">
        <section>
          <h2 className="mb-1 text-base font-semibold text-zinc-100">What we collect</h2>
          <p>
            When you share a take, we store the media, text, your chosen handle/display name, the
            feeling, language, tags, and a content fingerprint for integrity. If you sign in, we
            store your email linked to a profile and send one-time sign-in codes to that address.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-zinc-100">What&apos;s public</h2>
          <p>
            Your published takes, handle, display name, and reactions are public — that&apos;s what
            makes the pulse live. Your email (if you sign in) and reports you file are private.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-zinc-100">How media is handled</h2>
          <p>
            Voice and video clips are uploaded to cloud storage with a public URL so others can
            play them in the feed. We compute a SHA-256 fingerprint to detect tampering.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-zinc-100">Kids &amp; all ages</h2>
          <p>
            The pulse is for all ages. We encourage adults to help children understand that what
            they post is public. Never post identifying details about yourself or others.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-zinc-100">Your rights</h2>
          <p>
            You can delete your own takes and request removal of your data. Use the{" "}
            <Link href="/contact" className="text-violet-400 underline-offset-2 hover:underline">
              contact form
            </Link>{" "}
            or email{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-violet-400 underline-offset-2 hover:underline"
            >
              {CONTACT_EMAIL}
            </a>
            . We retain minimal data needed to keep the pulse safe.
          </p>
        </section>
      </div>

      <div className="mt-8">
        <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-300">
          ← Back home
        </Link>
      </div>
    </div>
  );
}
