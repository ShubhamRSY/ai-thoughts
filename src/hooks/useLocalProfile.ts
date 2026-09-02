"use client";

import { useCallback, useState } from "react";

interface LocalProfile {
  handle: string;
  author: string;
}

const KEY = "aithoughts.profile.v1";

function readProfile(): LocalProfile {
  if (typeof window === "undefined") return { handle: "", author: "" };
  try {
    const raw = window.localStorage.getItem(KEY);
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
      window.localStorage.setItem(KEY, JSON.stringify(p));
    } catch {
      /* ignore */
    }
  }, []);

  return { profile, save };
}