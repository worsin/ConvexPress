/**
 * Core · auth.shell — the frame around every sign-in / sign-up screen: the
 * site logo (or name), a centred card with title and description, and the
 * "Back to home" link.
 */
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { SurfaceProps } from "@/templates/sdk/types";

export interface AuthShellSurfaceData {
  title: string;
  description?: string;
  /** Show the site logo / name above the card. */
  showLogo: boolean;
  maxWidth: "sm" | "md" | "lg";
  /** Site title from the public settings (falls back to "ConvexPress"). */
  siteTitle: string;
  /** Site logo URL, when the site has one. */
  siteLogo?: string;
  children: ReactNode;
}

const maxWidthClasses = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
};

export default function CoreAuthShell({ data }: SurfaceProps<AuthShellSurfaceData>) {
  const { title, description, showLogo, maxWidth, siteTitle, siteLogo, children } = data;

  return (
    <div
      data-slot="auth-page-layout"
      className="flex min-h-svh flex-col items-center justify-center bg-background bg-[radial-gradient(ellipse_at_top,var(--color-muted)/0.15,transparent_70%)] px-4 py-8"
    >
      {/* Logo / Site Name */}
      {showLogo && (
        <div data-slot="auth-logo" className="mb-6">
          <Link to="/" className="inline-flex items-center gap-2">
            {siteLogo ? (
              <img
                src={siteLogo}
                alt={siteTitle}
                className="h-8 w-auto object-contain"
              />
            ) : (
              <span className="text-sm font-semibold tracking-tight text-foreground">
                {siteTitle}
              </span>
            )}
          </Link>
        </div>
      )}

      {/* Auth Card */}
      <Card className={cn("w-full", maxWidthClasses[maxWidth])}>
        <CardHeader className="text-center">
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
          {description && (
            <CardDescription>{description}</CardDescription>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {children}
        </CardContent>
      </Card>

      {/* Back to home */}
      <div data-slot="auth-footer" className="mt-6">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-3" />
          Back to home
        </Link>
      </div>
    </div>
  );
}
