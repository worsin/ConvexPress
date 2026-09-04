/**
 * Depot · support.tickets — the public "My tickets" list: Depot page header,
 * then `TicketList` (compact header) in the Depot frame. Loading spinner and
 * the sign-in card as in Core.
 */
import { TicketList } from "@/components/support/tickets/TicketList";
import type { SupportTicketsSurfaceData } from "@/templates/packs/core/surfaces/support.tickets";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Container, Label, LinkButton } from "../parts";
import { Band, Spinner, frameReset } from "../parts/extra-plugins";

export default function DepotSupportTickets({ data }: SurfaceProps<SupportTicketsSurfaceData>) {
  const { status, tickets, hrefFor, newHref } = data;

  if (status === "loading") {
    return (
      <Container padded={false} data-slot="support-tickets" data-pack="depot" className="py-6 md:py-8">
        <Spinner />
      </Container>
    );
  }

  if (status === "signedOut") {
    return (
      <Container padded={false} data-slot="support-tickets" data-pack="depot" className="py-6 md:py-8">
        <Band label="Sign in to view tickets" cardClassName="items-center text-center">
          <Label>Support</Label>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">My tickets</h1>
          <p className="text-[13px] text-muted-foreground">Please sign in to view your support tickets.</p>
          <LinkButton to="/login" className="w-full">
            Sign in
          </LinkButton>
        </Band>
      </Container>
    );
  }

  return (
    <Container padded={false} data-slot="support-tickets" data-pack="depot" className={`flex flex-col gap-4 py-6 md:py-8 ${frameReset}`}>
      <div className="flex flex-col gap-1 border-b border-border pb-4">
        <Label>Support</Label>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl">Support tickets</h1>
      </div>
      <TicketList data={tickets} hrefFor={hrefFor} newHref={newHref} compactHeader />
    </Container>
  );
}
