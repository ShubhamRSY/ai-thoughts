"use client";

import { useRef } from "react";
import { Heart, Mic } from "lucide-react";
import { gsap, useGSAP, ScrollTrigger, SplitText } from "@/lib/gsap";
import { BRAND } from "@/lib/brand";

// "What you do here", acted out: a phone plays the three steps on a loop, a
// touch dot "uses" it like a screen recording, and story-style bars under it
// track the step. The phone is decorative (aria-hidden); the list carries the
// same content as real text. Without JS, or with reduced motion, the CSS shows
// the finished story (feeling, take, both replies) at rest.

const FEELINGS = ["Love it", "Amazed", "Worried", "Hurts", "Confused", "Daily"];
const PICKED = "Worried";
const TAKE =
  "I use AI at work every day. Some days I wonder what’s still mine.";
const REPLIES = [
  { who: "M", text: "Same here. You’re not alone in this." },
  { who: "J", text: "I see it differently. It gave me my evenings back." },
];
const BARS = 26;

export default function LandingDemo() {
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const root = ref.current!;
        root.classList.add("is-live");
        const steps = gsap.utils.toArray<HTMLElement>(".landing-step", root);
        const now = root.querySelector<HTMLElement>(".demo-now")!;
        const activate = (i: number) => {
          steps.forEach((s, j) => s.classList.toggle("is-active", i === j));
          now.textContent = BRAND.whatYouDo[i].title;
        };

        const words = SplitText.create(".demo-take-text", { type: "words" });
        const bars = gsap.utils.toArray<HTMLElement>(".demo-bar", root);
        const fills = gsap.utils.toArray<HTMLElement>(".demo-progress i", root);
        const timer = root.querySelector<HTMLElement>(".demo-timer")!;
        const picked = root.querySelector<HTMLElement>(".demo-chip-picked")!;
        const secs = { v: 0 };

        const reset = () => {
          picked.classList.remove("is-picked");
          gsap.set(".demo-chips .demo-chip", { autoAlpha: 0, y: 14 });
          gsap.set(".demo-pick, .demo-record-chrome", { autoAlpha: 1, y: 0 });
          gsap.set(".demo-timer", { autoAlpha: 1 });
          gsap.set(
            ".demo-record, .demo-share, .demo-thread, .demo-reply, .demo-react",
            { autoAlpha: 0 },
          );
          gsap.set(".demo-touch", { autoAlpha: 0, x: 70, y: 90, scale: 1 });
          gsap.set(".demo-thread", { scaleY: 0 });
          gsap.set(bars, { scaleY: 0.15, autoAlpha: 1 });
          gsap.set(words.words, { autoAlpha: 0, y: 8 });
          // The take rests at the top of the feed; while recording it sits mid-screen.
          gsap.set(".demo-take", { y: 70 });
          gsap.set(fills, { scaleX: 0 });
          secs.v = 0;
          timer.textContent = "0:00";
        };

        // A fingertip glides in and presses: reads like a screen recording.
        const tap = (sel: string) =>
          gsap
            .timeline()
            .to(sel, {
              autoAlpha: 1,
              x: 0,
              y: 0,
              duration: 0.7,
              ease: "power2.inOut",
            })
            .to(sel, { scale: 0.7, duration: 0.12, ease: "power1.in" })
            .to(sel, { scale: 1, duration: 0.2, ease: "power1.out" })
            .to(sel, { autoAlpha: 0, duration: 0.25 }, ">0.15");

        const tl = gsap.timeline({
          paused: true,
          repeat: -1,
          repeatDelay: 0.6,
          defaults: { ease: "power3.out" },
          onRepeat: reset,
        });

        // 1 · Pick a feeling
        tl.addLabel("s1")
          .call(() => activate(0), undefined, "s1")
          .to(
            ".demo-chips .demo-chip",
            { autoAlpha: 1, y: 0, duration: 0.45, stagger: 0.06 },
            "s1+=0.2",
          )
          .add(tap(".demo-chip-picked .demo-touch"), ">-0.1")
          .call(() => picked.classList.add("is-picked"), undefined, "<0.8")
          .to(
            ".demo-chips .demo-chip:not(.demo-chip-picked)",
            { autoAlpha: 0.35, duration: 0.35 },
            "<",
          )

          // 2 · Say it your way: the waveform talks inside the card, then becomes the words
          .addLabel("s2", "+=0.6")
          .call(() => activate(1), undefined, "s2")
          .to(".demo-pick", { autoAlpha: 0, y: -16, duration: 0.4 }, "s2")
          .to(".demo-record", { autoAlpha: 1, duration: 0.4 }, "s2+=0.15")
          .add(tap(".demo-mic .demo-touch"), "s2+=0.2")
          .to(
            ".demo-mic",
            { scale: 0.9, duration: 0.14, yoyo: true, repeat: 1 },
            "s2+=0.9",
          )
          .addLabel("talk", "s2+=1.15")
          .to(
            bars,
            {
              // Louder in the middle, like a voice; reshuffled on every beat.
              scaleY: (i: number) =>
                0.25 +
                0.75 *
                  Math.sin(((i + 1) / (BARS + 1)) * Math.PI) *
                  gsap.utils.random(0.45, 1),
              duration: 0.16,
              ease: "sine.inOut",
              repeat: 11,
              repeatRefresh: true,
              stagger: { each: 0.012, from: "center" },
            },
            "talk",
          )
          .to(
            secs,
            {
              v: 14,
              duration: 2.2,
              ease: "none",
              onUpdate: () => {
                timer.textContent = `0:${String(Math.round(secs.v)).padStart(2, "0")}`;
              },
            },
            "talk",
          )
          .to(
            bars,
            {
              scaleY: 0.05,
              autoAlpha: 0,
              duration: 0.35,
              stagger: { each: 0.008, from: "edges" },
            },
            ">",
          )
          .to(
            words.words,
            { autoAlpha: 1, y: 0, duration: 0.45, stagger: 0.055 },
            "<0.15",
          )
          .to(".demo-timer", { autoAlpha: 0, duration: 0.25 }, ">-0.2")
          .fromTo(
            ".demo-share",
            { autoAlpha: 0, y: 8 },
            { autoAlpha: 1, y: 0, duration: 0.35 },
            "<",
          )
          .add(tap(".demo-share .demo-touch"), ">")

          // 3 · Find your people: the take joins Voices; one agrees, one sees it differently
          .addLabel("s3", ">-0.15")
          .call(() => activate(2), undefined, "s3")
          .to(
            ".demo-record-chrome",
            { autoAlpha: 0, y: 12, duration: 0.3 },
            "s3",
          )
          .to(".demo-take", { y: 0, duration: 0.7 }, "s3")
          .to(
            ".demo-thread",
            { autoAlpha: 1, scaleY: 1, duration: 0.5, ease: "power2.inOut" },
            "s3+=0.6",
          )
          .fromTo(
            ".demo-reply",
            { autoAlpha: 0, y: 16 },
            {
              autoAlpha: 1,
              y: 0,
              duration: 0.5,
              ease: "back.out(1.6)",
              stagger: 0.9,
            },
            ">-0.1",
          )
          .fromTo(
            ".demo-react",
            { autoAlpha: 0, scale: 0.3 },
            { autoAlpha: 1, scale: 1, duration: 0.45, ease: "back.out(3)" },
            "<0.5",
          )
          .addLabel("end", "+=1.8")
          .to(".demo-screen-body", { autoAlpha: 0, duration: 0.35 }, "end")
          .set(".demo-screen-body", { autoAlpha: 1 }, ">");

        // Story bars: each fills across its own scene.
        const marks = [tl.labels.s1, tl.labels.s2, tl.labels.s3, tl.labels.end];
        fills.forEach((f, i) =>
          tl.to(
            f,
            { scaleX: 1, duration: marks[i + 1] - marks[i], ease: "none" },
            marks[i],
          ),
        );

        reset();
        // Play only while the phone is on screen (battery, Capacitor webviews).
        ScrollTrigger.create({
          trigger: ".demo-stage",
          start: "top 85%",
          end: "bottom 10%",
          onToggle: (self) => (self.isActive ? tl.play() : tl.pause()),
        });

        // A slow float, and on desktop a slight tilt toward the cursor, as the hero card does.
        gsap.to(".demo-float", {
          y: -8,
          duration: 3.2,
          ease: "sine.inOut",
          repeat: -1,
          yoyo: true,
        });
        const phone = root.querySelector<HTMLElement>(".demo-phone")!;
        const stage = root.querySelector<HTMLElement>(".demo-stage")!;
        let onMove: ((e: PointerEvent) => void) | undefined;
        let onLeave: (() => void) | undefined;
        if (window.matchMedia("(pointer: fine)").matches) {
          gsap.set(phone, { transformPerspective: 1000 });
          const rotX = gsap.quickTo(phone, "rotationX", {
            duration: 0.7,
            ease: "power3.out",
          });
          const rotY = gsap.quickTo(phone, "rotationY", {
            duration: 0.7,
            ease: "power3.out",
          });
          onMove = (e) => {
            const r = stage.getBoundingClientRect();
            rotY(((e.clientX - r.left) / r.width - 0.5) * 10);
            rotX(-((e.clientY - r.top) / r.height - 0.5) * 8);
          };
          onLeave = () => {
            rotX(0);
            rotY(0);
          };
          stage.addEventListener("pointermove", onMove);
          stage.addEventListener("pointerleave", onLeave);
        }

        return () => {
          if (onMove) stage.removeEventListener("pointermove", onMove);
          if (onLeave) stage.removeEventListener("pointerleave", onLeave);
          words.revert();
          root.classList.remove("is-live");
          steps.forEach((s) => s.classList.remove("is-active"));
        };
      });
    },
    { scope: ref },
  );

  return (
    <section ref={ref} className="landing-steps landing-demo">
      <div className="landing-demo-grid">
        <div>
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
        </div>

        <div className="demo-stage" aria-hidden>
          <div className="demo-float">
            <div className="demo-phone">
              <div className="demo-screen">
                <div className="demo-status">
                  <span className="demo-app">Voices</span>
                  <span className="demo-tag">Demo</span>
                </div>

                <div className="demo-screen-body">
                  <div className="demo-pick">
                    <p className="demo-prompt">
                      How does AI make you feel today?
                    </p>
                    <div className="demo-chips">
                      {FEELINGS.map((f) => (
                        <span
                          key={f}
                          className={
                            f === PICKED
                              ? "demo-chip demo-chip-picked is-picked"
                              : "demo-chip"
                          }
                        >
                          {f}
                          {f === PICKED && <span className="demo-touch" />}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="demo-record">
                    <div className="demo-take">
                      <span className="demo-chip demo-take-feeling is-picked">
                        {PICKED}
                      </span>
                      <div className="demo-voice">
                        <p className="demo-take-text">{TAKE}</p>
                        <div className="demo-wave">
                          {Array.from({ length: BARS }, (_, i) => (
                            <span key={i} className="demo-bar" />
                          ))}
                        </div>
                      </div>
                      <span className="demo-react">
                        <Heart className="h-3.5 w-3.5" fill="currentColor" />
                      </span>
                    </div>

                    <div className="demo-feed">
                      <span className="demo-thread" />
                      {REPLIES.map((r) => (
                        <div key={r.who} className="demo-reply">
                          <span className="demo-avatar">{r.who}</span>
                          <p>{r.text}</p>
                        </div>
                      ))}
                    </div>

                    <div className="demo-record-chrome">
                      <div className="demo-mic">
                        <Mic className="h-6 w-6" />
                        <span className="demo-touch" />
                      </div>
                      <div className="demo-chrome-foot">
                        <span className="demo-timer">0:14</span>
                        <span className="demo-share">
                          {BRAND.shareCta}
                          <span className="demo-touch" />
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="demo-progress">
            <span>
              <i />
            </span>
            <span>
              <i />
            </span>
            <span>
              <i />
            </span>
          </div>
          <p className="demo-now">{BRAND.whatYouDo[0].title}</p>
        </div>
      </div>
    </section>
  );
}
