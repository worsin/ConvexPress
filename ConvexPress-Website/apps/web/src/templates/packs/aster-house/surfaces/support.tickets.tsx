/**
 * Aster · support.tickets — the public "My tickets" list. Same states as
 * Core (loading, signed out, ready); the ready state composes the shared
 * TicketList beneath a Aster heading (the list's own title is hidden).
 */
import { TicketList } from "@/components/support/tickets/TicketList";
import type { SupportTicketsSurfaceData } from "@/templates/packs/core/surfaces/support.tickets";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Container, EmptyState, LinkButton, SectionHeading, SkeletonBlock } from "../parts";

export default function AsterSupportTickets({ data }: SurfaceProps<SupportTicketsSurfaceData>) {
  const { status, tickets, hrefFor, newHref } = data;

  if (status === "loading") {
    return (
      <Container data-slot="support-tickets" className="py-6 md:py-10">
        <div className="flex flex-col gap-6" role="status" aria-label="Loading">
          <SkeletonBlock className="h-10 w-1/3" />
          <SkeletonBlock className="h-16 w-full" />
          <SkeletonBlock className="h-16 w-full" />
        </div>
      </Container>
    );
  }

  if (status === "signedOut") {
    return (
      <Container data-slot="support-tickets" className="py-6 md:py-10">
        <div className="mx-auto w-full max-w-2xl">
          <EmptyState
            eyebrow="Support"
            title="Sign in to view your support tickets."
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
    <Container data-slot="support-tickets" className="flex flex-col gap-10 py-6 md:py-10">
      <SectionHeading level={1} eyebrow="Support" title="Your tickets" />
      <TicketList data={tickets} hrefFor={hrefFor} newHref={newHref} compactHeader />
    </Container>
  );
}
