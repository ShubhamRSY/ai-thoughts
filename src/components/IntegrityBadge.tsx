"use client";

import { useState } from "react";
import { ShieldCheck, ShieldAlert, Copy, Check } from "lucide-react";
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
      title={`SHA-256: ${integrity.hash}\nTap to copy`}
      className={`group inline-flex cursor-pointer items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition ${
        verified
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
          : "border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
      }`}
      onClick={copyHash}
    >
      {verified ? <ShieldCheck className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
      {integrity.statusLabel}
      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3 opacity-0 transition group-hover:opacity-70" />}
    </span>
  );
}