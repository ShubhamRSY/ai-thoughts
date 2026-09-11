"use client";

import { useEffect } from "react";

/**
 * Keeps CSS viewport vars + native/PWA classes in sync so web, PWA, and
 * Capacitor shells share one responsive layout.
 */
export default function ViewportSync() {
  useEffect(() => {
    const root = document.documentElement;

    const sync = () => {
      const h = window.visualViewport?.height ?? window.innerHeight;
      root.style.setProperty("--app-vh", `${h * 0.01}px`);
      root.style.setProperty("--app-height", `${h}px`);

      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

      const capacitor = Boolean(
        (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
          ?.isNativePlatform?.()
      );

      root.classList.toggle("is-standalone", standalone);
      root.classList.toggle("is-native", capacitor);
      root.classList.toggle("is-app-shell", standalone || capacitor);
    };

    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    window.visualViewport?.addEventListener("resize", sync);
    window.visualViewport?.addEventListener("scroll", sync);

    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
      window.visualViewport?.removeEventListener("resize", sync);
      window.visualViewport?.removeEventListener("scroll", sync);
    };
  }, []);

  return null;
}
