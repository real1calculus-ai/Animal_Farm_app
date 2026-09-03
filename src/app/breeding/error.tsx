"use client";

import { useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";

/**
 * Breeding-scoped error boundary.
 *
 * Same contract as the root one (the prop is `retry`, not `reset`), but the
 * message is rendered with `whitespace-pre-line`: a refused mating throws a
 * bulleted list of every constraint it broke, and collapsing that onto one line
 * is the difference between "the system said no" and "the system said no
 * because these two are half siblings and she is 40 kg under weight".
 */
export default function BreedingError({
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
    <div className="mx-auto flex min-h-[60vh] w-full max-w-lg flex-col justify-center">
      <Card className="flex flex-col gap-4">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          That didn&apos;t go through
        </h1>

        <p className="whitespace-pre-line text-sm text-zinc-700 dark:text-zinc-300">
          {error.message || "Something went wrong on the breeding screens."}
        </p>

        {error.digest ? (
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            Reference: <code className="font-mono">{error.digest}</code>
          </p>
        ) : null}

        <div className="mt-1 flex flex-wrap gap-2">
          <Button type="button" onClick={() => retry()}>
            Try again
          </Button>
          <ButtonLink href="/breeding" variant="secondary">
            Back to breeding records
          </ButtonLink>
        </div>
      </Card>
    </div>
  );
}
