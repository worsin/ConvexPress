/**
 * Depot · signup.offer — the focused signup landing for one subscription
 * offer, without the site chrome: a compact top bar (back to site, sign in),
 * then the shared `SignupForm` (it owns the checkout intent, Clerk signup
 * and Stripe flow) centred on a muted band. A missing offer renders the
 * Depot not-found card, which also logs the hit like Core.
 */
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { SignupForm } from "@/components/subscriptions/SignupForm";
import type { SignupOfferSurfaceData } from "@/templates/packs/core/surfaces/signup.offer";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Container, Label, Skeleton, buttonClasses } from "../parts";
import DepotNotFound from "./system.notFound";

export default function DepotSignupOffer({ data, packId }: SurfaceProps<SignupOfferSurfaceData>) {
  const { offer } = data;

  return (
    <div data-slot="signup-offer" data-pack="depot" className="flex min-h-svh flex-col bg-background">
      <header className="border-b border-border bg-background">
        <Container className="flex h-14 items-center justify-between gap-3">
          <Link to="/" className={buttonClasses("quiet", "sm", "-ml-3 text-muted-foreground hover:text-foreground")}>
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to site
          </Link>
          <Link to="/login" className="text-[13px] text-muted-foreground transition-colors hover:text-foreground">
            Already have an account? <span className="font-medium text-primary">Sign in</span>
          </Link>
        </Container>
      </header>

      <main className="flex flex-1 items-start justify-center bg-muted/40 px-4 py-8 md:items-center md:py-12">
        <div className="flex w-full max-w-lg flex-col gap-3">
          {offer === undefined ? (
            <Skeleton className="h-72" />
          ) : offer === null ? (
            <DepotNotFound data={{ kind: "page" }} packId={packId} />
          ) : (
            <>
              <div className="flex flex-col gap-0.5">
                <Label>Subscribe</Label>
                <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl">{offer.title}</h1>
                {offer.description ? <p className="text-[13px] leading-5 text-muted-foreground">{offer.description}</p> : null}
              </div>
              <SignupForm offer={offer} className="rounded-md" />
            </>
          )}
        </div>
      </main>
    </div>
  );
}
