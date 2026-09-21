/**
 * Aster · auth.shell — the frame around every sign-in / sign-up screen: a
 * centred column with the wordmark on top, the title in display type, one
 * sentence, a rule, then the screen's content, and a quiet "Back to home".
 *
 * No card. The shared auth forms (LoginForm, RegisterForm, OAuthButtons…)
 * keep their behaviour; this frame restyles their controls into Aster's
 * vocabulary — underline inputs, one field per row, pill buttons — through
 * descendant selectors on the `data-slot` attributes the UI primitives set.
 */
import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils";
import type { AuthShellSurfaceData } from "@/templates/packs/core/surfaces/auth.shell";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Rule } from "../parts";

const WIDTH_CLASSES = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
} as const;

/** Underline inputs, pill buttons, small-caps labels for the shared auth components. */
export const JOURNAL_FORM_FRAME = [
  "[&_[data-slot=input]]:h-11 [&_[data-slot=input]]:rounded-none [&_[data-slot=input]]:border-0 [&_[data-slot=input]]:border-b [&_[data-slot=input]]:border-border [&_[data-slot=input]]:bg-transparent [&_[data-slot=input]]:pl-0 [&_[data-slot=input]]:text-base [&_[data-slot=input]]:shadow-none",
  "[&_[data-slot=input]:focus-visible]:border-foreground [&_[data-slot=input]:focus-visible]:ring-0",
  "[&_[data-slot=input][aria-invalid=true]]:border-destructive",
  "[&_[data-slot=label]]:text-[11px] [&_[data-slot=label]]:font-medium [&_[data-slot=label]]:uppercase [&_[data-slot=label]]:tracking-[0.18em] [&_[data-slot=label]]:text-muted-foreground",
  "[&_[data-slot=button]]:rounded-full",
  "[&_[data-slot=auth-link]]:text-foreground [&_[data-slot=auth-link]]:underline [&_[data-slot=auth-link]]:decoration-border [&_[data-slot=auth-link]]:underline-offset-4 [&_[data-slot=auth-link]:hover]:decoration-foreground",
  "[&_[data-slot=auth-error]]:rounded-none [&_[data-slot=auth-error]]:border-0 [&_[data-slot=auth-error]]:border-l-2 [&_[data-slot=auth-error]]:border-destructive [&_[data-slot=auth-error]]:bg-transparent [&_[data-slot=auth-error]]:pl-4 [&_[data-slot=auth-error]]:pr-0",
].join(" ");

export default function AsterAuthShell({ data }: SurfaceProps<AuthShellSurfaceData>) {
  const { title, description, showLogo, maxWidth, siteTitle, siteLogo, children } = data;

  return (
    <div data-slot="auth-page-layout" className="flex min-h-svh flex-col items-center justify-center bg-background px-5 py-12 sm:px-8">
      <div className={cn("flex w-full flex-col items-center gap-8", WIDTH_CLASSES[maxWidth])}>
        {showLogo ? (
          <div data-slot="auth-logo">
            <Link to="/" className="inline-flex items-center gap-3 text-foreground no-underline">
              {siteLogo ? <img src={siteLogo} alt={siteTitle} className="h-8 w-auto object-contain" /> : <span className="font-display text-2xl tracking-tight">{siteTitle}</span>}
            </Link>
          </div>
        ) : null}

        <header className="flex flex-col items-center gap-3 text-center">
          <h1 className="font-display text-3xl leading-[1.08] tracking-tight text-foreground text-balance md:text-4xl">{title}</h1>
          {description ? <p className="max-w-[40ch] text-base leading-8 text-muted-foreground text-balance">{description}</p> : null}
        </header>

        <Rule className="w-full" />

        <div data-slot="auth-body" className={cn("flex w-full flex-col gap-5", JOURNAL_FORM_FRAME)}>
          {children}
        </div>

        <div data-slot="auth-footer">
          <Link to="/" className="text-xs text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground">
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
