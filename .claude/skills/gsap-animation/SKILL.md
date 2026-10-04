---
name: gsap-animation
description: Use when adding or changing motion in this app — kinetic/animated text (headline reveals, split-letter/word/line effects, scramble), entrance or scroll-triggered animations, staggered lists/cards, animated components, or page transitions. Triggers on "animate", "animation", "kinetic text", "GSAP", "ScrollTrigger", "SplitText", "stagger", "reveal", "smooth motion". Not for simple hover/focus states — plain CSS transitions cover those.
---

# GSAP animation (Next.js 16 App Router + React 19)

GSAP and all its plugins (SplitText, ScrollTrigger, ScrambleText, Flip, etc.) are free, including commercial use, since v3.13.

## Before animating: pick the right tool

1. Hover, focus, or a one-shot fade/rise → **CSS**. `globals.css` already has `riseIn` / `landingRise` keyframes and a `prefers-reduced-motion` block. Reuse those.
2. Timelines, sequencing, staggers, split text, scroll-linked motion, or physics-y easing → **GSAP**.

## Setup (once)

If `gsap` isn't in `package.json` yet:

```bash
npm i gsap @gsap/react
```

Register plugins in one client module, and import from it everywhere else:

```ts
// src/lib/gsap.ts
"use client";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText);

export { gsap, useGSAP, ScrollTrigger, SplitText };
```

Only register the plugins you actually use. Add more (ScrambleTextPlugin, Flip) here when you need them.

## Rules

- **Client components only.** Any file that animates starts with `"use client"`. Keep server components as the page shell and pass content down as props.
- **Always use `useGSAP`**, never a bare `useEffect`. It reverts tweens, ScrollTriggers, and SplitText on unmount and handles React 19 strict-mode double-invoke. Pass `{ scope: containerRef }` so selector strings only match inside the component.
- **Event-handler animations** (click, hover) go through `contextSafe` so they get cleaned up too.
- **Respect reduced motion.** Wrap motion in `gsap.matchMedia()` with `(prefers-reduced-motion: no-preference)`. Reduced-motion users get the final state immediately, with no motion.
- **No flash of unstyled content.** Hide elements that animate in using CSS (`.gsap-hide { visibility: hidden }`), then reveal with `autoAlpha` (opacity + visibility). Never set the start state in JSX inline styles, or it sticks when JS fails.
- **Animate only `transform` and `opacity`** (`x`, `y`, `scale`, `rotate`, `autoAlpha`). Never animate `width`, `height`, `top`, or `left`. This app also ships in Capacitor webviews on low-end Android.
- **Fonts before splitting.** Split text after fonts load (Fraunces/Manrope come from `next/font`). SplitText's `autoSplit: true` together with `onSplit` re-splits when fonts load or the layout resizes. Return the tween from `onSplit` so it gets reverted correctly.
- **Accessibility:** SplitText adds `aria-label` to the parent and `aria-hidden` to the pieces by default. Leave that on. Never split interactive elements or long body copy.
- **Durations:** UI motion 0.2–0.6s, hero/kinetic text 0.6–1.2s. Default ease `power3.out` for entrances and `expo.out` for punchy reveals. Avoid `bounce`/`elastic` unless the user asks for them.

## Patterns

### Kinetic headline (line-masked word reveal)

```tsx
"use client";
import { useRef } from "react";
import { gsap, useGSAP, SplitText } from "@/lib/gsap";

export function KineticHeadline({ children }: { children: string }) {
  const ref = useRef<HTMLHeadingElement>(null);

  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      SplitText.create(ref.current!, {
        type: "lines,words",
        mask: "lines",
        autoSplit: true,
        onSplit: (self) => {
          gsap.set(ref.current, { autoAlpha: 1 });
          return gsap.from(self.words, {
            yPercent: 110,
            duration: 0.9,
            ease: "expo.out",
            stagger: 0.04,
          });
        },
      });
    });
    mm.add("(prefers-reduced-motion: reduce)", () => {
      gsap.set(ref.current, { autoAlpha: 1 });
    });
  }, { scope: ref });

  return <h1 ref={ref} className="gsap-hide font-display">{children}</h1>;
}
```

Variants: use `type: "chars"` with `stagger: 0.02` and `rotateX: -90, transformOrigin: "50% 100%"` for a letter flip. Use ScrambleTextPlugin (`scrambleText: { text, chars: "upperCase" }`) for a decode effect.

### Staggered entrance for lists and cards

```tsx
useGSAP(() => {
  gsap.from(".card", { y: 24, autoAlpha: 0, duration: 0.5, ease: "power3.out", stagger: 0.06 });
}, { scope: listRef, dependencies: [items.length] });
```

### Scroll-triggered reveal

```tsx
useGSAP(() => {
  gsap.utils.toArray<HTMLElement>(".reveal").forEach((el) => {
    gsap.from(el, {
      y: 40, autoAlpha: 0, duration: 0.7, ease: "power3.out",
      scrollTrigger: { trigger: el, start: "top 85%", once: true },
    });
  });
}, { scope: sectionRef });
```

Call `ScrollTrigger.refresh()` after content that changes layout finishes loading (images, async data).

### Interaction (contextSafe)

```tsx
const { contextSafe } = useGSAP({ scope: ref });
const pulse = contextSafe(() => gsap.fromTo(".icon", { scale: 0.85 }, { scale: 1, duration: 0.4, ease: "back.out(3)" }));
```

### Sequencing with a timeline

```ts
const tl = gsap.timeline({ defaults: { ease: "power3.out", duration: 0.6 } });
tl.from(".eyebrow", { autoAlpha: 0, y: 12 })
  .from(".title", { autoAlpha: 0, y: 24 }, "-=0.3")
  .from(".cta", { autoAlpha: 0, scale: 0.95 }, "<0.15");
```

## Verify

- Run `npm run dev` and load the page. There should be no hydration warnings and no flash before the animation starts.
- Turn on DevTools → Rendering → "Emulate prefers-reduced-motion: reduce". Content must show instantly.
- Navigate away and back. Animations must not stack or double up (that would mean `useGSAP` cleanup is missing).
- Run `npm run lint` and `npm run build`.
