import Link from "next/link";
import Footer from "@/components/Footer";
import BrandMark from "@/components/BrandMark";
import { getPulseStats } from "@/lib/pulse-stats";
import { getSession } from "@/lib/auth";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const [{ total }, session] = await Promise.all([
    getPulseStats(),
    getSession(),
  ]);

  const ctaHref = session ? "/app" : "/sign-in";
  const ctaLabel = session ? BRAND.openCta : BRAND.joinCta;
  const installHref = session ? "/install" : "/sign-in?next=/install";
  const crowdLine = session
    ? `Welcome back${session.displayName ? `, ${session.displayName}` : ""}.`
    : total < 25
      ? "Be one of the first to say how AI feels."
      : `${total.toLocaleString()} people already expressing themselves.`;

  return (
    <div className="landing">
      <div className="landing-glow" aria-hidden />

      <main className="landing-inner">
        <section className="landing-hero">
          <div className="landing-copy">
            <div className="landing-brand">
              <div className="landing-mark">
                <BrandMark className="h-full w-full" />
              </div>
              <h1 className="landing-name">{BRAND.shortName}</h1>
            </div>

            <p className="landing-headline">{BRAND.tagline}</p>
            <p className="landing-support">{BRAND.promise}</p>
            <p className="landing-crowd">{crowdLine}</p>

            <div className="landing-ctas">
              <Link href={ctaHref} className="landing-btn landing-btn-primary">
                {ctaLabel}
              </Link>
              <Link href={installHref} className="landing-btn landing-btn-ghost">
                Install on phone
              </Link>
            </div>
            {!session && (
              <p className="landing-note">Email code · no password</p>
            )}
          </div>

          <div className="landing-visual" aria-hidden>
            <div className="landing-orb landing-orb-a" />
            <div className="landing-orb landing-orb-b" />
            <div className="landing-orb landing-orb-c" />
            <div className="landing-pulse">
              <span className="landing-pulse-ring" />
              <span className="landing-pulse-ring landing-pulse-ring-2" />
              <span className="landing-pulse-core">
                <BrandMark className="h-14 w-14 sm:h-16 sm:w-16 lg:h-20 lg:w-20" />
              </span>
            </div>
            <p className="landing-visual-caption">Voices · feelings · live</p>
          </div>
        </section>

        <section className="landing-steps">
          <h2 className="landing-steps-title">What you do here</h2>
          <ol className="landing-steps-grid">
            {BRAND.whatYouDo.map((step, i) => (
              <li key={step.title} className="landing-step">
                <span className="landing-step-num">{i + 1}</span>
                <div>
                  <p className="landing-step-title">{step.title}</p>
                  <p className="landing-step-body">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <div className="landing-footer-wrap">
        <Footer />
      </div>
    </div>
  );
}
