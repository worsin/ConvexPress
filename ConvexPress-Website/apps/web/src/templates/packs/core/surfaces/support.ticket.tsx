/** Core · support.ticket — public ticket thread (sign-in prompt, not-found, or the thread). */
import { Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { TicketDetail } from "@/components/support/tickets/TicketDetail";
import type { SurfaceProps } from "@/templates/sdk/types";

export interface SupportTicketSurfaceData {
  /**
   * loading   — auth / dashboard config unresolved, ticket number still resolving, or redirecting
   * signedOut — visitor must sign in
   * notFound  — legacy id did not resolve to a ticket the member can see
   * ready     — render the thread for `ticketNumber`
   */
  status: "loading" | "signedOut" | "notFound" | "ready";
  /** Resolved ticket number (TKT-…); present when status is "ready". */
  ticketNumber?: string;
  /** Where "Back" goes. */
  backHref: string;
  /** Link for "open a new ticket about this" from a closed thread. */
  newTicketHref: (prefill: { subject: string; category: string }) => string;
}

export default function CoreSupportTicket({ data }: SurfaceProps<SupportTicketSurfaceData>) {
  const { status, ticketNumber, backHref, newTicketHref } = data;

  if (status === "signedOut") {
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

  if (status === "notFound") {
    return <div className="mx-auto max-w-2xl px-4 py-12 text-center text-muted-foreground">Ticket not found or you do not have permission to view it.</div>;
  }

  if (status === "loading" || !ticketNumber) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <TicketDetail ticketNumber={ticketNumber} backHref={backHref} newTicketHref={newTicketHref} />
    </div>
  );
}
