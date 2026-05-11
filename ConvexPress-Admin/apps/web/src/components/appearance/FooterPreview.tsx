/**
 * @deprecated 2026-05-11 — Legacy in-admin Theme/Template Builder.
 *
 * STATUS:  Frozen. Hidden from active nav. Do NOT extend or fix issues here.
 * REASON:  A pre-built section enum + preset theme picker limits what each
 *          site can look like. Replaced by AI-generated React components,
 *          one per route, generated per site by the design:* skill kit.
 * REPLACEMENT:  See ConvexPress-Website/design-kit/README.md
 * REMOVAL:  Safe to delete once at least one site is fully shipped via the
 *           skill kit and nothing else references this file.
 */
/**
 * FooterPreview - Real-time visual preview of footer configuration.
 *
 * Renders a mock footer inside a bordered preview container,
 * reflecting all enabled sections and layout options from FooterConfig.
 */

import { Globe, Mail, Phone, MapPin, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FooterConfig } from "./types";

interface FooterPreviewProps {
  config: FooterConfig;
}

// ─── Mock data ──────────────────────────────────────

const MOCK_NAV_ITEMS = ["Overview", "Features", "Pricing", "Docs"];

const MOCK_SOCIAL = [1, 2, 3, 4];

// ─── Sub-Components ─────────────────────────────────

function BrandingColumn({ config }: { config: FooterConfig }) {
  if (!config.branding.enabled) return null;

  return (
    <div className="flex flex-col gap-2.5">
      {config.branding.showLogo && (
        <div className="flex items-center gap-1.5">
          <div className="size-5 rounded bg-primary/20 flex items-center justify-center">
            <Globe className="size-3 text-primary" />
          </div>
          <span className="text-xs font-semibold text-foreground">MySite</span>
        </div>
      )}
      {config.branding.showDescription && (
        <p className="text-[10px] text-muted-foreground leading-relaxed max-w-[180px]">
          {config.branding.description || "Site description goes here."}
        </p>
      )}
      {config.branding.showSocial && (
        <div className="flex items-center gap-1.5">
          {MOCK_SOCIAL.map((i) => (
            <div
              key={i}
              className="size-4 rounded-full bg-foreground/10 flex items-center justify-center"
            >
              <Globe className="size-2 text-muted-foreground" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NavColumnsPreview({ config }: { config: FooterConfig }) {
  if (!config.navColumns.enabled || config.navColumns.columns.length === 0)
    return null;

  return (
    <>
      {config.navColumns.columns.map((col, i) => (
        <div key={i} className="flex flex-col gap-2">
          <span className="text-[10px] font-semibold text-foreground">
            {col.heading || `Column ${i + 1}`}
          </span>
          <div className="flex flex-col gap-1">
            {MOCK_NAV_ITEMS.map((item) => (
              <span
                key={item}
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

function NewsletterPreview({ config }: { config: FooterConfig }) {
  if (!config.newsletter.enabled) return null;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10px] font-semibold text-foreground">
        {config.newsletter.heading || "Stay Updated"}
      </span>
      {config.newsletter.subtext && (
        <p className="text-[10px] text-muted-foreground max-w-[180px]">
          {config.newsletter.subtext}
        </p>
      )}
      <div className="flex items-center gap-1">
        <div className="flex-1 h-5 rounded bg-foreground/5 border border-foreground/10 px-1.5 flex items-center">
          <span className="text-[9px] text-muted-foreground">
            your@email.com
          </span>
        </div>
        <div className="h-5 px-2 rounded bg-primary flex items-center justify-center">
          <span className="text-[9px] text-primary-foreground font-medium">
            {config.newsletter.buttonText || "Subscribe"}
          </span>
        </div>
      </div>
    </div>
  );
}

function ContactInfoPreview({ config }: { config: FooterConfig }) {
  if (!config.contactInfo.enabled) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-semibold text-foreground">
        Contact
      </span>
      {config.contactInfo.address && (
        <span className="flex items-start gap-1 text-[10px] text-muted-foreground">
          <MapPin className="size-2.5 mt-0.5 shrink-0" />
          {config.contactInfo.address}
        </span>
      )}
      {config.contactInfo.phone && (
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Phone className="size-2.5 shrink-0" />
          {config.contactInfo.phone}
        </span>
      )}
      {config.contactInfo.email && (
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Mail className="size-2.5 shrink-0" />
          {config.contactInfo.email}
        </span>
      )}
      {!config.contactInfo.address &&
        !config.contactInfo.phone &&
        !config.contactInfo.email && (
          <span className="text-[10px] text-muted-foreground/50 italic">
            No contact info set
          </span>
        )}
    </div>
  );
}

function BottomBarPreview({ config }: { config: FooterConfig }) {
  if (!config.bottomBar.enabled) return null;

  return (
    <div className="flex items-center justify-between border-t border-foreground/10 px-4 py-2">
      <span className="text-[9px] text-muted-foreground">
        {config.bottomBar.copyrightText
          ?.replace("{year}", String(new Date().getFullYear()))
          .replace("{siteName}", "MySite") ||
          `\u00a9 ${new Date().getFullYear()} MySite`}
      </span>
      <div className="flex items-center gap-3">
        {config.bottomBar.legalLinks === "privacy-terms" && (
          <>
            <span className="text-[9px] text-muted-foreground">Privacy</span>
            <span className="text-[9px] text-muted-foreground">Terms</span>
          </>
        )}
        {config.bottomBar.legalLinks === "privacy-only" && (
          <span className="text-[9px] text-muted-foreground">Privacy</span>
        )}
        {config.bottomBar.poweredBy && (
          <span className="text-[9px] text-muted-foreground/50 flex items-center gap-0.5">
            <ArrowRight className="size-2" />
            ConvexPress
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Column Count Logic ─────────────────────────────

function getGridCols(columns: FooterConfig["layout"]["columns"]): string {
  switch (columns) {
    case "1":
      return "grid-cols-1";
    case "2":
      return "grid-cols-2";
    case "3":
      return "grid-cols-3";
    case "4":
      return "grid-cols-4";
    case "centered":
      return "grid-cols-1 text-center items-center justify-items-center";
    case "minimal":
      return "grid-cols-1";
    default:
      return "grid-cols-4";
  }
}

// ─── Main Component ─────────────────────────────────

export function FooterPreview({ config }: FooterPreviewProps) {
  const bgClasses = {
    dark: "bg-foreground/5",
    "match-site": "bg-card",
    accent: "bg-primary/5",
    image: "bg-muted/50",
  };

  const borderClasses = {
    subtle: "border-t border-border/50",
    bold: "border-t-2 border-border",
    accent: "border-t-2 border-primary/50",
    none: "",
  };

  const paddingClasses = {
    compact: "px-4 py-4",
    normal: "px-4 py-6",
    spacious: "px-4 py-10",
  };

  const isMinimal = config.layout.columns === "minimal";
  const isCentered = config.layout.columns === "centered";

  return (
    <div className="rounded-lg border border-border overflow-hidden bg-muted/30">
      {/* Main Footer Area */}
      <div
        className={cn(
          bgClasses[config.layout.background],
          borderClasses[config.layout.topBorder],
          paddingClasses[config.layout.padding],
        )}
      >
        {isMinimal ? (
          /* Minimal layout: single row, branding left, links right */
          <div className="flex items-center justify-between">
            <BrandingColumn config={config} />
            <div className="flex items-center gap-4">
              {config.navColumns.enabled &&
                config.navColumns.columns.length > 0 && (
                  <div className="flex items-center gap-3">
                    {MOCK_NAV_ITEMS.map((item) => (
                      <span
                        key={item}
                        className="text-[10px] text-muted-foreground"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                )}
            </div>
          </div>
        ) : isCentered ? (
          /* Centered layout: everything stacked center */
          <div className="flex flex-col items-center gap-4">
            <BrandingColumn config={config} />
            {config.navColumns.enabled &&
              config.navColumns.columns.length > 0 && (
                <div className="flex items-center gap-4">
                  {MOCK_NAV_ITEMS.map((item) => (
                    <span
                      key={item}
                      className="text-[10px] text-muted-foreground"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              )}
            <NewsletterPreview config={config} />
            <ContactInfoPreview config={config} />
          </div>
        ) : (
          /* Grid layout */
          <div className={cn("grid gap-6", getGridCols(config.layout.columns))}>
            <BrandingColumn config={config} />
            <NavColumnsPreview config={config} />
            <NewsletterPreview config={config} />
            <ContactInfoPreview config={config} />
          </div>
        )}
      </div>

      {/* Bottom Bar */}
      <BottomBarPreview config={config} />
    </div>
  );
}
