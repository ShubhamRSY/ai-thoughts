"use client";

import { useCallback, useState } from "react";

export interface LocalProfile {
  handle: string;
  author: string;
  bio?: string;
  avatarUrl?: string;
}

export const LOCAL_PROFILE_KEY = "aithoughts.profile.v2";

function readProfile(): LocalProfile {
  if (typeof window === "undefined") return { handle: "", author: "" };
  try {
    const raw = window.localStorage.getItem(LOCAL_PROFILE_KEY) || window.localStorage.getItem("aithoughts.profile.v1");
    if (raw) return JSON.parse(raw) as LocalProfile;
  } catch {
    /* ignore */
  }
  return { handle: "", author: "" };
}

export function useLocalProfile() {
  const [profile, setProfile] = useState<LocalProfile>(() => readProfile());

  const save = useCallback((p: LocalProfile) => {
    setProfile(p);
    try {
      window.localStorage.setItem(LOCAL_PROFILE_KEY, JSON.stringify(p));
    } catch {
      /* ignore */
    }
  }, []);

  return { profile, save };
}
