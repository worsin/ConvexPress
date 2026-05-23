import { useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { Mail, MapPin, Phone } from "lucide-react";
import { api } from "@convexpress-website/backend/generated/api";

import { cn } from "@/lib/utils";
import { useSiteIdentity } from "@/hooks/layout/useSiteIdentity";
import { useFooterConfig } from "@/hooks/layout/useFooterConfig";
import type { FooterConfig } from "@/lib/layout/types";

import { FooterBottom } from "./FooterBottom";
import { FooterNav } from "./FooterNav";
import { FooterRowsRenderer } from "./FooterRowsRenderer";
import { SocialLinks } from "./SocialLinks";

interface SiteFooterProps {
  variant?: "full" | "minimal";
}

/**
 * Site-wide footer rendered dynamically from admin footer settings.
 * "minimal" variant shows only the copyright line (used in dashboard layout).
 * Falls back to standard layout when no config is stored.
 */
export function SiteFooter({ variant = "full" }: SiteFooterProps) {
  const siteIdentity = useSiteIdentity();
  const footerConfig = useFooterConfig();
  const siteTitle = siteIdentity?.title ?? "ConvexPress";

  // v2 rows builder: if the admin has authored rows, render them and skip
  // the legacy section-toggle path entirely. Minimal variant still uses the
  // legacy bottom-bar shape since rows are designed for the full footer.
  if (variant === "full" && footerConfig.rows && footerConfig.rows.length > 0) {
    return (
      <footer data-slot="site-footer" role="contentinfo">
        <FooterRowsRenderer rows={footerConfig.rows} />
      </footer>
    );
  }

  if (variant === "minimal") {
    return (
      <footer
        data-slot="site-footer"
        role="contentinfo"
        className="border-t border-border bg-background"
      >
        <div className="mx-auto max-w-5xl px-4 py-4 md:px-6 lg:px-8">
          <FooterBottom siteTitle={siteTitle} footerConfig={footerConfig} />
        </div>
      </footer>
    );
  }

  const paddingClass = footerConfig.layout.padding === "compact"
    ? "py-6 lg:py-8"
    : footerConfig.layout.padding === "spacious"
      ? "py-12 lg:py-16"
      : "py-8 lg:py-12";

  const backgroundClass = footerConfig.layout.background === "dark"
    ? "bg-muted/30"
    : footerConfig.layout.background === "accent"
      ? "bg-accent/10"
      : "bg-background";

  const borderClass = footerConfig.layout.topBorder === "bold"
    ? "border-t-2 border-border"
    : footerConfig.layout.topBorder === "accent"
      ? "border-t-2 border-accent"
      : footerConfig.layout.topBorder === "none"
        ? ""
        : "border-t border-border";

  return (
    <footer
      data-slot="site-footer"
      role="contentinfo"
      className={cn(borderClass, backgroundClass)}
    >
      <div className={cn("mx-auto max-w-5xl px-4 md:px-6 lg:px-8", paddingClass)}>
        {/* Main footer content area */}
        <FooterContent
          footerConfig={footerConfig}
          siteIdentity={siteIdentity}
          siteTitle={siteTitle}
        />

        {/* Bottom bar */}
        {footerConfig.bottomBar.enabled && (
          <div className="mt-6 border-t border-border pt-6">
            <FooterBottom siteTitle={siteTitle} footerConfig={footerConfig} />
          </div>
        )}
      </div>
    </footer>
  );
}

// ─── Footer Content (columns-driven) ───────────────────────────────────────

interface FooterContentProps {
  footerConfig: FooterConfig;
  siteIdentity: ReturnType<typeof useSiteIdentity>;
  siteTitle: string;
}

function FooterContent({ footerConfig, siteIdentity, siteTitle }: FooterContentProps) {
  const showBranding = footerConfig.branding.enabled;
  const showNavColumns = footerConfig.navColumns.enabled;
  const showNewsletter = footerConfig.newsletter.enabled;
  const showContact = footerConfig.contactInfo.enabled;
  const subscribeNewsletter = useMutation(
    (api as any).emails.mutations.subscribeNewsletter,
  );
  const [newsletterEmail, setNewsletterEmail] = useState("");
  const [newsletterStatus, setNewsletterStatus] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [newsletterMessage, setNewsletterMessage] = useState("");

  async function handleNewsletterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNewsletterStatus("submitting");
    setNewsletterMessage("");
    try {
      await subscribeNewsletter({
        email: newsletterEmail,
        source: "site_footer",
      });
      setNewsletterEmail("");
      setNewsletterStatus("success");
      setNewsletterMessage("You're subscribed.");
    } catch (error) {
      setNewsletterStatus("error");
      setNewsletterMessage(
        (error as { data?: { message?: string } })?.data?.message ??
          "Could not subscribe. Please try again.",
      );
    }
  }

  // If nothing is enabled, just show the nav links (backwards compatible)
  if (!showBranding && !showNavColumns && !showNewsletter && !showContact) {
    return (
      <div className="pt-0">
        <FooterNav />
      </div>
    );
  }

  return (
    <div className={cn(
      "grid gap-8",
      getColumnsGridClass(footerConfig.layout.columns),
    )}>
      {/* Branding column */}
      {showBranding && (
        <div className="space-y-4">
          {footerConfig.branding.showLogo && siteIdentity?.logoUrl && (
            <Link to="/" className="inline-block">
              <img
                src={siteIdentity.logoUrl}
                alt={siteIdentity.logoAlt || siteTitle}
                className="h-8 w-auto"
              />
            </Link>
          )}
          {!footerConfig.branding.showLogo && (
            <Link to="/" className="text-sm font-semibold text-foreground no-underline">
              {siteTitle}
            </Link>
          )}
          {footerConfig.branding.showDescription && footerConfig.branding.description && (
            <p className="text-xs text-muted-foreground leading-relaxed">
              {footerConfig.branding.description}
            </p>
          )}
          {footerConfig.branding.showSocial && (
            <SocialLinks iconSize="sm" />
          )}
        </div>
      )}

      {/* Nav columns */}
      {showNavColumns && (
        <FooterNav />
      )}

      {/* Newsletter section */}
      {showNewsletter && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">
            {footerConfig.newsletter.heading}
          </h3>
          {footerConfig.newsletter.subtext && (
            <p className="text-xs text-muted-foreground">
              {footerConfig.newsletter.subtext}
            </p>
          )}
          <form
            onSubmit={handleNewsletterSubmit}
            className="flex gap-2"
          >
            <input
              type="email"
              placeholder="you@example.com"
              value={newsletterEmail}
              onChange={(event) => {
                setNewsletterEmail(event.target.value);
                if (newsletterStatus !== "submitting") {
                  setNewsletterStatus("idle");
                  setNewsletterMessage("");
                }
              }}
              className="flex-1 border border-border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              required
            />
            <button
              type="submit"
              disabled={newsletterStatus === "submitting"}
              className="bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-colors hover:bg-foreground/90"
            >
              {newsletterStatus === "submitting"
                ? "Subscribing"
                : footerConfig.newsletter.buttonText}
            </button>
          </form>
          {newsletterMessage && (
            <p
              className={cn(
                "text-xs",
                newsletterStatus === "error"
                  ? "text-destructive"
                  : "text-muted-foreground",
              )}
              role={newsletterStatus === "error" ? "alert" : "status"}
            >
              {newsletterMessage}
            </p>
          )}
        </div>
      )}

      {/* Contact info */}
      {showContact && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Contact</h3>
          <div className="space-y-2 text-xs text-muted-foreground">
            {footerConfig.contactInfo.address && (
              <div className="flex items-start gap-2">
                <MapPin className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                <span>{footerConfig.contactInfo.address}</span>
              </div>
            )}
            {footerConfig.contactInfo.phone && (
              <a href={`tel:${footerConfig.contactInfo.phone}`} className="flex items-center gap-2 transition-colors hover:text-foreground">
                <Phone className="size-3 shrink-0" aria-hidden="true" />
                <span>{footerConfig.contactInfo.phone}</span>
              </a>
            )}
            {footerConfig.contactInfo.email && (
              <a href={`mailto:${footerConfig.contactInfo.email}`} className="flex items-center gap-2 transition-colors hover:text-foreground">
                <Mail className="size-3 shrink-0" aria-hidden="true" />
                <span>{footerConfig.contactInfo.email}</span>
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getColumnsGridClass(columns: FooterConfig["layout"]["columns"]): string {
  switch (columns) {
    case "1":
      return "grid-cols-1";
    case "2":
      return "grid-cols-1 md:grid-cols-2";
    case "3":
      return "grid-cols-1 md:grid-cols-3";
    case "4":
      return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4";
    case "centered":
      return "grid-cols-1 place-items-center text-center";
    case "minimal":
      return "grid-cols-1";
    default:
      return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4";
  }
}
