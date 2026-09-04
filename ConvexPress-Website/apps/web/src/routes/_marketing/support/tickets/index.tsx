import { useEffect } from "react";
import { createFileRoute, ErrorComponent, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useAuth } from "@/lib/auth/clerk";
import { api } from "@convexpress-website/backend/generated/api";
import { z } from "zod";

import { buildRestrictedPageHead } from "@/lib/seo/head";
import { useDashboardEnabled, useDashboardPath } from "@/hooks/useDashboardConfig";
import type { TicketOverviewResult } from "@/lib/support-tickets";
import CoreSupportTickets, { type SupportTicketsSurfaceData } from "@/templates/packs/core/surfaces/support.tickets";
import { Surface } from "@/templates/sdk/Surface";

const searchSchema = z.object({
  status: z.enum(["open", "awaitingResponse", "inProgress", "resolved", "closed"]).optional(),
  page: z.number().min(1).optional(),
});

export const Route = createFileRoute("/_marketing/support/tickets/")({
  validateSearch: searchSchema,
  loader: () => ({
    seoHead: buildRestrictedPageHead({
      title: "My Tickets - Support",
      path: "/support/tickets",
    }),
  }),
  component: MyTicketsPage,
  errorComponent: ErrorComponent,
  head: ({ loaderData }) => loaderData?.seoHead ?? {},
});

/**
 * Public "My tickets" route. When the member is signed in and the dashboard
 * plugin is on, this redirects to the dashboard's tickets page (same
 * components, configured base path). Otherwise it renders the list here.
 */
function MyTicketsPage() {
  const { isSignedIn, isLoaded } = useAuth();
  const navigate = useNavigate();
  const dashboardEnabled = useDashboardEnabled();
  const { to } = useDashboardPath();

  const shouldRedirect = isLoaded && isSignedIn && dashboardEnabled === true;
  useEffect(() => {
    if (shouldRedirect) void navigate({ to: to("/tickets"), replace: true } as never);
  }, [shouldRedirect, navigate, to]);

  const tickets = useQuery(api.tickets.queries.getMyTicketsOverview, isLoaded && isSignedIn && dashboardEnabled === false ? {} : "skip") as TicketOverviewResult | undefined;

  const status: SupportTicketsSurfaceData["status"] =
    !isLoaded || dashboardEnabled === null || shouldRedirect
      ? "loading"
      : !isSignedIn
        ? "signedOut"
        : "ready";

  const data: SupportTicketsSurfaceData = {
    status,
    tickets,
    hrefFor: (ticketNumber) => `/support/tickets/${ticketNumber}`,
    newHref: "/support/new",
  };

  return <Surface name="support.tickets" data={data} fallback={CoreSupportTickets} />;
}
