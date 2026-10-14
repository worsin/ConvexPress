/**
 * OfferSignupLink — a pricing card's button.
 *
 * Leads into the site's signup form with the plan already chosen when the
 * pricing config names one (`offer.signup`, computed by the server from the
 * form's subscription action), else to the plain `/signup/<offer>` page. A
 * real anchor (works without JavaScript, opens in a new tab on modified
 * clicks) that navigates in-app on a plain click.
 */
import type { MouseEvent, ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";

export interface OfferSignupTarget {
  _id: string;
  signup: { formSlug: string; param?: string; value?: string } | null;
}

/** Where an offer's signup button leads. */
export function offerSignupHref(offer: OfferSignupTarget): string {
  if (!offer.signup) return `/signup/${encodeURIComponent(offer._id)}`;
  const path = `/forms/${encodeURIComponent(offer.signup.formSlug)}`;
  if (!offer.signup.param || offer.signup.value === undefined) return path;
  return `${path}?${new URLSearchParams({ [offer.signup.param]: offer.signup.value }).toString()}`;
}

export function OfferSignupLink({ offer, className, children }: { offer: OfferSignupTarget; className?: string; children: ReactNode }) {
  const router = useRouter();
  const href = offerSignupHref(offer);
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    void router.navigate({ href });
  };
  return (
    <a href={href} onClick={onClick} className={className} data-slot="offer-signup-link">
      {children}
    </a>
  );
}
