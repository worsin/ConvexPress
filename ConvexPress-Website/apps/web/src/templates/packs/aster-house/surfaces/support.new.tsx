/**
 * Aster · support.new — the public new-ticket page. Same three states as
 * Core (loading, signed out, ready); the ready state composes the shared
 * NewTicketForm beneath a Aster heading (the form's own title is hidden).
 */
import type { SupportNewSurfaceData } from "@/templates/packs/core/surfaces/support.new";
import { NewTicketForm } from "@/components/support/tickets/NewTicketForm";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Container, EmptyState, LinkButton, SectionHeading, SkeletonBlock } from "../parts";

export default function AsterSupportNew({ data }: SurfaceProps<SupportNewSurfaceData>) {
  const { status, prefill, backHref, ticketHref } = data;

  if (status === "loading") {
    return (
      <Container data-slot="support-new" className="py-6 md:py-10">
        <div className="flex flex-col gap-6" role="status" aria-label="Loading">
          <SkeletonBlock className="h-10 w-1/3" />
          <SkeletonBlock className="h-64 w-full" />
        </div>
      </Container>
    );
  }

  if (status === "signedOut") {
    return (
      <Container data-slot="support-new" className="py-6 md:py-10">
        <div className="mx-auto w-full max-w-2xl">
          <EmptyState
            eyebrow="Support"
            title="Sign in to submit a support ticket."
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

  return (
    <Container data-slot="support-new" className="flex flex-col gap-10 py-6 md:py-10">
      <SectionHeading level={1} eyebrow="Support" title="Open a ticket" />
      <NewTicketForm prefill={prefill} backHref={backHref} ticketHref={ticketHref} compactHeader />
    </Container>
  );
}
