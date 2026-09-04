/**
 * Depot · system.restricted — the membership gate: the teaser (hidden, a
 * fading excerpt, or the admin's custom message, sanitised as in Core) then
 * the call to action as a card. Logged-out visitors get sign-in / register
 * links that return them here; logged-in non-members get the shared
 * `UpgradeCTA` (it resolves the matching plan for the pricing deep link).
 */
import { Link, useLocation } from "@tanstack/react-router";
import DOMPurify from "isomorphic-dompurify";
import { LogIn } from "lucide-react";
import { useMemo } from "react";

import { UpgradeCTA } from "@/components/membership/UpgradeCTA";
import { cn } from "@/lib/utils";
import type { RestrictedSurfaceData } from "@/templates/packs/core/surfaces/system.restricted";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Card, Label, Prose, buttonClasses } from "../parts";

export default function DepotSystemRestricted({ data }: SurfaceProps<RestrictedSurfaceData>) {
  const { mode, rule, excerpt, userState, title, className } = data;

  const customMessage = useMemo(() => {
    if (mode !== "custom_message" || !rule.customMessage) return null;
    return DOMPurify.sanitize(rule.customMessage, {
      ALLOWED_TAGS: ["b", "i", "strong", "em", "a", "code", "br", "p", "ul", "ol", "li", "h2", "h3", "h4", "h5", "h6", "blockquote", "span", "div"],
      ALLOWED_ATTR: ["href", "target", "rel", "class"],
    });
  }, [mode, rule.customMessage]);

  const gate = (
    <div data-slot="restricted-content" data-mode={mode} data-pack="depot" className={cn("flex flex-col gap-4", className)}>
      {mode === "excerpt" && excerpt && (
        <div data-slot="restricted-teaser" className="relative max-h-64 overflow-hidden">
          <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{excerpt}</p>
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-background" />
        </div>
      )}
      {mode === "custom_message" && customMessage && <div data-slot="restricted-custom-message" className="text-sm leading-6 text-foreground" dangerouslySetInnerHTML={{ __html: customMessage }} />}
      {userState === "logged_out" ? (
        <LoginCard />
      ) : (
        <UpgradeCTA matchingPlanIds={rule.matchingPlanIds ?? undefined} className="rounded-md border-border bg-card" />
      )}
    </div>
  );

  if (title === undefined) return gate;
  return (
    <Prose data-slot="restricted-page" className="flex flex-col gap-4 py-6 md:py-8">
      <div className="flex flex-col gap-1 border-b border-border pb-4">
        <Label>Members only</Label>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl">{title}</h1>
      </div>
      {gate}
    </Prose>
  );
}

function LoginCard() {
  const location = useLocation();
  const returnTo = location.pathname + (location.hash ? `#${location.hash}` : "");
  return (
    <Card data-slot="membership-login-cta" className="flex flex-col items-center gap-3 p-6 text-center">
      <div className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <LogIn className="size-5" aria-hidden="true" />
      </div>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-foreground">Sign in to continue</h2>
        <p className="max-w-md text-[13px] text-muted-foreground">This content is for members. Sign in to read it.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Link to="/login" search={{ returnTo }} className={buttonClasses("primary")}>
          Sign in
        </Link>
        <Link to="/register" search={{ returnTo }} className={buttonClasses("secondary")}>
          Create account
        </Link>
      </div>
    </Card>
  );
}
