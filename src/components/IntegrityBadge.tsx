"use client";

import { useState } from "react";
import { ShieldCheck, ShieldAlert, Check } from "lucide-react";
import type { Integrity } from "@/lib/types";

interface IntegrityBadgeProps {
  integrity: Integrity;
}

export default function IntegrityBadge({ integrity }: IntegrityBadgeProps) {
  const [copied, setCopied] = useState(false);
  const verified = integrity.verified;

  const copyHash = async () => {
    try {
      await navigator.clipboard.writeText(integrity.hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <span
      title={`${integrity.statusLabel} · SHA-256: ${integrity.hash}\nTap to copy`}
      aria-label={integrity.statusLabel}
      className={`group inline-flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full border transition ${
        verified
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
      }`}
      onClick={copyHash}
    >
      {copied ? (
        <Check className="h-3 w-3" />
      ) : verified ? (
        <ShieldCheck className="h-3 w-3" />
      ) : (
        <ShieldAlert className="h-3 w-3" />
      )}
    </span>
  );
}
