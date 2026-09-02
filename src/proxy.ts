import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { withTimeout } from "@/lib/with-timeout";

const AUTH_TIMEOUT_MS = 5000;

/**
 * Proxy does one cheap thing: refresh the Supabase session cookie and bounce
 * unauthenticated visitors to /login. It deliberately does NOT do role-based
 * routing — that needs a database lookup and belongs in the per-page
 * `requireRole()` calls (src/lib/auth.ts), which are also the only checks a
 * directly-POSTed Server Action goes through.
 *
 * Uses `getUser()`, not `getSession()`: that revalidates the JWT server-side
 * instead of trusting an unverified cookie.
 *
 * If Supabase Auth is slow or briefly unreachable the call is timed out and
 * the request is let through unredirected — this check runs on every request,
 * so failing closed here would take down /login itself. That is safe because
 * this is a UX shortcut, not the security boundary: requireUser()/requireRole()
 * re-verify on every page and action.
 */
export default async function proxy(request: NextRequest) {
  // There is no direct way for a Server Component to read the current path, so
  // it is forwarded as a request header — the pattern documented in
  // node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: requestHeaders } });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  let user;
  try {
    const result = await withTimeout(supabase.auth.getUser(), AUTH_TIMEOUT_MS);
    user = result.data.user;
  } catch {
    return response;
  }

  const isPublicPath =
    request.nextUrl.pathname === "/login" ||
    request.nextUrl.pathname === "/signup" ||
    request.nextUrl.pathname === "/forgot-password";

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
