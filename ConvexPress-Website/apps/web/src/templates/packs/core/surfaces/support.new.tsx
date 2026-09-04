/** Core · support.new — public new-ticket page (sign-in prompt or the ticket form). */
import { Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { NewTicketForm } from "@/components/support/tickets/NewTicketForm";
import type { SurfaceProps } from "@/templates/sdk/types";

export interface SupportNewSurfaceData {
  /**
   * loading   — auth / dashboard config unresolved, or redirecting to the dashboard form
   * signedOut — visitor must sign in
   * ready     — render the form
   */
  status: "loading" | "signedOut" | "ready";
  /** Pre-filled values from search params (notification "Ask about this", a closed ticket). */
  prefill: { subject?: string; category?: string; context?: string };
  /** Where "Back" goes. */
  backHref: string;
  /** Where to send the visitor once the ticket is created. */
  ticketHref: (ticketNumber: string) => string;
}

export default function CoreSupportNew({ data }: SurfaceProps<SupportNewSurfaceData>) {
  const { status, prefill, backHref, ticketHref } = data;

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
      <NewTicketForm prefill={prefill} backHref={backHref} ticketHref={ticketHref} />
    </div>
  );
}
