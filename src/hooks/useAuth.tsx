"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export interface AuthUser {
  id: string;
  email: string;
  handle: string;
  displayName: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  requestCode: (
    email: string,
    displayName: string,
    invite?: string
  ) => Promise<{ ok: boolean; error?: string; devCode?: string; message?: string }>;
  verifyCode: (
    email: string,
    code: string
  ) => Promise<{ ok: boolean; error?: string }>;
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

  const requestCode = useCallback(
    async (email: string, displayName: string, invite?: string) => {
      try {
        const res = await fetch("/api/auth/sign-in", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email, displayName, invite: invite || undefined }),
        });
        const data = await res.json();
        if (data.ok) {
          return {
            ok: true,
            devCode: data.devCode as string | undefined,
            message: data.message as string | undefined,
          };
        }
        return { ok: false, error: data.error ?? "Could not send code" };
      } catch {
        return { ok: false, error: "Network error" };
      }
    },
    []
  );

  const verifyCode = useCallback(async (email: string, code: string) => {
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();
      if (data.ok) {
        setUser(data.user);
        return { ok: true };
      }
      return { ok: false, error: data.error ?? "Verification failed" };
    } catch {
      return { ok: false, error: "Network error" };
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await fetch("/api/auth/sign-out", { method: "POST", credentials: "include" });
    } finally {
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
