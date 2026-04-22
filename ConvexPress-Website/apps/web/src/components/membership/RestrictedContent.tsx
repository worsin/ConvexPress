/**
 * RestrictedContent
 *
 * Inline teaser + CTA wrapper used on blog posts, pages, and other gated
 * content resources. Renders a teaser treatment (hide, excerpt, or custom
 * message) based on the rule returned by `api.membership.queries.checkAccess`
 * and dispatches to the appropriate CTA card (login vs upgrade) depending
 * on whether the current visitor is signed in.
 *
 * This component does NOT derive the excerpt itself; the caller passes a
 * pre-computed plain-text excerpt so we don't run TipTap extraction inside
 * presentation code.
 */
import { useMemo } from "react";
import DOMPurify from "isomorphic-dompurify";

import type { Id } from "@convexpress-website/backend/generated/dataModel";
import { cn } from "@/lib/utils";

import { LoginCTA } from "./LoginCTA";
import { UpgradeCTA } from "./UpgradeCTA";

export type RestrictedTeaserMode = "hide" | "excerpt" | "custom_message";
export type RestrictedUserState = "logged_out" | "logged_in_non_member";

export interface RestrictedRule {
  teaserMode?: RestrictedTeaserMode | null;
  customMessage?: string | null;
  matchingPlanIds?: Id<"membership_plans">[] | null;
}

interface RestrictedContentProps {
  /** Teaser mode (resolved from `rule.teaserMode`, defaulting to "hide"). */
  mode: RestrictedTeaserMode;
  /** Full rule object from checkAccess. */
  rule: RestrictedRule;
  /** Pre-computed plain-text excerpt (used only when mode === "excerpt"). */
  excerpt?: string;
  /** Current user state — drives CTA choice. */
  userState: RestrictedUserState;
  className?: string;
}

export function RestrictedContent({
  mode,
  rule,
  excerpt,
  userState,
  className,
}: RestrictedContentProps) {
  const sanitizedCustomMessage = useMemo(() => {
    if (mode !== "custom_message" || !rule.customMessage) return null;
    return DOMPurify.sanitize(rule.customMessage, {
      ALLOWED_TAGS: [
        "b",
        "i",
        "strong",
        "em",
        "a",
        "code",
        "br",
        "p",
        "ul",
        "ol",
        "li",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "blockquote",
        "span",
        "div",
      ],
      ALLOWED_ATTR: ["href", "target", "rel", "class"],
    });
  }, [mode, rule.customMessage]);

  const cta =
    userState === "logged_out" ? (
      <LoginCTA />
    ) : (
      <UpgradeCTA matchingPlanIds={rule.matchingPlanIds ?? undefined} />
    );

  return (
    <div
      data-slot="restricted-content"
      data-mode={mode}
      className={cn("flex flex-col gap-6", className)}
    >
      {mode === "excerpt" && excerpt && (
        <div
          data-slot="restricted-teaser"
          className="relative max-h-64 overflow-hidden"
        >
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {excerpt}
          </p>
          {/* Fade-out overlay hints that content continues below the gate. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-background"
          />
        </div>
      )}

      {mode === "custom_message" && sanitizedCustomMessage && (
        <div
          data-slot="restricted-custom-message"
          className="text-sm leading-relaxed text-foreground"
          dangerouslySetInnerHTML={{ __html: sanitizedCustomMessage }}
        />
      )}

      {cta}
    </div>
  );
}
