"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { FeaturedVoiceData } from "@/components/FeaturedVoice";

export function useSiteFlags() {
  const [maintenance, setMaintenance] = useState(false);
  const [message, setMessage] = useState("");
  const [invitesOpen, setInvitesOpen] = useState(true);
  const [featured, setFeatured] = useState<FeaturedVoiceData | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/site", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setMaintenance(Boolean(data.maintenance));
        setMessage(typeof data.maintenanceMessage === "string" ? data.maintenanceMessage : "");
        setInvitesOpen(data.invitesOpen !== false);
        setFeatured(data.featured ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return { maintenance, message, invitesOpen, featured };
}

export default function MaintenanceBanner() {
  const { maintenance, message } = useSiteFlags();
  if (!maintenance) return null;
  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-center text-sm text-amber-950">
      <span className="inline-flex items-center gap-1.5 font-medium">
        <AlertTriangle className="h-3.5 w-3.5" />
        {message || "Voices is pausing briefly — check back soon."}
      </span>
    </div>
  );
}
