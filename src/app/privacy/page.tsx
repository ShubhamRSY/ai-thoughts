import type { Metadata } from "next";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { CONTACT_EMAIL, OPERATOR, PRIVACY_UPDATED, getSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${BRAND.shortName} (${BRAND.name}) collects, uses, and shares your information.`,
  alternates: {
    canonical: "/privacy",
  },
};

export default function PrivacyPage() {
  const site = getSiteUrl();

  return (
    <div className="app-rail min-h-dvh py-8">
      <h1 className="font-display text-2xl font-bold text-[var(--foreground)]">
        Privacy Policy
      </h1>
      <p className="mt-1 text-xs text-[var(--muted)]">Last updated: {PRIVACY_UPDATED}</p>
      <p className="mt-2 text-sm text-[var(--muted)]">
        This policy explains how {BRAND.shortName} ({BRAND.name}) handles your information when you
        use {site.replace(/^https?:\/\//, "")} and related {BRAND.shortName} apps, including the web
        app, PWA, mobile apps, and Windows app.
      </p>

      <div className="mt-6 space-y-5 text-sm leading-relaxed text-[var(--muted)]">
        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--foreground)]">1. Who we are</h2>
          <p>
            {BRAND.name} (“{BRAND.shortName},” “we,” “us”) is a public community where adults share
            how AI makes them feel — in words, voice, or video. {BRAND.shortName} is run by{" "}
            {OPERATOR.description} based in {OPERATOR.region}, who is responsible for your information (the “data
            controller”). For privacy or data requests, email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-[var(--accent)] underline underline-offset-2">
              {CONTACT_EMAIL}
            </a>{" "}
            or use our{" "}
            <Link href="/contact" className="text-[var(--accent)] underline underline-offset-2">
              contact form
            </Link>
            .
          </p>
          <p className="mt-2 font-medium text-[var(--foreground)]">
            We do not sell your personal information, and we do not share it for advertising.
            {" "}{BRAND.shortName} shows no ads.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--foreground)]">
            2. Privacy by design (how we protect you)
          </h2>
          <p className="mb-2">
            Privacy is not only this page — it is built into how {BRAND.shortName} works:
          </p>
          <ul className="ml-4 list-disc space-y-1.5">
            <li>
              <span className="font-medium text-[var(--foreground)]">No passwords.</span> Sign-in
              uses short-lived email codes. Codes are stored hashed and expire quickly.
            </li>
            <li>
              <span className="font-medium text-[var(--foreground)]">Email protected at rest.</span>{" "}
              We protect your email address in our database and do not expose it publicly. Session
              cookies do not contain your email address.
            </li>
            <li>
              <span className="font-medium text-[var(--foreground)]">Public vs private split.</span>{" "}
              Only what you publish (takes, handle, display name, likes, replies) is public. Email,
              push-notification information, digest preferences, and reports stay private.
            </li>
            <li>
              <span className="font-medium text-[var(--foreground)]">Delete means delete.</span> When
              you remove a take or delete your account, we remove related database records and
              delete your voice, video, and avatar files from our media storage when they are
              hosted by us. Backup copies roll off within 14 days. The one exception is content
              reported for child safety, which we must preserve for law enforcement (see section
              12).
            </li>
            <li>
              <span className="font-medium text-[var(--foreground)]">PII scrubbing outbound.</span> If
              you use Translate, emails, phone numbers, and IP-looking strings are stripped before
              text leaves our servers. Report snippets for keepers are scrubbed the same way.
            </li>
            <li>
              <span className="font-medium text-[var(--foreground)]">Browser privacy controls.</span>{" "}
              The site uses security and privacy headers, including restrictions on referrers,
              framing, and browser permissions. {BRAND.shortName} does not request precise
              geolocation. Camera and microphone access is requested only when you choose to record
              content.
            </li>
            <li>
              <span className="font-medium text-[var(--foreground)]">Analytics.</span>{" "}
              {BRAND.shortName} uses Vercel Analytics to understand general usage, performance, and
              reliability of the service and to help us improve the product.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--foreground)]">
            3. Information we collect
          </h2>

          <h3 className="mt-2 font-medium text-[var(--foreground)]">Account information</h3>
          <ul className="ml-4 mt-1 list-disc space-y-1.5">
            <li>Email address</li>
            <li>Display name</li>
            <li>Handle</li>
            <li>Date you joined</li>
            <li>That you confirmed you are 18 or older, and when</li>
          </ul>
          <p className="mt-1">
            Sign-in uses a one-time code emailed to you. We do not store passwords.
          </p>

          <h3 className="mt-3 font-medium text-[var(--foreground)]">Content you share</h3>
          <p className="mt-1">Depending on what you choose to publish, we may collect:</p>
          <ul className="ml-4 mt-1 list-disc space-y-1.5">
            <li>Text</li>
            <li>Voice recordings</li>
            <li>Video recordings</li>
            <li>Feeling or emotion selections</li>
            <li>Photos</li>
            <li>Transcripts (captions) of the speech in voice and video takes</li>
            <li>Language</li>
            <li>Tags</li>
            <li>Replies</li>
            <li>Likes</li>
            <li>A content fingerprint used for integrity and abuse prevention</li>
          </ul>

          <h3 className="mt-3 font-medium text-[var(--foreground)]">Activity</h3>
          <ul className="ml-4 mt-1 list-disc space-y-1.5">
            <li>Reports you file</li>
            <li>“Feel with” relationships</li>
            <li>Optional push-notification subscriptions</li>
            <li>Optional email-digest preferences</li>
          </ul>

          <h3 className="mt-3 font-medium text-[var(--foreground)]">Camera and microphone</h3>
          <p className="mt-1">
            If you choose to create voice or video content, {BRAND.shortName} may request access to
            your device&apos;s microphone and/or camera. Access is used only for the recording
            functionality you choose to use. {BRAND.shortName} does not request access to your camera
            or microphone simply for browsing the service.
          </p>

          <h3 className="mt-3 font-medium text-[var(--foreground)]">Technical information</h3>
          <p className="mt-1">We may process:</p>
          <ul className="ml-4 mt-1 list-disc space-y-1.5">
            <li>A signed session cookie after you sign in</li>
            <li>
              Basic request and security logs, such as approximate IP information used for rate
              limiting and security
            </li>
            <li>Browser and device information needed to operate and secure the service</li>
            <li>Local storage for profile preferences and draft state</li>
            <li>Browser timezone and language for certain on-device or regional functionality</li>
          </ul>
          <p className="mt-1">
            {BRAND.shortName} does not use precise GPS location for the service.
          </p>

          <h3 className="mt-3 font-medium text-[var(--foreground)]">Analytics</h3>
          <p className="mt-1">
            {BRAND.shortName} uses{" "}
            <span className="font-medium text-[var(--foreground)]">Vercel Analytics</span> to
            understand general website usage, performance, and reliability. Analytics information may
            include page views, browser or device characteristics, and other information used to
            measure and improve the service. It is used for product improvement, troubleshooting,
            and understanding general usage patterns.
          </p>

          <h3 className="mt-3 font-medium text-[var(--foreground)]">Optional translation</h3>
          <p className="mt-1">
            If you choose “Translate,” a PII-scrubbed copy of that text is sent to our translation
            provider. Emails, phone numbers, and IP-looking strings are stripped before the text is
            sent.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--foreground)]">
            4. How we use your information
          </h2>
          <p className="mb-2">We use information to:</p>
          <ul className="ml-4 list-disc space-y-1.5">
            <li>Run the service, including accounts, publishing, feeds, replies, and likes</li>
            <li>Send sign-in codes</li>
            <li>Send optional email digests or push notifications when you opt in</li>
            <li>
              Keep the community safe through dignity checks, reports, rate limits, and integrity
              protections
            </li>
            <li>Measure service usage and performance through analytics</li>
            <li>Detect, remove, and report child sexual exploitation, as the law requires</li>
            <li>Improve reliability and fix bugs</li>
            <li>Respond to privacy, account, or removal requests</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--foreground)]">5. What&apos;s public</h2>
          <p>
            Published takes, your handle, display name, likes, and replies are{" "}
            <span className="font-medium text-[var(--foreground)]">public</span> and may be viewed
            by anyone. Your email address, push-notification information, digest settings, session
            information, and reports you file are not displayed publicly.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--foreground)]">
            6. How media is handled
          </h2>
          <p>
            When you choose to upload or record voice, video, or avatar content, the resulting media
            is stored in cloud object storage used by {BRAND.shortName}. Voice, video, and photo
            takes are kept in private storage: they play only through short-lived links that{" "}
            {BRAND.shortName} gives to people allowed to see the take, and those links expire within
            about an hour. Avatars are public, because anyone can see them next to your handle.
          </p>
          <p className="mt-2">
            To keep the community safe, the text and photos in a take, and the speech in voice and
            video takes, may be sent to OpenAI for automated screening against our guidelines. The
            speech is transcribed to do this, and the transcript is shown as captions on the take. A
            take flagged by screening is hidden until a keeper reviews it.
          </p>
          <p className="mt-2">
            When you delete a take or your account, we delete the related media files from our
            storage when those files are hosted by us and are within our control to delete. The same
            applies when a keeper removes a take or suspends an account. We may
            compute a SHA-256 fingerprint of media or text to help detect tampering, duplicates, or
            abuse.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--foreground)]">
            7. Cookies and similar technologies
          </h2>
          <p>
            We use an essential session cookie so you can remain signed in. We may also use browser
            local storage for functionality such as profile preferences and draft state.
          </p>
          <p className="mt-2">
            You can clear cookies and local storage through your browser or device settings.
            Clearing these may sign you out or remove locally stored preferences and drafts.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--foreground)]">
            8. Service providers
          </h2>
          <p className="mb-2">
            These companies process information for us, only to provide their service to{" "}
            {BRAND.shortName}:
          </p>
          <ul className="ml-4 list-disc space-y-1.5">
            <li>
              <span className="font-medium text-[var(--foreground)]">Vercel</span> — hosting, file
              storage for media and backups, and privacy-friendly usage analytics
            </li>
            <li>
              <span className="font-medium text-[var(--foreground)]">MongoDB Atlas</span> — our
              database
            </li>
            <li>
              <span className="font-medium text-[var(--foreground)]">Resend</span> — sign-in codes,
              sign-in alerts, and optional digest emails
            </li>
            <li>
              <span className="font-medium text-[var(--foreground)]">Upstash</span> — short-lived
              rate-limit counters keyed by IP address, to stop abuse
            </li>
            <li>
              <span className="font-medium text-[var(--foreground)]">Cloudflare Turnstile</span> — a
              check at sign-in that you&apos;re not a bot
            </li>
            <li>
              <span className="font-medium text-[var(--foreground)]">Sentry</span> — error reports so
              we can fix bugs; emails and sign-in tokens are removed before they are sent
            </li>
            <li>
              <span className="font-medium text-[var(--foreground)]">OpenAI</span> — automated
              screening of takes and transcription of speech (see section 6). Under OpenAI&apos;s API
              terms this data is not used to train its models
            </li>
            <li>
              <span className="font-medium text-[var(--foreground)]">MyMemory (Translated)</span> —
              only when you tap Translate, with personal details stripped first
            </li>
          </ul>
          <p className="mt-2">
            Each is bound by its own terms and privacy policy. We may also disclose information when
            the law requires it, for example to report child sexual exploitation to NCMEC.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--foreground)]">
            9. Where data is stored
          </h2>
          <p>
            {BRAND.shortName} uses cloud infrastructure operated by our service providers. Our
            primary application and database infrastructure is hosted in the{" "}
            <span className="font-medium text-[var(--foreground)]">United States</span>. Uploaded
            voice, video, and avatar media are stored using cloud object storage.
          </p>
          <p className="mt-2">
            Some service providers may process or store information in other countries where they
            operate. As a result, information may be transferred to and processed in countries other
            than the country where you live.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--foreground)]">
            10. How long we keep it
          </h2>
          <ul className="ml-4 list-disc space-y-1.5">
            <li>Your account, takes, replies, and profile: until you delete them or your account</li>
            <li>Database backups: 14 days, then overwritten</li>
            <li>Sign-in codes: 10 minutes</li>
            <li>Sign-in sessions: up to 90 days, or until you sign out</li>
            <li>Notifications: 90 days</li>
            <li>Records of who viewed a take (for view counts): 30 days</li>
            <li>Rate-limit counters: up to 1 hour</li>
            <li>Security logs of account and moderation actions: 1 year</li>
            <li>Messages sent through the contact form: 1 year</li>
            <li>Reports: until resolved, then 1 year</li>
            <li>
              Content reported for child sexual exploitation: preserved for 1 year for law
              enforcement, or longer if they ask us to
            </li>
            <li>Error reports at Sentry: deleted automatically, typically within 90 days</li>
            <li>
              Content sent to OpenAI for screening: kept by OpenAI for up to 30 days for abuse
              monitoring, then deleted
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--foreground)]">
            11. Your rights and choices
          </h2>
          <p className="mb-2">Wherever you live, you can:</p>
          <ul className="ml-4 list-disc space-y-1.5">
            <li>Delete your own takes while signed in</li>
            <li>
              Download a copy of your data (access and portability) or delete your account, from You
              → Your privacy
            </li>
            <li>Correct your name, handle, and profile at any time</li>
            <li>Turn off push notifications or email digests in You → Daily habits</li>
            <li>
              Ask us anything about your data, or ask us to restrict or stop processing it, by
              emailing{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-[var(--accent)] underline underline-offset-2">
                {CONTACT_EMAIL}
              </a>
              . We reply within 30 days.
            </li>
          </ul>
          <p className="mt-2">
            <span className="font-medium text-[var(--foreground)]">EU, UK, and similar laws (GDPR).</span>{" "}
            We use your information to provide the service you signed up for (contract); to keep it
            safe, secure, and working (legitimate interests); for push notifications, digests, and
            camera or microphone use only with your consent, which you can withdraw at any time; and
            to meet legal duties such as child-safety reporting. You can also object to processing
            based on legitimate interests, and complain to your data-protection authority.
          </p>
          <p className="mt-2">
            <span className="font-medium text-[var(--foreground)]">California (CCPA/CPRA).</span>{" "}
            You have the right to know what we collect, to delete it, to correct it, and not to be
            treated differently for using these rights. We do not sell or share personal
            information, and we do not use sensitive information beyond running the service.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--foreground)]">
            12. Adults only, and child safety
          </h2>
          <p>
            {BRAND.shortName} is for people 18 and older, and you confirm your age each time you sign
            in. We do not knowingly collect information from anyone under 18. If we learn an account
            belongs to someone under 18, we delete it. Parents or guardians can email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-[var(--accent)] underline underline-offset-2">
              {CONTACT_EMAIL}
            </a>{" "}
            to ask us to remove a child&apos;s account or content.
          </p>
          <p className="mt-2">
            Content that sexually exploits or endangers children is hidden as soon as it is
            reported. We preserve it and report it to the National Center for Missing &amp;
            Exploited Children (NCMEC) and law enforcement, as required by law.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--foreground)]">
            13. International users
          </h2>
          <p>
            {BRAND.shortName} may process and store information in the United States and other
            countries where our service providers operate. If you use {BRAND.shortName} from outside
            those locations, your information may be transferred to and processed in those
            countries.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--foreground)]">14. Security</h2>
          <p>
            We use reasonable technical and organizational measures designed to protect information,
            including HTTPS encryption in transit, protection of sensitive identifiers, hashed
            authentication codes, and restricted access to operational data.
          </p>
          <p className="mt-2">
            No method of transmission or storage is completely secure. Please protect access to your
            email account and never share your {BRAND.shortName} sign-in codes with anyone.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--foreground)]">
            15. Changes to this policy
          </h2>
          <p>
            We may update this Privacy Policy from time to time. When we make changes, we will update
            the “Last updated” date at the top of this policy. Material changes may also be
            communicated through the app or by email when appropriate. Your continued use of{" "}
            {BRAND.shortName} after an updated policy becomes effective means that you acknowledge
            the updated policy.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--foreground)]">16. Contact</h2>
          <p>
            {BRAND.shortName} is run by {OPERATOR.description} based in {OPERATOR.region}. For
            privacy and data requests, email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-[var(--accent)] underline underline-offset-2">
              {CONTACT_EMAIL}
            </a>{" "}
            or use our{" "}
            <Link href="/contact" className="text-[var(--accent)] underline underline-offset-2">
              contact form
            </Link>
            .
          </p>
          <p className="mt-2">
            Privacy Policy:{" "}
            <a
              href={`${site}/privacy`}
              className="break-all text-[var(--accent)] underline underline-offset-2"
            >
              {site}/privacy
            </a>
          </p>
          <p className="mt-1">
            Contact:{" "}
            <a
              href={`${site}/contact`}
              className="break-all text-[var(--accent)] underline underline-offset-2"
            >
              {site}/contact
            </a>
          </p>
        </section>
      </div>

      <div className="mt-8 flex flex-wrap gap-4 text-xs text-[var(--muted)]">
        <Link href="/terms" className="hover:text-[var(--foreground)]">
          Terms of Use
        </Link>
        <Link href="/guidelines" className="hover:text-[var(--foreground)]">
          Guidelines
        </Link>
        <Link href="/" className="hover:text-[var(--foreground)]">
          ← Back home
        </Link>
      </div>
    </div>
  );
}
