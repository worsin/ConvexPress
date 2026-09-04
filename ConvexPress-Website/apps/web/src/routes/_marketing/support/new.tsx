import { useEffect } from "react";
import { createFileRoute, ErrorComponent, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth/clerk";
import { z } from "zod";

import { buildSeoHead } from "@/lib/seo/head";
import { useDashboardEnabled, useDashboardPath } from "@/hooks/useDashboardConfig";
import CoreSupportNew, { type SupportNewSurfaceData } from "@/templates/packs/core/surfaces/support.new";
import { Surface } from "@/templates/sdk/Surface";

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
    void navigate({ to: to(`/tickets/new${qs ? `?${qs}` : ""}`), replace: true } as never);
  }, [shouldRedirect, navigate, to, search.subject, search.category, search.context]);

  const status: SupportNewSurfaceData["status"] =
    !isLoaded || dashboardEnabled === null || shouldRedirect
      ? "loading"
      : !isSignedIn
        ? "signedOut"
        : "ready";

  const data: SupportNewSurfaceData = {
    status,
    prefill: { subject: search.subject, category: search.category, context: search.context },
    backHref: "/support",
    ticketHref: (ticketNumber) => `/support/tickets/${ticketNumber}`,
  };

  return <Surface name="support.new" data={data} fallback={CoreSupportNew} />;
}
