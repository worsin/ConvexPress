import { useEffect } from "react";
import { createFileRoute, Link, ErrorComponent, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@clerk/clerk-react";
import { z } from "zod";
import { Loader2 } from "lucide-react";

import { buildSeoHead } from "@/lib/seo/head";
import { useDashboardEnabled, useDashboardPath } from "@/hooks/useDashboardConfig";
import { NewTicketForm } from "@/components/support/tickets/NewTicketForm";

/** Other pages (notification "Ask about this", a closed ticket) can pre-fill via search params. */
const newTicketSearchSchema = z.object({
  subject: z.string().max(200).optional(),
  category: z.string().max(50).optional(),
  context: z.string().max(2000).optional(),
});

export const Route = createFileRoute("/_marketing/support/new")({
  validateSearch: newTicketSearchSchema,
  component: CreateTicketPage,
  errorComponent: ErrorComponent,
  head: () =>
    buildSeoHead({
      title: "New Ticket - Support",
      robots: "noindex, nofollow",
    }),
});

/**
 * Public new-ticket route. Signed-in members with the dashboard enabled are
 * sent to the dashboard's form (same component, configured base path);
 * otherwise the form renders here.
 */
function CreateTicketPage() {
  const { isSignedIn, isLoaded } = useAuth();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const dashboardEnabled = useDashboardEnabled();
  const { to } = useDashboardPath();

  const shouldRedirect = isLoaded && isSignedIn && dashboardEnabled === true;
  useEffect(() => {
    if (!shouldRedirect) return;
    const params = new URLSearchParams();
    if (search.subject) params.set("subject", search.subject);
    if (search.category) params.set("category", search.category);
    if (search.context) params.set("context", search.context);
    const qs = params.toString();
    void navigate({ to: to(`/tickets/new${qs ? `?${qs}` : ""}`) as "/", replace: true });
  }, [shouldRedirect, navigate, to, search.subject, search.category, search.context]);

  if (!isLoaded || dashboardEnabled === null || shouldRedirect) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading" />
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-12 text-center">
        <h1 className="text-2xl font-bold text-foreground">Submit a Ticket</h1>
        <p className="text-muted-foreground">
          Please{" "}
          <Link to="/login" className="text-primary hover:underline">
            sign in
          </Link>{" "}
          to submit a support ticket.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <NewTicketForm
        prefill={{ subject: search.subject, category: search.category, context: search.context }}
        backHref="/support"
        ticketHref={(ticketNumber) => `/support/tickets/${ticketNumber}`}
      />
    </div>
  );
}
