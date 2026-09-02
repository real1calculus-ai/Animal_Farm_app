import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Supabase client for Server Components and Server Actions. `cookies()` is
 * async in this Next.js version, so this must be awaited.
 *
 * `setAll` throws when called from a Server Component (cookies can only be set
 * from a Server Action or from Proxy). That is expected and swallowed:
 * src/proxy.ts refreshes the session cookie on every request, so nothing is
 * lost by ignoring it here.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Called from a Server Component — Proxy already refreshes the
            // session cookie, so this is safe to ignore.
          }
        },
      },
    }
  );
}
