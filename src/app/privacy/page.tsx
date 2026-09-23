import type { Metadata } from "next";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { PRIVACY_UPDATED, getSiteUrl } from "@/lib/site";

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
            {BRAND.name} (“{BRAND.shortName},” “we,” “us”) is a public community where people share how
            AI makes them feel — in words, voice, or video. For privacy or data requests, use our{" "}
            <Link href="/contact" className="text-[var(--accent)] underline-offset-2 hover:underline">
              contact form
            </Link>
            .
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
              hosted by us.
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
            is stored in cloud object storage used by {BRAND.shortName}. Published voice and video
            may be served through a public URL so other users can play the content in the feed.
          </p>
          <p className="mt-2">
            When you delete a take or your account, we delete the related media files from our
            storage when those files are hosted by us and are within our control to delete. We may
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
            We use service providers to host and operate {BRAND.shortName}, including providers for:
          </p>
          <ul className="ml-4 list-disc space-y-1.5">
            <li>Application hosting and serverless compute</li>
            <li>Database storage</li>
            <li>Cloud media/object storage</li>
            <li>Transactional email for sign-in codes and optional digests</li>
            <li>Analytics</li>
            <li>Optional translation</li>
          </ul>
          <p className="mt-2">
            These providers process information as necessary to provide their services to{" "}
            {BRAND.shortName} and are subject to their own terms, privacy policies, and security
            practices.
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
            10. Retention and your choices
          </h2>
          <p>
            Public posts remain available until you delete them or we remove them for safety or
            policy reasons. Session information is retained while needed to keep you signed in.
            One-time sign-in codes expire after a short period.
          </p>
          <p className="mb-2 mt-2">You can:</p>
          <ul className="ml-4 list-disc space-y-1.5">
            <li>Delete your own takes while signed in</li>
            <li>
              Download a copy of your data or delete your account from You → Your privacy
            </li>
            <li>Turn off push notifications or email digests in You → Daily habits</li>
            <li>
              Contact us about privacy or data requests through our{" "}
              <Link href="/contact" className="text-[var(--accent)] underline-offset-2 hover:underline">
                contact form
              </Link>
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--foreground)]">
            11. Children and families
          </h2>
          <p>
            {BRAND.shortName} is intended for a broad audience. If you are under the age at which
            you can legally agree to online services in your country, ask a parent or guardian
            before using {BRAND.shortName}.
          </p>
          <p className="mt-2">
            Do not post names, addresses, school details, phone numbers, or other identifying
            information about yourself or others. Parents or guardians can contact us to request
            removal of a child&apos;s account or content.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--foreground)]">
            12. International users
          </h2>
          <p>
            {BRAND.shortName} may process and store information in the United States and other
            countries where our service providers operate. If you use {BRAND.shortName} from outside
            those locations, your information may be transferred to and processed in those
            countries.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--foreground)]">13. Security</h2>
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
            14. Changes to this policy
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
          <h2 className="mb-1 text-base font-semibold text-[var(--foreground)]">15. Contact</h2>
          <p>
            For privacy and data requests, use our{" "}
            <Link href="/contact" className="text-[var(--accent)] underline-offset-2 hover:underline">
              contact form
            </Link>
            .
          </p>
          <p className="mt-2">
            Privacy Policy:{" "}
            <a
              href={`${site}/privacy`}
              className="break-all text-[var(--accent)] underline-offset-2 hover:underline"
            >
              {site}/privacy
            </a>
          </p>
          <p className="mt-1">
            Contact:{" "}
            <a
              href={`${site}/contact`}
              className="break-all text-[var(--accent)] underline-offset-2 hover:underline"
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
