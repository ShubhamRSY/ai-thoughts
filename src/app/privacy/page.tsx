export default function PrivacyPage() {
  return (
    <div className="mx-auto min-h-dvh w-full max-w-[430px] px-5 py-8">
      <h1 className="text-2xl font-bold text-zinc-100">Privacy</h1>
      <p className="mt-1 text-xs text-zinc-500">Last updated: {date()}</p>

      <div className="mt-6 space-y-5 text-sm leading-relaxed text-zinc-300">
        <section>
          <h2 className="mb-1 text-base font-semibold text-zinc-100">What we collect</h2>
          <p>
            When you share a take, we store the media, text, your chosen handle/display name, the
            feeling, language, tags, and a content fingerprint for integrity. If you sign in, we
            store your email linked to a profile.
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
            You can delete your own takes and request removal of your data by contacting the
            community keepers. We retain minimal data needed to keep the pulse safe.
          </p>
        </section>
      </div>
    </div>
  );
}

function date(): string {
  return new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
