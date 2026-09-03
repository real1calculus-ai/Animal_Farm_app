"use client";

import { useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";

/**
 * Route-level error boundary. Error boundaries must be Client Components.
 *
 * This is where a thrown Server Action lands — validation helpers in
 * src/lib/validation.ts and the guards in every actions.ts throw rather than
 * returning a result type, so `error.message` here is usually a sentence
 * written for the user ("This is the farm's only administrator…").
 *
 * Note the prop is `retry`, not `reset`: in this version of Next.js `retry()`
 * re-fetches and re-renders the segment, where `reset()` only clears the error
 * state without re-fetching — which for a data-fetch failure just renders the
 * same failure again.
 */
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col justify-center">
      <Card className="flex flex-col gap-4">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          That didn&apos;t go through
        </h1>

        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {error.message || "Something went wrong while loading this screen."}
        </p>

        {error.digest ? (
          // Server Component errors are scrubbed before reaching the browser;
          // the digest is the only handle on the matching server log, so it is
          // shown rather than hidden — a farm hand reading it out over the
          // phone is how a real support call gets diagnosed.
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            Reference: <code className="font-mono">{error.digest}</code>
          </p>
        ) : null}

        <div className="mt-1 flex flex-wrap gap-2">
          <Button type="button" onClick={() => retry()}>
            Try again
          </Button>
          <ButtonLink href="/" variant="secondary">
            Back to dashboard
          </ButtonLink>
        </div>
      </Card>
    </div>
  );
}
