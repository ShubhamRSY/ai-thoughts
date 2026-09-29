"use client";

import { useEffect, useRef } from "react";

// Cloudflare Turnstile on the request-code step. Off until
// NEXT_PUBLIC_TURNSTILE_SITE_KEY (and TURNSTILE_SECRET_KEY on the server) are set.
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
export const turnstileEnabled = Boolean(SITE_KEY);

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  remove: (id: string) => void;
};

/**
 * Tokens are single-use: remount it (change its `key`) after each request to
 * get a fresh one. `onToken` must be stable (a useState setter is).
 */
export default function Turnstile({ onToken }: { onToken: (token: string | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!SITE_KEY) return;
    let id: string | undefined;
    let cancelled = false;
    const api = () => (window as unknown as { turnstile?: TurnstileApi }).turnstile;
    const mount = () => {
      if (cancelled || !ref.current || !api()) return;
      id = api()!.render(ref.current, {
        sitekey: SITE_KEY,
        callback: (t: string) => onToken(t),
        "expired-callback": () => onToken(null),
        "error-callback": () => onToken(null),
      });
    };
    let script = document.querySelector<HTMLScriptElement>("script[data-turnstile]");
    if (api()) mount();
    else {
      if (!script) {
        script = document.createElement("script");
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.dataset.turnstile = "1";
        document.head.appendChild(script);
      }
      script.addEventListener("load", mount);
    }
    return () => {
      cancelled = true;
      script?.removeEventListener("load", mount);
      if (id) api()?.remove(id);
      onToken(null);
    };
  }, [onToken]);

  if (!SITE_KEY) return null;
  return <div ref={ref} className="flex justify-center" />;
}
