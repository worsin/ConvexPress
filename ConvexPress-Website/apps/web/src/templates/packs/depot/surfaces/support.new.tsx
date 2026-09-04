/**
 * Depot · support.new — the public new-ticket page: Depot page header, then
 * `NewTicketForm` (compact header) in the Depot frame. Loading spinner and
 * the sign-in card as in Core.
 */
import { NewTicketForm } from "@/components/support/tickets/NewTicketForm";
import type { SupportNewSurfaceData } from "@/templates/packs/core/surfaces/support.new";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Container, Label, LinkButton } from "../parts";
import { Band, Spinner, frameReset } from "../parts/extra-plugins";

export default function DepotSupportNew({ data }: SurfaceProps<SupportNewSurfaceData>) {
  const { status, prefill, backHref, ticketHref } = data;

  if (status === "loading") {
    return (
      <Container padded={false} data-slot="support-new" data-pack="depot" className="py-6 md:py-8">
        <Spinner />
      </Container>
    );
  }

  if (status === "signedOut") {
    return (
      <Container padded={false} data-slot="support-new" data-pack="depot" className="py-6 md:py-8">
        <Band label="Sign in to submit a ticket" cardClassName="items-center text-center">
          <Label>Support</Label>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Submit a ticket</h1>
          <p className="text-[13px] text-muted-foreground">Please sign in to submit a support ticket.</p>
          <LinkButton to="/login" className="w-full">
            Sign in
          </LinkButton>
        </Band>
      </Container>
    );
  }

  return (
    <Container padded={false} data-slot="support-new" data-pack="depot" className={`flex flex-col gap-4 py-6 md:py-8 ${frameReset}`}>
      <div className="flex flex-col gap-1 border-b border-border pb-4">
        <Label>Support</Label>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl">Open a ticket</h1>
      </div>
      <NewTicketForm prefill={prefill} backHref={backHref} ticketHref={ticketHref} compactHeader />
    </Container>
  );
}
