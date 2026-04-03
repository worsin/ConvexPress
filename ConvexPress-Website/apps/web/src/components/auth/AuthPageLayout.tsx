import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import * as React from "react";
import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface AuthPageLayoutProps {
  children: React.ReactNode;
  title: string;
  description?: string;
  showLogo?: boolean;
  maxWidth?: "sm" | "md" | "lg";
}

const maxWidthClasses = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
};

export function AuthPageLayout({
  children,
  title,
  description,
  showLogo = true,
  maxWidth = "sm",
}: AuthPageLayoutProps) {
  // Fetch site settings for dynamic branding.
  // Falls back to "ConvexPress" while loading or if settings are not configured.
  const publicSettings = useQuery(api.settings.queries.getPublic);
  const siteTitle =
    (publicSettings?.siteTitle as string | undefined) || "ConvexPress";
  const siteLogo =
    (publicSettings?.siteLogo as string | undefined) || undefined;

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
