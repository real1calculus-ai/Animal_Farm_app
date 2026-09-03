import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/** Rendered for an unmatched URL and wherever a page calls `notFound()`. */
export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col justify-center">
      <EmptyState
        title="That page isn't here"
        description="The link may be out of date, or the record it pointed at has since been removed."
        action={<ButtonLink href="/">Back to dashboard</ButtonLink>}
      />
    </div>
  );
}
