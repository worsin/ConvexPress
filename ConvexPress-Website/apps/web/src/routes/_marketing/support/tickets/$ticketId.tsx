import { useEffect } from "react";
import { createFileRoute, ErrorComponent, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useAuth } from "@/lib/auth/clerk";
import { api } from "@convexpress-website/backend/generated/api";

import { buildSeoHead } from "@/lib/seo/head";
import { useDashboardEnabled, useDashboardPath } from "@/hooks/useDashboardConfig";
import { looksLikeTicketNumber } from "@/lib/support-tickets";
import CoreSupportTicket, { type SupportTicketSurfaceData } from "@/templates/packs/core/surfaces/support.ticket";
import { Surface } from "@/templates/sdk/Surface";

export const Route = createFileRoute("/_marketing/support/tickets/$ticketId")({
  component: TicketThreadPage,
  errorComponent: ErrorComponent,
  head: () =>
    buildSeoHead({
      title: "Ticket - Support",
      robots: "noindex, nofollow",
    }),
});

/**
 * Public ticket route. `$ticketId` may be a ticket number (TKT-...) or a
 * document id (legacy links and notification action URLs). Signed-in members
 * with the dashboard enabled are redirected to the dashboard thread; others
 * see the same thread component here.
 */
function TicketThreadPage() {
  const { ticketId } = Route.useParams();
  const { isSignedIn, isLoaded } = useAuth();
  const navigate = useNavigate();
  const dashboardEnabled = useDashboardEnabled();
  const { to } = useDashboardPath();

  const isNumber = looksLikeTicketNumber(ticketId);
  // Resolve a legacy document id to its ticket number.
  const byId = useQuery(api.tickets.queries.getById, isLoaded && isSignedIn && !isNumber ? { ticketId } : "skip") as { ticketNumber?: string } | null | undefined;
  const ticketNumber = isNumber ? ticketId.toUpperCase() : byId?.ticketNumber;

  const shouldRedirect = isLoaded && isSignedIn && dashboardEnabled === true && Boolean(ticketNumber);
  useEffect(() => {
    if (shouldRedirect && ticketNumber) void navigate({ to: to(`/tickets/${ticketNumber}`), replace: true } as never);
  }, [shouldRedirect, ticketNumber, navigate, to]);

  // Same precedence as the original inline branches.
  const status: SupportTicketSurfaceData["status"] =
    !isLoaded || dashboardEnabled === null
      ? "loading"
      : !isSignedIn
        ? "signedOut"
        : !isNumber && byId === null
          ? "notFound"
          : !ticketNumber || shouldRedirect
            ? "loading"
            : "ready";

  const data: SupportTicketSurfaceData = {
    status,
    ticketNumber,
    backHref: "/support/tickets",
    newTicketHref: (p) => `/support/new?subject=${encodeURIComponent(p.subject)}&category=${encodeURIComponent(p.category)}`,
  };

  return <Surface name="support.ticket" data={data} fallback={CoreSupportTicket} />;
}
