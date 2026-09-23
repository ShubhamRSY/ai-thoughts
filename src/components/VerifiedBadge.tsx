"use client";

import { BadgeCheck } from "lucide-react";

interface VerifiedBadgeProps {
  className?: string;
  title?: string;
}

export default function VerifiedBadge({
  className = "h-4 w-4",
  title = "Verified account",
}: VerifiedBadgeProps) {
  return (
    <span className="inline-flex shrink-0 items-center justify-center" title={title} aria-label={title}>
      <BadgeCheck className={className} fill="currentColor" strokeWidth={0} />
    </span>
  );
}