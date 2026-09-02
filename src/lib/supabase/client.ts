"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_CONFIGURED, supabaseUrl, supabaseAnonKey } from "./config";

let cached: SupabaseClient | null = null;

export function getSupabaseBrowser(): SupabaseClient | null {
  if (!SUPABASE_CONFIGURED) return null;
  if (!cached) {
    cached = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }
  return cached;
}