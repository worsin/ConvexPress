/**
 * Journal · support.ticket — one public ticket thread. Same states as Core
 * (signed out, not found, loading, ready); the ready state composes the
 * shared TicketDetail inside the Journal container.
 */
import { TicketDetail } from "@/components/support/tickets/TicketDetail";
import type { SupportTicketSurfaceData } from "@/templates/packs/core/surfaces/support.ticket";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Container, EmptyState, LinkButton, SkeletonBlock } from "../parts";

export default function JournalSupportTicket({ data }: SurfaceProps<SupportTicketSurfaceData>) {
  const { status, ticketNumber, backHref, newTicketHref } = data;

  if (status === "signedOut") {
    return (
      <Container data-slot="support-ticket" className="py-6 md:py-10">
        <div className="mx-auto w-full max-w-2xl">
          <EmptyState
            eyebrow="Support"
            title="Sign in to view this ticket."
            action={
              <LinkButton to="/login" variant="primary">
                Sign in
              </LinkButton>
            }
          />
        </div>
      </Container>
    );
  }

  if (status === "notFound") {
    return (
      <Container data-slot="support-ticket" className="py-6 md:py-10">
        <div className="mx-auto w-full max-w-2xl">
          <EmptyState
            eyebrow="Not found"
            title="Ticket not found or you do not have permission to view it."
            action={
              <LinkButton to={backHref} variant="ghost">
                Back to tickets
              </LinkButton>
            }
          />
        </div>
      </Container>
    );
  }

  if (status === "loading" || !ticketNumber) {
    return (
      <Container data-slot="support-ticket" className="py-6 md:py-10">
        <div className="flex flex-col gap-6" role="status" aria-label="Loading">
          <SkeletonBlock className="h-10 w-1/2" />
          <SkeletonBlock className="h-40 w-full" />
        </div>
      </Container>
    );
  }

  return (
    <Container data-slot="support-ticket" className="py-6 md:py-10">
      <TicketDetail ticketNumber={ticketNumber} backHref={backHref} newTicketHref={newTicketHref} />
    </Container>
  );
}
