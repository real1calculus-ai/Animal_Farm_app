import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * POST-only sign-out. src/components/nav.tsx posts a real `<form>` here rather
 * than using a link, so signing out cannot be triggered by a GET — a prefetch,
 * a crawler or an <img> tag pointed at this URL would otherwise log the user
 * out from under themselves.
 *
 * The redirect is 303 (See Other), not the default 307: a 307 preserves the
 * request method, so the browser would POST to /login and get a 405 from a
 * page that only answers GET. 303 is what converts the follow-up into a GET.
 *
 * The Supabase client writes its cookie clears onto `response` directly
 * instead of going through `cookies()`. Mutating the request cookie store and
 * then returning a separately constructed NextResponse loses those writes,
 * which would leave a stale session cookie in place and un-sign-out the user.
 */
export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/login", request.url), { status: 303 });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // A failure here means the token could not be revoked server-side. The
  // session cookies are cleared either way, so the browser is signed out;
  // log it and carry on rather than stranding the user on an error page with
  // no way to leave the account.
  const { error } = await supabase.auth.signOut();
  if (error) console.error("signOut failed:", error.message);

  return response;
}
