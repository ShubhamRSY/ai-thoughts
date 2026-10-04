"use client";

import { useRef, type ReactNode } from "react";
import { gsap, useGSAP, SplitText } from "@/lib/gsap";

// Wraps the landing <main> and choreographs its entrance. The hero is hidden
// by CSS (.landing-hero, no-preference only) until this reveals it.
export default function LandingMotion({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    (_, contextSafe) => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      const intro = contextSafe!(() => {
        const name = SplitText.create(".landing-name", { type: "chars", mask: "chars" });
        const headline = SplitText.create(".landing-headline", {
          type: "lines,words",
          mask: "lines",
        });

        gsap.set(".landing-hero", { autoAlpha: 1 });

        gsap
          .timeline({
            defaults: { ease: "power3.out" },
            // Hand the text back as plain DOM so it reflows on resize.
            onComplete: () => {
              name.revert();
              headline.revert();
            },
          })
          .from(".landing-mark", { scale: 0.6, rotate: -25, autoAlpha: 0, duration: 0.8, ease: "back.out(2)" })
          .from(name.chars, { yPercent: 110, duration: 0.7, ease: "expo.out", stagger: 0.035 }, "<0.15")
          .from(headline.words, { yPercent: 110, duration: 0.9, ease: "expo.out", stagger: 0.045 }, "<0.25")
          .from(".landing-support, .landing-crowd, .landing-ctas", { y: 16, autoAlpha: 0, duration: 0.6, stagger: 0.09 }, "-=0.55")
          .from(".landing-visual", { scale: 0.92, autoAlpha: 0, duration: 1.1 }, 0.2)
          .from(".landing-visual-caption", { y: 10, autoAlpha: 0, duration: 0.5 }, "-=0.4");

        // Slow ambient drift on the orbs.
        gsap.utils.toArray<HTMLElement>(".landing-orb").forEach((orb, i) => {
          gsap.to(orb, {
            x: gsap.utils.random(-18, 18),
            y: gsap.utils.random(-22, 22),
            duration: 5 + i * 1.5,
            ease: "sine.inOut",
            repeat: -1,
            yoyo: true,
          });
        });

        // "70+ people…" counts up from 0.
        const crowd = ref.current!.querySelector<HTMLElement>(".landing-crowd")!;
        // Keep the server text: strict mode runs this twice and we overwrite it below.
        crowd.dataset.text ??= crowd.textContent!;
        const match = crowd.dataset.text.match(/^([\d,]+)(.*)$/);
        if (match) {
          const target = Number(match[1].replace(/,/g, ""));
          const n = { v: 0 };
          crowd.textContent = "0" + match[2];
          gsap.to(n, {
            v: target,
            duration: 1.6,
            delay: 1,
            ease: "power2.out",
            onUpdate: () => {
              crowd.textContent = Math.round(n.v).toLocaleString() + match[2];
            },
          });
        }

        // Hero card drifts up and eases back as you scroll past it.
        gsap.to(".landing-visual", {
          yPercent: -8,
          ease: "none",
          scrollTrigger: { trigger: ".landing-hero", start: "top top", end: "bottom top", scrub: true },
        });

        // Card tilts toward the cursor; the pulse floats the other way for depth.
        if (window.matchMedia("(pointer: fine)").matches) {
          const visual = ref.current!.querySelector<HTMLElement>(".landing-visual")!;
          gsap.set(visual, { transformPerspective: 900 });
          const rotX = gsap.quickTo(visual, "rotationX", { duration: 0.6, ease: "power3.out" });
          const rotY = gsap.quickTo(visual, "rotationY", { duration: 0.6, ease: "power3.out" });
          const pulseX = gsap.quickTo(".landing-pulse", "x", { duration: 0.8, ease: "power3.out" });
          const pulseY = gsap.quickTo(".landing-pulse", "y", { duration: 0.8, ease: "power3.out" });

          visual.addEventListener("pointermove", (e) => {
            const r = visual.getBoundingClientRect();
            const px = (e.clientX - r.left) / r.width - 0.5;
            const py = (e.clientY - r.top) / r.height - 0.5;
            rotY(px * 8);
            rotX(-py * 8);
            pulseX(px * 24);
            pulseY(py * 24);
          });
          visual.addEventListener("pointerleave", () => {
            rotX(0);
            rotY(0);
            pulseX(0);
            pulseY(0);
          });
        }

        gsap
          .timeline({ scrollTrigger: { trigger: ".landing-steps", start: "top 85%", once: true } })
          .from(".landing-steps-title, .landing-step", { y: 28, autoAlpha: 0, duration: 0.7, stagger: 0.1 })
          .from(".landing-step-num", { scale: 0, rotate: -90, duration: 0.6, ease: "back.out(2.5)", stagger: 0.1 }, 0.2);
      });

      // Split only after Fraunces/Manrope are in, or line breaks are wrong.
      document.fonts.ready.then(intro);
    },
    { scope: ref },
  );

  return (
    <main ref={ref} className="landing-inner">
      {children}
    </main>
  );
}
