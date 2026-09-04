/**
 * Depot · chrome.footer — a "back to top" bar, four link columns on a muted
 * band, then a compact bottom row with the copyright and the footer links.
 *
 * Same content gates as Core: an admin-authored rows footer renders through
 * the rows renderer; otherwise the legacy sections (branding, nav columns,
 * newsletter, contact) decide the columns, and the bottom bar its own row.
 */
import { Link } from "@tanstack/react-router";
import { ArrowUp, Mail, MapPin, Phone } from "lucide-react";
import { useState, type FormEvent } from "react";

import { FooterRowsRenderer } from "@/components/layout/FooterRowsRenderer";
import { SocialLinks } from "@/components/layout/SocialLinks";
import { useMenuForLocation } from "@/hooks/layout/useMenuForLocation";
import { useNewsletterSubscribe } from "@/hooks/useNewsletterSubscribe";
import type { FooterConfig, SiteIdentity } from "@/lib/layout/types";
import { cn } from "@/lib/utils";
import type { FooterSurfaceData } from "@/templates/packs/core/surfaces/chrome.footer";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Container, Label, buttonClasses } from "../parts";

type MenuLocation = "footer" | "footer-1" | "footer-2" | "footer-3";

export default function DepotFooter({ data }: SurfaceProps<FooterSurfaceData>) {
  const { variant, siteIdentity, footerConfig } = data;
  const siteTitle = siteIdentity?.title ?? "ConvexPress";

  if (variant === "minimal") {
    return (
      <footer data-slot="site-footer" data-pack="depot" role="contentinfo" className="border-t border-border bg-background">
        <Container className="py-4">
          <BottomRow siteTitle={siteTitle} footerConfig={footerConfig} showFooterMenu />
        </Container>
      </footer>
    );
  }

  const hasRows = !!footerConfig.rows && footerConfig.rows.length > 0;

  return (
    <footer data-slot="site-footer" data-pack="depot" role="contentinfo" className="mt-8 border-t border-border bg-background">
      <BackToTopBar />
      {hasRows ? <FooterRowsRenderer rows={footerConfig.rows!} /> : <LinkColumns siteIdentity={siteIdentity} siteTitle={siteTitle} footerConfig={footerConfig} />}
      {!hasRows && footerConfig.bottomBar.enabled && (
        <div className="border-t border-border">
          <Container className="py-3">
            <BottomRow siteTitle={siteTitle} footerConfig={footerConfig} showFooterMenu={!usesFooterLocation(footerConfig)} />
          </Container>
        </div>
      )}
    </footer>
  );
}

/* ───────────────────────── back to top ───────────────────────── */

function BackToTopBar() {
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
      }}
      className="flex h-10 w-full items-center justify-center gap-1.5 bg-muted text-[13px] font-medium text-foreground transition-colors hover:bg-muted/70"
    >
      <ArrowUp className="size-3.5" aria-hidden="true" />
      Back to top
    </button>
  );
}

/* ───────────────────────── columns ───────────────────────── */

/** Which menu location a legacy nav column reads; unknown sources fall back to the flat "footer" menu Core renders. */
function locationFor(source: FooterConfig["navColumns"]["columns"][number]["menuSource"]): MenuLocation {
  return source === "footer-1" || source === "footer-2" || source === "footer-3" ? source : "footer";
}

function navColumns(footerConfig: FooterConfig): Array<{ heading: string; location: MenuLocation }> {
  if (!footerConfig.navColumns.enabled) return [];
  const configured = footerConfig.navColumns.columns.map((column) => ({ heading: column.heading, location: locationFor(column.menuSource) }));
  return configured.length > 0 ? configured : [{ heading: "Links", location: "footer" }];
}

function usesFooterLocation(footerConfig: FooterConfig) {
  return navColumns(footerConfig).some((column) => column.location === "footer");
}

function LinkColumns({ siteIdentity, siteTitle, footerConfig }: { siteIdentity: SiteIdentity | undefined; siteTitle: string; footerConfig: FooterConfig }) {
  const showBranding = footerConfig.branding.enabled;
  const columns = navColumns(footerConfig);
  const showNewsletter = footerConfig.newsletter.enabled;
  const showContact = footerConfig.contactInfo.enabled;
  const nothing = !showBranding && columns.length === 0 && !showNewsletter && !showContact;

  return (
    <div className="border-t border-border bg-muted/40">
      <Container className="py-6 md:py-8">
        {nothing ? (
          <MenuColumn heading="Links" location="footer" />
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {showBranding && (
              <div className="flex flex-col gap-3">
                {footerConfig.branding.showLogo && siteIdentity?.logoUrl ? (
                  <Link to="/" className="inline-block">
                    <img src={siteIdentity.logoUrl} alt={siteIdentity.logoAlt || siteTitle} className="h-8 w-auto" />
                  </Link>
                ) : (
                  <Link to="/" className="text-base font-bold tracking-tight text-foreground no-underline">
                    {siteTitle}
                  </Link>
                )}
                {footerConfig.branding.showDescription && footerConfig.branding.description ? (
                  <p className="text-[13px] leading-5 text-muted-foreground">{footerConfig.branding.description}</p>
                ) : null}
                {footerConfig.branding.showSocial && <SocialLinks iconSize="sm" />}
              </div>
            )}
            {columns.map((column, index) => (
              <MenuColumn key={`${column.location}-${index}`} heading={column.heading} location={column.location} />
            ))}
            {showNewsletter && <NewsletterColumn config={footerConfig.newsletter} />}
            {showContact && <ContactColumn config={footerConfig.contactInfo} />}
          </div>
        )}
      </Container>
    </div>
  );
}

function MenuColumn({ heading, location }: { heading: string; location: MenuLocation }) {
  const menu = useMenuForLocation(location);
  const items = menu?.items.filter((item) => !item.isOrphaned) ?? [];
  if (items.length === 0) return null;
  return (
    <nav aria-label={heading} className="flex flex-col gap-2">
      <Label as="h3">{heading}</Label>
      <ul role="list" className="flex flex-col gap-1">
        {items.map((item) => {
          const linkProps = { ...(item.target ? { target: item.target } : {}), ...(item.rel ? { rel: item.rel } : {}) };
          const external = item.url.startsWith("http://") || item.url.startsWith("https://");
          const className = "text-[13px] text-muted-foreground transition-colors hover:text-foreground";
          return (
            <li key={item.id}>
              {external ? (
                <a href={item.url} className={className} {...linkProps}>
                  {item.label}
                </a>
              ) : (
                <Link to={item.url} className={className} {...linkProps}>
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function NewsletterColumn({ config }: { config: FooterConfig["newsletter"] }) {
  const { subscribe, status, message, reset } = useNewsletterSubscribe("site_footer");
  const [email, setEmail] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const ok = await subscribe(email);
    if (ok) setEmail("");
  };

  return (
    <div className="flex flex-col gap-2">
      <Label as="h3">{config.heading}</Label>
      {config.subtext ? <p className="text-[13px] text-muted-foreground">{config.subtext}</p> : null}
      <form onSubmit={(event) => void submit(event)} className="flex gap-2">
        <input
          type="email"
          aria-label="Email address for newsletter"
          placeholder="you@example.com"
          value={email}
          required
          onChange={(event) => {
            setEmail(event.target.value);
            if (status !== "submitting") reset();
          }}
          className="h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-[13px] text-foreground placeholder:text-muted-foreground focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <button type="submit" disabled={status === "submitting"} className={buttonClasses("primary", "md", "px-3")}>
          {status === "submitting" ? "Subscribing" : config.buttonText}
        </button>
      </form>
      {message ? (
        <p className={cn("text-xs", status === "error" ? "text-destructive" : "text-muted-foreground")} role={status === "error" ? "alert" : "status"}>
          {message}
        </p>
      ) : null}
    </div>
  );
}

function ContactColumn({ config }: { config: FooterConfig["contactInfo"] }) {
  return (
    <div className="flex flex-col gap-2">
      <Label as="h3">Contact</Label>
      <div className="flex flex-col gap-1.5 text-[13px] text-muted-foreground">
        {config.address && (
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>{config.address}</span>
          </div>
        )}
        {config.phone && (
          <a href={`tel:${config.phone}`} className="flex min-w-0 items-center gap-2 transition-colors hover:text-foreground">
            <Phone className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="break-words">{config.phone}</span>
          </a>
        )}
        {config.email && (
          <a href={`mailto:${config.email}`} className="flex min-w-0 items-center gap-2 transition-colors hover:text-foreground">
            <Mail className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="break-all">{config.email}</span>
          </a>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────── bottom row ───────────────────────── */

function BottomRow({ siteTitle, footerConfig, showFooterMenu }: { siteTitle: string; footerConfig: FooterConfig; showFooterMenu: boolean }) {
  const year = new Date().getFullYear();
  const copyrightText = footerConfig.bottomBar.copyrightText
    ? footerConfig.bottomBar.copyrightText.replace("{year}", String(year)).replace("{site}", siteTitle)
    : `© ${year} ${siteTitle}. All rights reserved.`;
  const showPoweredBy = footerConfig.bottomBar.poweredBy !== false;

  return (
    <div data-slot="footer-bottom" className="flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p>{copyrightText}</p>
        {showPoweredBy && <p className="text-muted-foreground/60">Powered by ConvexPress</p>}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {showFooterMenu && <LegalLinks />}
        <SocialLinks iconSize="sm" />
      </div>
    </div>
  );
}

/** The flat "footer" menu as the legal-links row. */
function LegalLinks() {
  const menu = useMenuForLocation("footer");
  const items = menu?.items.filter((item) => !item.isOrphaned) ?? [];
  if (items.length === 0) return null;
  return (
    <nav aria-label="Footer navigation">
      <ul role="list" className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {items.map((item) => {
          const linkProps = { ...(item.target ? { target: item.target } : {}), ...(item.rel ? { rel: item.rel } : {}) };
          const external = item.url.startsWith("http://") || item.url.startsWith("https://");
          const className = "transition-colors hover:text-foreground";
          return (
            <li key={item.id}>
              {external ? (
                <a href={item.url} className={className} {...linkProps}>
                  {item.label}
                </a>
              ) : (
                <Link to={item.url} className={className} {...linkProps}>
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
