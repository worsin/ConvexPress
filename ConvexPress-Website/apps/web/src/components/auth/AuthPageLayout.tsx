/**
 * AuthPageLayout — the loader behind the `auth.shell` surface.
 *
 * Reads the site identity from the SSR-hydrated settings context (so the
 * title renders identically on the server and the client) and hands it,
 * with the screen's title/description, to the active template pack's
 * `auth.shell` surface. Every auth route wraps its content in this. The logo
 * is the site identity's, as in the header and footer.
 */
import * as React from "react";

import { useSiteIdentity } from "@/hooks/layout/useSiteIdentity";
import CoreAuthShell, { type AuthShellSurfaceData } from "@/templates/packs/core/surfaces/auth.shell";
import { Surface } from "@/templates/sdk/Surface";

interface AuthPageLayoutProps {
  children: React.ReactNode;
  title: string;
  description?: string;
  showLogo?: boolean;
  maxWidth?: "sm" | "md" | "lg";
}

export function AuthPageLayout({
  children,
  title,
  description,
  showLogo = true,
  maxWidth = "sm",
}: AuthPageLayoutProps) {
  const identity = useSiteIdentity();
  const siteTitle = identity?.title || "ConvexPress";
  // The logo's URL. General settings' `siteLogo` is its media id, not an image source.
  const siteLogo = identity?.logoUrl || undefined;

  const data: AuthShellSurfaceData = {
    title,
    description,
    showLogo,
    maxWidth,
    siteTitle,
    siteLogo,
    children,
  };

  return <Surface name="auth.shell" data={data} fallback={CoreAuthShell} />;
}
