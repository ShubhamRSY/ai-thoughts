"use client";

import { useEffect, useState } from "react";
import { X, Download } from "lucide-react";

const DISMISS_KEY = "pwa-install-dismissed";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export default function PWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [isIos] = useState(() => isIOS());

  useEffect(() => {
    if (isStandalone()) return;
    if (localStorage.getItem(DISMISS_KEY)) return;

    const timer = setTimeout(() => {
      if (!isStandalone() && !localStorage.getItem(DISMISS_KEY)) {
        setShow(true);
      }
    }, 25000);

    function handler(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as unknown as BeforeInstallPromptEvent);
    }

    window.addEventListener("beforeinstallprompt", handler as EventListener);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", handler as EventListener);
    };
  }, []);

  if (!show || isStandalone()) return null;

  function dismiss() {
    setShow(false);
    localStorage.setItem(DISMISS_KEY, "1");
  }

  async function install() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    if (result.outcome === "accepted") dismiss();
  }

  return (
    <div className="fixed inset-x-0 bottom-20 z-50 flex justify-center px-4">
      <div className="w-full max-w-[390px] rounded-2xl border border-[var(--border-base)] bg-[var(--surface)] p-3 shadow-lg shadow-slate-900/5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)]">
            <Download className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm font-semibold text-[var(--foreground)]">
              Install AI·Thoughts
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted)]">
              {isIos || (!deferredPrompt && isIOS())
                ? "Tap Share in Safari, then “Add to Home Screen”"
                : "Add to your home screen — one tap back to the pulse"}
            </p>
            {!isIos && deferredPrompt && (
              <button
                onClick={install}
                className="mt-2 rounded-lg bg-[var(--accent)] px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-[var(--accent-2)] active:scale-[0.98]"
              >
                Install now
              </button>
            )}
          </div>
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="mt-0.5 shrink-0 rounded-lg p-1.5 text-[var(--muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
