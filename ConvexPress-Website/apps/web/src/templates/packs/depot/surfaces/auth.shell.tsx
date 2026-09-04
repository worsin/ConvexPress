/**
 * Depot · auth.shell — the frame around every sign-in / sign-up screen: a
 * `Card` centred on a muted band, the site wordmark above, a plain heading
 * with a small description, compact fields (`h-10`, `rounded-md`) and the
 * "Back to home" link below. Same data and slots as Core.
 */
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { cn } from "@/lib/utils";
import type { AuthShellSurfaceData } from "@/templates/packs/core/surfaces/auth.shell";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Card } from "../parts";
import { frameReset } from "../parts/extra-plugins";

const maxWidthClasses = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
};

export default function DepotAuthShell({ data }: SurfaceProps<AuthShellSurfaceData>) {
  const { title, description, showLogo, maxWidth, siteTitle, siteLogo, children } = data;

  return (
    <div data-slot="auth-page-layout" data-pack="depot" className="flex min-h-svh flex-col items-center justify-center bg-muted/40 px-4 py-8">
      {showLogo && (
        <div data-slot="auth-logo" className="mb-4">
          <Link to="/" className="inline-flex items-center gap-2">
            {siteLogo ? <img src={siteLogo} alt={siteTitle} className="h-8 w-auto object-contain" /> : <span className="text-base font-bold tracking-tight text-foreground">{siteTitle}</span>}
          </Link>
        </div>
      )}

      <Card className={cn("w-full p-5 sm:p-6", maxWidthClasses[maxWidth])}>
        <header className="mb-4 flex flex-col gap-1 border-b border-border pb-4">
          <h1 className="text-lg font-semibold text-foreground">{title}</h1>
          {description && <p className="text-[13px] leading-5 text-muted-foreground">{description}</p>}
        </header>
        <div className={cn("flex flex-col gap-4 [&_[data-slot=auth-error]]:rounded-md [&_[data-slot=button]]:h-10", frameReset)}>{children}</div>
      </Card>

      <div data-slot="auth-footer" className="mt-4">
        <Link to="/" className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Back to home
        </Link>
      </div>
    </div>
  );
}
