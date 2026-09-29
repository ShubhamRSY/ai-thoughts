"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import WindowsStoreCta, { isWindowsBrowser } from "@/components/WindowsStoreCta";

function isDesktopDevice(): boolean {
  if (typeof navigator === "undefined" || typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  const mobileUa = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const narrow = window.matchMedia("(max-width: 820px)").matches;
  if (mobileUa) return false;
  if (coarse && narrow) return false;
  return true;
}

interface LandingCTAsProps {
  ctaHref: string;
  ctaLabel: string;
  installHref: string;
}

export default function LandingCTAs({
  ctaHref,
  ctaLabel,
  installHref,
}: LandingCTAsProps) {
  const [desktop, setDesktop] = useState(false);
  const [showPcNotice, setShowPcNotice] = useState(false);
  const [windows, setWindows] = useState(false);

  useEffect(() => {
    setDesktop(isDesktopDevice());
    setWindows(isWindowsBrowser());
  }, []);

  return (
    <>
      <div className="landing-ctas">
        <Link href={ctaHref} className="landing-btn landing-btn-primary">
          {ctaLabel}
        </Link>
        {windows && (
          <WindowsStoreCta
            className="contents"
            buttonClassName="landing-btn landing-btn-ghost"
            showNote={false}
          />
        )}
        {desktop ? (
          <button
            type="button"
            className="landing-btn landing-btn-ghost"
            onClick={() => setShowPcNotice(true)}
          >
            Install on phone
          </button>
        ) : (
          <Link href={installHref} className="landing-btn landing-btn-ghost">
            Install on phone
          </Link>
        )}
      </div>

      {showPcNotice && (
        <div
          className="landing-pc-notice"
          role="dialog"
          aria-modal="true"
          aria-labelledby="landing-pc-notice-title"
        >
          <div className="landing-pc-notice-card">
            <h2 id="landing-pc-notice-title" className="landing-pc-notice-title">
              Phone only
            </h2>
            <p className="landing-pc-notice-body">
              “Install on phone” isn’t for PC or laptop. Open{" "}
              <strong>aito.social</strong> on your iPhone or Android, sign in, then add it to
              your home screen.
            </p>
            <div className="landing-pc-notice-actions">
              <WindowsStoreCta buttonClassName="landing-btn landing-btn-primary w-full" />
              <button
                type="button"
                className="landing-btn landing-btn-ghost"
                onClick={() => setShowPcNotice(false)}
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
