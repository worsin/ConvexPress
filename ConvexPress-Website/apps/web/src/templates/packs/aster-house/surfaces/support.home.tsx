/**
 * Aster · support.home — the support landing as a short index: a centred
 * display heading, then the ways to get help as rule-separated rows (open a
 * ticket · your tickets when signed in · the help centre when the knowledge
 * base is on), and a quiet sign-in line for visitors.
 */
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import type { SupportHomeSurfaceData } from "@/templates/packs/core/surfaces/support.home";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Container, SectionHeading, SkeletonBlock } from "../parts";

export default function AsterSupportHome({ data }: SurfaceProps<SupportHomeSurfaceData>) {
  const { isLoaded, isSignedIn, knowledgeBaseEnabled } = data;

  if (!isLoaded) {
    return (
      <Container data-slot="support-home" className="py-6 md:py-10">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6" role="status" aria-label="Loading">
          <SkeletonBlock className="mx-auto h-10 w-2/3" />
          <SkeletonBlock className="h-20 w-full" />
          <SkeletonBlock className="h-20 w-full" />
        </div>
      </Container>
    );
  }

  const rows: Array<{ to: string; title: string; description: string }> = [
    { to: "/support/new", title: "Open a ticket", description: "Describe your issue and our team will respond promptly." },
    ...(isSignedIn ? [{ to: "/support/tickets", title: "Your tickets", description: "View and manage your existing support tickets." }] : []),
    ...(knowledgeBaseEnabled ? [{ to: "/help", title: "Help centre", description: "Search our knowledge base for instant answers." }] : []),
  ];

  return (
    <Container data-slot="support-home" className="py-6 md:py-10">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-12">
        <SectionHeading level={1} align="center" eyebrow="Support" title="How can we help?" lede="Browse the help centre, search for answers, or submit a support ticket and we will get back to you as soon as possible." />

        <ul className="flex flex-col divide-y divide-border border-y border-border">
          {rows.map((row) => (
            <li key={row.to}>
              <Link to={row.to as any} className="group flex items-center justify-between gap-6 py-7">
                <span className="flex min-w-0 flex-col gap-1.5">
                  <span className="font-display text-2xl leading-snug tracking-tight text-foreground transition-colors group-hover:text-primary">{row.title}</span>
                  <span className="text-base leading-7 text-muted-foreground">{row.description}</span>
                </span>
                <ArrowRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>

        {!isSignedIn ? (
          <p className="text-center text-sm text-muted-foreground">
            <Link to="/login" className="text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground">
              Sign in
            </Link>{" "}
            to submit a ticket or view your existing tickets.
          </p>
        ) : null}
      </div>
    </Container>
  );
}
