/**
 * Races a promise against a timeout. Used to stop a slow or unreachable
 * Supabase Auth from hanging every request in the app — see src/lib/auth.ts
 * and src/proxy.ts, both of which treat a timeout as "no session" rather than
 * waiting on the platform's function timeout.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms)
    ),
  ]);
}
