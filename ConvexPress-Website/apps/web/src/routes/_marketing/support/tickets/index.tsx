import { useEffect } from "react";
import { createFileRoute, Link, ErrorComponent, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useAuth } from "@clerk/clerk-react";
import { api } from "@convexpress-website/backend/generated/api";
import { z } from "zod";
import { Loader2 } from "lucide-react";

import { buildRestrictedPageHead } from "@/lib/seo/head";
import { useDashboardEnabled, useDashboardPath } from "@/hooks/useDashboardConfig";
import type { TicketOverviewResult } from "@/lib/support-tickets";
import { TicketList } from "@/components/support/tickets/TicketList";

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
    if (shouldRedirect) void navigate({ to: to("/tickets") as "/", replace: true });
  }, [shouldRedirect, navigate, to]);

  const data = useQuery(api.tickets.queries.getMyTicketsOverview, isLoaded && isSignedIn && dashboardEnabled === false ? {} : "skip") as TicketOverviewResult | undefined;

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
        <h1 className="text-2xl font-bold text-foreground">My Tickets</h1>
        <p className="text-muted-foreground">
          Please{" "}
          <Link to="/login" className="text-primary hover:underline">
            sign in
          </Link>{" "}
          to view your support tickets.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <TicketList data={data} hrefFor={(ticketNumber) => `/support/tickets/${ticketNumber}`} newHref="/support/new" />
    </div>
  );
}
