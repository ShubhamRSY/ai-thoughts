"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { LOCAL_PROFILE_KEY } from "@/hooks/useLocalProfile";

export interface AuthUser {
  id: string;
  email: string;
  handle: string;
  displayName: string;
  verified?: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  requestCode: (
    email: string,
    displayName: string,
    username?: string,
    turnstileToken?: string
  ) => Promise<{ ok: boolean; error?: string; devCode?: string; alreadySignedIn?: boolean }>;
  verifyCode: (
    email: string,
    code: string,
    ageConfirmed: boolean
  ) => Promise<{ ok: boolean; error?: string; isNew?: boolean }>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  requestCode: async () => ({ ok: false }),
  verifyCode: async () => ({ ok: false }),
  signOut: async () => {},
  refresh: async () => {},
});

async function fetchSessionUser(): Promise<AuthUser | null> {
  try {
    const res = await fetch("/api/auth/me", {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.user ?? null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setUser(await fetchSessionUser());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sessionUser = await fetchSessionUser();
      if (!cancelled) {
        setUser(sessionUser);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const requestCode = useCallback(async (email: string, displayName: string, username?: string, turnstileToken?: string) => {
    if (user) {
      return { ok: true, alreadySignedIn: true };
    }
    try {
      const res = await fetch("/api/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, displayName, username, turnstileToken }),
      });
      const data = await res.json();
      if (data.alreadySignedIn && data.user) {
        setUser(data.user);
        return { ok: true, alreadySignedIn: true };
      }
      if (data.ok) {
        return { ok: true, devCode: data.devCode as string | undefined };
      }
      return { ok: false, error: data.error ?? "Could not send code" };
    } catch {
      return { ok: false, error: "Network error" };
    }
  }, [user]);

  const verifyCode = useCallback(async (email: string, code: string, ageConfirmed: boolean) => {
    if (user) {
      return { ok: true };
    }
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, code, age_confirmed: ageConfirmed }),
      });
      const data = await res.json();
      if (data.ok) {
        setUser(data.user);
        return { ok: true, isNew: Boolean(data.isNew) };
      }
      return { ok: false, error: data.error ?? "Verification failed" };
    } catch {
      return { ok: false, error: "Network error" };
    }
  }, [user]);

  const signOut = useCallback(async () => {
    try {
      await fetch("/api/auth/sign-out", { method: "POST", credentials: "include" });
    } finally {
      // Don't leave this account's name/bio behind for the next person on this device.
      try {
        window.localStorage.removeItem(LOCAL_PROFILE_KEY);
        window.localStorage.removeItem("aithoughts.profile.v1");
      } catch {
        /* ignore */
      }
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, requestCode, verifyCode, signOut, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
