/**
 * Tools > Redirects > Edit
 *
 * Full page for editing an existing redirect rule.
 * Fetches redirect data via Convex query and pre-populates the form.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";

import { RedirectForm } from "@/components/routing/RedirectForm";
import { Skeleton } from "@/components/ui/skeleton";
import type { Id } from "@backend/convex/_generated/dataModel";

export const Route = createFileRoute(
  "/_authenticated/_admin/tools/redirects/$redirectId/edit",
)({
  component: EditRedirectPage,
});

function EditRedirectPage() {
  const { redirectId } = Route.useParams();

  const redirect = useQuery(api.routing.queries.getRedirectById, {
    redirectId: redirectId as Id<"redirects">,
  });

  // Loading state
  if (redirect === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full max-w-2xl" />
        <Skeleton className="h-10 w-full max-w-2xl" />
        <Skeleton className="h-10 w-full max-w-2xl" />
        <Skeleton className="h-10 w-full max-w-2xl" />
      </div>
    );
  }

  // Not found
  if (redirect === null) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-foreground mb-2">
          Redirect Not Found
        </h1>
        <p className="text-sm text-muted-foreground">
          The redirect you are looking for does not exist or has been deleted.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-2">Edit Redirect</h1>
      <p className="text-xs text-muted-foreground mb-6">
        {redirect.sourceUrl} → {redirect.targetUrl}
      </p>

      <RedirectForm
        mode="edit"
        redirectId={redirectId as Id<"redirects">}
        initialValues={{
          sourceUrl: redirect.sourceUrl,
          targetUrl: redirect.targetUrl,
          statusCode: redirect.statusCode as 301 | 302 | 307 | 308,
          matchType: redirect.matchType as "exact" | "prefix" | "regex",
          note: redirect.note || "",
          enabled: redirect.enabled,
        }}
      />
    </div>
  );
}
