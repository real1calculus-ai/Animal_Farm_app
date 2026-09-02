import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. Bypasses row-level security entirely, so it is
 * `server-only` and must never be reachable from a Client Component. Used only
 * for administrative auth operations that the anon key cannot perform — e.g.
 * an Admin deleting a staff member's auth user.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
