/**
 * Depot · support.ticket — the public ticket thread: `TicketDetail` in the
 * Depot frame. Sign-in card, not-found card and loading spinner as in Core.
 */
import { TicketDetail } from "@/components/support/tickets/TicketDetail";
import type { SupportTicketSurfaceData } from "@/templates/packs/core/surfaces/support.ticket";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Container, EmptyState, Label, LinkButton } from "../parts";
import { Band, Spinner, frameReset } from "../parts/extra-plugins";

export default function DepotSupportTicket({ data }: SurfaceProps<SupportTicketSurfaceData>) {
  const { status, ticketNumber, backHref, newTicketHref } = data;

  if (status === "signedOut") {
    return (
      <Container padded={false} data-slot="support-ticket" data-pack="depot" className="py-6 md:py-8">
        <Band label="Sign in to view this ticket" cardClassName="items-center text-center">
          <Label>Support</Label>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">View ticket</h1>
          <p className="text-[13px] text-muted-foreground">Please sign in to view this ticket.</p>
          <LinkButton to="/login" className="w-full">
            Sign in
          </LinkButton>
        </Band>
      </Container>
    );
  }

  if (status === "notFound") {
    return (
      <Container padded={false} data-slot="support-ticket" data-pack="depot" className="py-6 md:py-8">
        <EmptyState title="Ticket not found" description="Ticket not found or you do not have permission to view it." action={<LinkButton to={backHref} variant="secondary">Back</LinkButton>} />
      </Container>
    );
  }

  if (status === "loading" || !ticketNumber) {
    return (
      <Container padded={false} data-slot="support-ticket" data-pack="depot" className="py-6 md:py-8">
        <Spinner />
      </Container>
    );
  }

  return (
    <Container padded={false} data-slot="support-ticket" data-pack="depot" className={`py-6 md:py-8 ${frameReset}`}>
      <TicketDetail ticketNumber={ticketNumber} backHref={backHref} newTicketHref={newTicketHref} />
    </Container>
  );
}
