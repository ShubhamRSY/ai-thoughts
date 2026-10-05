"use client";

import { useCallback, useEffect, useState } from "react";

export interface ActivityItem {
  id: string;
  kind: "reply" | "reaction" | "follow_post" | "mention" | "new_signin";
  actor_handle: string;
  actor_author: string;
  post_id: string;
  preview: string;
  read: boolean;
  created_at: string;
}

export function useActivity(enabled: boolean) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setItems([]);
      setUnread(0);
      return;
    }
    try {
      const res = await fetch("/api/activity", { credentials: "include", cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.items ?? []);
      setUnread(data.unread ?? 0);
    } catch {
      /* ignore */
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
    if (!enabled) return;
    const id = window.setInterval(() => void refresh(), 45000);
    return () => window.clearInterval(id);
  }, [enabled, refresh]);

  const markAllRead = useCallback(async () => {
    try {
      await fetch("/api/activity", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "read_all" }),
      });
      setUnread(0);
      setItems((prev) => prev.map((i) => ({ ...i, read: true })));
    } catch {
      /* ignore */
    }
  }, []);

  return { items, unread, refresh, markAllRead };
}
