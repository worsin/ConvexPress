/** Core · support.tickets — public "My tickets" list (sign-in prompt or the ticket list). */
import { Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { TicketList } from "@/components/support/tickets/TicketList";
import type { TicketOverviewResult } from "@/lib/support-tickets";
import type { SurfaceProps } from "@/templates/sdk/types";

export interface SupportTicketsSurfaceData {
  /**
   * loading   — auth / dashboard config unresolved, or redirecting to the dashboard list
   * signedOut — visitor must sign in
   * ready     — render the list
   */
  status: "loading" | "signedOut" | "ready";
  /** Overview for the signed-in member; undefined while loading. */
  tickets: TicketOverviewResult | undefined;
  /** Link for a ticket row. */
  hrefFor: (ticketNumber: string) => string;
  /** Link for the "New ticket" button. */
  newHref: string;
}

export default function CoreSupportTickets({ data }: SurfaceProps<SupportTicketsSurfaceData>) {
  const { status, tickets, hrefFor, newHref } = data;

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading" />
      </div>
    );
  }

  if (status === "signedOut") {
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
      <TicketList data={tickets} hrefFor={hrefFor} newHref={newHref} />
    </div>
  );
}
