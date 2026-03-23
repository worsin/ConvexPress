/**
 * Tools > Redirects > Add New
 *
 * Full page for creating a new redirect rule.
 * Supports pre-filling source URL from the 404 log via search params.
 */

import { createFileRoute, useSearch } from "@tanstack/react-router";
import { z } from "zod";

import { RedirectForm } from "@/components/routing/RedirectForm";

const newRedirectSearchSchema = z.object({
  sourceUrl: z.string().optional(),
  notFoundId: z.string().optional(),
});

export const Route = createFileRoute(
  "/_authenticated/_admin/tools/redirects/new",
)({
  validateSearch: newRedirectSearchSchema,
  component: NewRedirectPage,
});

function NewRedirectPage() {
  const { sourceUrl } = useSearch({
    from: "/_authenticated/_admin/tools/redirects/new",
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-6">
        Add New Redirect
      </h1>
      <RedirectForm mode="create" prefillSourceUrl={sourceUrl} />
    </div>
  );
}
