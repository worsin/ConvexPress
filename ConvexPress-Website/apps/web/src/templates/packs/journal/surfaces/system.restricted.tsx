/**
 * Journal · system.restricted — the membership gate in the reading measure:
 * the teaser (excerpt fading out, or the admin's custom message), a rule,
 * then a centred call to action. Same rules as Core: logged-out visitors get
 * sign in / create account with a `returnTo`; signed-in non-members get the
 * plan-aware upgrade call (reused, restyled) so the deep-link to the matching
 * plan is kept.
 */
import { Link, useLocation } from "@tanstack/react-router";
import DOMPurify from "isomorphic-dompurify";
import { useMemo } from "react";

import { UpgradeCTA } from "@/components/membership/UpgradeCTA";
import { cn } from "@/lib/utils";
import type { RestrictedSurfaceData } from "@/templates/packs/core/surfaces/system.restricted";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Container, Eyebrow, Prose, Rule, SectionHeading, buttonClasses } from "../parts";

export default function JournalSystemRestricted({ data }: SurfaceProps<RestrictedSurfaceData>) {
  const { mode, rule, excerpt, userState, title, className } = data;

  const customMessage = useMemo(() => {
    if (mode !== "custom_message" || !rule.customMessage) return null;
    return DOMPurify.sanitize(rule.customMessage, {
      ALLOWED_TAGS: ["b", "i", "strong", "em", "a", "code", "br", "p", "ul", "ol", "li", "h2", "h3", "h4", "h5", "h6", "blockquote", "span", "div"],
      ALLOWED_ATTR: ["href", "target", "rel", "class"],
    });
  }, [mode, rule.customMessage]);

  const gate = (
    <div data-slot="restricted-content" data-mode={mode} className={cn("flex flex-col gap-10", className)}>
      {mode === "excerpt" && excerpt ? (
        <div data-slot="restricted-teaser" className="relative max-h-72 overflow-hidden">
          <p className="whitespace-pre-wrap text-base leading-8 text-muted-foreground md:text-[17px]">{excerpt}</p>
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-background" />
        </div>
      ) : null}
      {mode === "custom_message" && customMessage ? (
        <div data-slot="restricted-custom-message" className="text-base leading-8 text-muted-foreground md:text-[17px] [&_a]:text-foreground [&_a]:underline [&_a]:decoration-border [&_a]:underline-offset-4 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:text-foreground [&_h3]:font-display [&_h3]:text-xl [&_h3]:text-foreground" dangerouslySetInnerHTML={{ __html: customMessage }} />
      ) : null}
      {mode !== "hide" && (excerpt || customMessage) ? <Rule /> : null}
      {userState === "logged_out" ? (
        <SignInCall />
      ) : (
        <UpgradeCTA
          matchingPlanIds={rule.matchingPlanIds ?? undefined}
          className="border-0 bg-transparent p-0 text-center [&>div:first-child]:hidden [&_a]:h-11 [&_a]:rounded-full [&_a]:px-6 [&_h2]:font-display [&_h2]:text-3xl [&_h2]:font-normal [&_h2]:leading-[1.08] [&_h2]:tracking-tight [&_h2]:text-foreground [&_p]:text-base [&_p]:leading-8"
        />
      )}
    </div>
  );

  if (title === undefined) return gate;
  return (
    <Container data-slot="restricted-page" className="py-6 md:py-10">
      <Prose className="flex flex-col gap-10">
        <SectionHeading level={1} eyebrow="Members" title={title} />
        {gate}
      </Prose>
    </Container>
  );
}

function SignInCall() {
  const location = useLocation();
  const returnTo = location.pathname + (location.hash ? `#${location.hash}` : "");
  return (
    <div data-slot="membership-login-cta" className="flex flex-col items-center gap-5 text-center">
      <Eyebrow>Members</Eyebrow>
      <h2 className="font-display text-3xl leading-[1.08] tracking-tight text-foreground text-balance md:text-4xl">Sign in to continue.</h2>
      <p className="max-w-[48ch] text-base leading-8 text-muted-foreground">This piece is for members. Sign in to read it.</p>
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
        <Link to="/login" search={{ returnTo }} className={buttonClasses("primary")}>
          Sign in
        </Link>
        <Link to="/register" search={{ returnTo }} className={buttonClasses("link")}>
          Create account
        </Link>
      </div>
    </div>
  );
}
