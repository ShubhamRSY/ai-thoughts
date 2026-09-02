/**
 * Supabase is OPTIONAL. When these env vars are missing, the app runs fully
 * on demo data so it's always usable. Set them to go live:
 *
 *   NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
 *
 * See supabase/schema.sql for the table definitions.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const SUPABASE_CONFIGURED = Boolean(URL && ANON);

export const supabaseUrl = URL ?? "";
export const supabaseAnonKey = ANON ?? "";