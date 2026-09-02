"use client";

import { useEffect } from "react";

export default function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // Register immediately rather than waiting for window "load" — React can
    // mount after load has already fired, which would skip registration forever.
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}