/**
 * Aster · signup.offer — the focused signup page for one offer, without
 * site chrome: a hairline top row (back to site / sign in), then a centred
 * column with the offer named in display type above the signup form. The
 * form itself is the shared SignupForm (Stripe Elements, coupon, password
 * policy); a missing offer shows the pack's not-found surface, which also
 * logs the hit.
 */
import { Link } from "@tanstack/react-router";

import { SignupForm } from "@/components/subscriptions/SignupForm";
import type { SignupOfferSurfaceData } from "@/templates/packs/core/surfaces/signup.offer";
import CoreNotFound from "@/templates/packs/core/surfaces/system.notFound";
import { Surface } from "@/templates/sdk/Surface";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Container, Eyebrow, SkeletonBlock, SkeletonText } from "../parts";

export default function AsterSignupOffer({ data }: SurfaceProps<SignupOfferSurfaceData>) {
  const { offer } = data;

  return (
    <div data-slot="signup-offer" className="flex min-h-svh flex-col bg-background">
      <header className="border-b border-border">
        <Container className="flex h-16 items-center justify-between">
          <Link to="/" className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground">
            ← Back to site
          </Link>
          <Link to="/login" className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground">
            Already have an account? Sign in
          </Link>
        </Container>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-5 py-14 sm:px-8 md:py-20">
        <div className="flex w-full max-w-lg flex-col gap-10">
          {offer === undefined ? (
            <div className="flex flex-col items-center gap-6" aria-hidden="true">
              <SkeletonBlock className="h-3 w-24 rounded-full" />
              <SkeletonBlock className="h-12 w-2/3" />
              <SkeletonText lines={2} className="w-full" />
              <SkeletonBlock className="mt-4 h-72 w-full" />
            </div>
          ) : offer === null ? (
            <Surface name="system.notFound" data={{ kind: "page" }} fallback={CoreNotFound} />
          ) : (
            <>
              <header className="flex flex-col items-center gap-4 text-center">
                <Eyebrow>Subscribe</Eyebrow>
                <h1 className="font-display text-4xl leading-[1.02] tracking-tight text-foreground text-balance md:text-5xl">{offer.title}</h1>
                {offer.publicSummary ? <p className="max-w-[48ch] text-base leading-8 text-muted-foreground">{offer.publicSummary}</p> : null}
              </header>
              <SignupForm offer={offer} />
            </>
          )}
        </div>
      </main>
    </div>
  );
}
