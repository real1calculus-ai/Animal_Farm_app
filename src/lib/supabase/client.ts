import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for Client Components. A factory rather than a shared
 * singleton, per Supabase's recommended App Router pattern.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
