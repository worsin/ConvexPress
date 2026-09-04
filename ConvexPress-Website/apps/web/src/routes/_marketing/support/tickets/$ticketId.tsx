import { useEffect } from "react";
import { createFileRoute, Link, ErrorComponent, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useAuth } from "@clerk/clerk-react";
import { api } from "@convexpress-website/backend/generated/api";
import { Loader2 } from "lucide-react";

import { buildSeoHead } from "@/lib/seo/head";
import { useDashboardEnabled, useDashboardPath } from "@/hooks/useDashboardConfig";
import { looksLikeTicketNumber } from "@/lib/support-tickets";
import { TicketDetail } from "@/components/support/tickets/TicketDetail";

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
    if (shouldRedirect && ticketNumber) void navigate({ to: to(`/tickets/${ticketNumber}`) as "/", replace: true });
  }, [shouldRedirect, ticketNumber, navigate, to]);

  if (!isLoaded || dashboardEnabled === null) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading" />
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <p className="text-muted-foreground">
          Please{" "}
          <Link to="/login" className="text-primary hover:underline">
            sign in
          </Link>{" "}
          to view this ticket.
        </p>
      </div>
    );
  }

  if (!isNumber && byId === null) {
    return <div className="mx-auto max-w-2xl px-4 py-12 text-center text-muted-foreground">Ticket not found or you do not have permission to view it.</div>;
  }

  if (!ticketNumber || shouldRedirect) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <TicketDetail
        ticketNumber={ticketNumber}
        backHref="/support/tickets"
        newTicketHref={(p) => `/support/new?subject=${encodeURIComponent(p.subject)}&category=${encodeURIComponent(p.category)}`}
      />
    </div>
  );
}
