import Footer from "@/components/Footer";
import BrandMark from "@/components/BrandMark";
import LandingCTAs from "@/components/LandingCTAs";
import LandingMotion from "@/components/LandingMotion";
import { getPulseStats, crowdCountLabel } from "@/lib/pulse-stats";
import { getSession } from "@/lib/auth";
import { BRAND } from "@/lib/brand";
import { getSiteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const [{ total }, session] = await Promise.all([
    getPulseStats(),
    getSession(),
  ]);

  const ctaHref = "/app";
  const ctaLabel = BRAND.openCta;
  const installHref = "/install";
  const crowdLine = session
    ? `Welcome back${session.displayName ? `, ${session.displayName}` : ""}.`
    : crowdCountLabel(total);

  const siteUrl = getSiteUrl();
  // Structured data so search engines can name the site and its app.
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebSite", name: BRAND.name, alternateName: BRAND.shortName, url: siteUrl, description: BRAND.promise },
      {
        "@type": "WebApplication",
        name: BRAND.name,
        url: siteUrl,
        applicationCategory: "SocialNetworkingApplication",
        operatingSystem: "Web, iOS, Android, Windows",
        description: BRAND.tagline,
        audience: { "@type": "PeopleAudience", suggestedMinAge: 18 },
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      },
    ],
  };

  return (
    <div className="landing">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <div className="landing-glow" aria-hidden />

      <noscript>
        <style>{`.landing-hero{visibility:visible!important}`}</style>
      </noscript>

      <LandingMotion>
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

            <LandingCTAs
              ctaHref={ctaHref}
              ctaLabel={ctaLabel}
              installHref={installHref}
            />
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
      </LandingMotion>

      <div className="landing-footer-wrap">
        <Footer />
      </div>
    </div>
  );
}
