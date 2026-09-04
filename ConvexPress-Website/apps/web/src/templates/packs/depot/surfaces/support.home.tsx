/**
 * Depot · support.home — support landing: page header, then the actions as a
 * card row (submit a ticket, my tickets when signed in, help center when the
 * knowledge base is on) and the sign-in note. Loading state as in Core.
 */
import { Link } from "@tanstack/react-router";
import { ArrowRight, List, MessageSquarePlus, Search } from "lucide-react";
import type { ReactNode } from "react";

import type { SupportHomeSurfaceData } from "@/templates/packs/core/surfaces/support.home";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Card, Container, Label } from "../parts";
import { PluginPageHeader, Spinner } from "../parts/extra-plugins";

export default function DepotSupportHome({ data }: SurfaceProps<SupportHomeSurfaceData>) {
  const { isLoaded, isSignedIn, knowledgeBaseEnabled } = data;

  if (!isLoaded) {
    return (
      <Container padded={false} data-slot="support-home" data-pack="depot" className="py-6 md:py-8">
        <Spinner />
      </Container>
    );
  }

  return (
    <Container padded={false} data-slot="support-home" data-pack="depot" className="flex flex-col gap-4 py-6 md:py-8">
      <PluginPageHeader eyebrow="Support" title="How can we help?" description="Browse the help center, search for answers, or submit a support ticket and we'll get back to you as soon as possible." />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <ActionCard to="/support/new" icon={<MessageSquarePlus className="size-5" aria-hidden="true" />} title="Submit a ticket" description="Describe your issue and our team will respond promptly." />
        {isSignedIn ? <ActionCard to="/support/tickets" icon={<List className="size-5" aria-hidden="true" />} title="My tickets" description="View and manage your existing support tickets." /> : null}
        {knowledgeBaseEnabled ? <ActionCard to="/help" icon={<Search className="size-5" aria-hidden="true" />} title="Help center" description="Search our knowledge base for instant answers." /> : null}
      </div>

      {!isSignedIn ? (
        <p className="text-[13px] text-muted-foreground">
          <Link to="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>{" "}
          to submit a ticket or view your existing tickets.
        </p>
      ) : null}
    </Container>
  );
}

function ActionCard({ to, icon, title, description }: { to: string; icon: ReactNode; title: string; description: string }) {
  return (
    <Card className="transition-colors hover:border-primary/60">
      <Link to={to} className="flex h-full items-start gap-3 p-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">{icon}</span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-sm font-semibold text-foreground">{title}</span>
          <span className="text-[13px] leading-5 text-muted-foreground">{description}</span>
          <Label className="mt-1 inline-flex items-center gap-1 text-primary">
            Open
            <ArrowRight className="size-3" aria-hidden="true" />
          </Label>
        </span>
      </Link>
    </Card>
  );
}
