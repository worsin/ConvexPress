import { MenuItemTarget } from "@/components/menus/MenuItemTarget";
/**
 * Journal · chrome.footer — a masthead: the wordmark set large across the top,
 * the configured footer rows as narrow columns of small links, then a rule and
 * the copyright line. Newsletter forms use one underline-style input.
 *
 * Renders both admin footer shapes: the v2 rows builder and the legacy
 * section toggles. "minimal" shows only the rule and copyright (dashboard).
 */
import { Link } from "@tanstack/react-router";
import DOMPurify from "@/lib/html-sanitizer";
import { useState, type FormEvent } from "react";

import { SocialLinks } from "@/components/layout/SocialLinks";
import { MediaImage } from "@/components/media/MediaImage";
import { useMenuForLocation } from "@/hooks/layout/useMenuForLocation";
import { useSiteIdentity } from "@/hooks/layout/useSiteIdentity";
import { useNewsletterSubscribe } from "@/hooks/useNewsletterSubscribe";
import type { FooterCell, FooterColumn, FooterConfig, FooterRow, ResolvedMenuItem, SiteIdentity } from "@/lib/layout/types";
import { cn } from "@/lib/utils";
import type { FooterSurfaceData } from "@/templates/packs/core/surfaces/chrome.footer";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Container, Rule, SmallCaps, UnderlineInput } from "../parts";

export default function JournalChromeFooter({ data }: SurfaceProps<FooterSurfaceData>) {
  const { variant, siteIdentity, footerConfig } = data;
  const siteTitle = siteIdentity?.title ?? "";

  if (variant === "minimal") {
    return (
      <footer data-slot="site-footer" data-customize="footer.layout.background" role="contentinfo" className="border-t border-border bg-background">
        <Container className="py-6">
          <Copyright siteTitle={siteTitle} footerConfig={footerConfig} />
        </Container>
      </footer>
    );
  }

  const rows = footerConfig.rows ?? [];
  const padding = footerConfig.layout.padding === "compact" ? "py-10 md:py-14" : footerConfig.layout.padding === "spacious" ? "py-20 md:py-28" : "py-14 md:py-20";

  return (
    <footer data-slot="site-footer" data-customize="footer.layout.background" role="contentinfo" className={cn("border-t border-border bg-background", footerConfig.layout.background === "dark" && "bg-muted/30")}>
      <Container className={cn("flex flex-col gap-12", padding)}>
        <Masthead siteIdentity={siteIdentity} footerConfig={footerConfig} />
        {rows.length > 0 ? (
          <div className="flex flex-col gap-12">
            {rows.map((row) => (
              <RowColumns key={row.id} row={row} />
            ))}
          </div>
        ) : (
          <LegacyColumns footerConfig={footerConfig} />
        )}
        {footerConfig.bottomBar.enabled || rows.length > 0 ? (
          <div className="flex flex-col gap-6">
            <Rule />
            <Copyright siteTitle={siteTitle} footerConfig={footerConfig} />
          </div>
        ) : null}
      </Container>
    </footer>
  );
}

/* ───────────────────────── masthead ───────────────────────── */

function Masthead({ siteIdentity, footerConfig }: { siteIdentity: SiteIdentity | undefined; footerConfig: FooterConfig }) {
  const title = siteIdentity?.title ?? "";
  const showLogo = footerConfig.branding.showLogo && !!siteIdentity?.logoUrl && (footerConfig.rows?.length ?? 0) === 0;
  return (
    <div className="flex flex-col gap-4">
      <Link to="/" className="inline-flex items-center gap-4 text-foreground no-underline">
        {showLogo ? <img src={siteIdentity!.logoUrl} alt={siteIdentity!.logoAlt || title} className="h-10 w-auto" /> : null}
        <span className="font-display text-5xl leading-none tracking-tight md:text-7xl">{title}</span>
      </Link>
      {siteIdentity?.tagline ? <p className="max-w-[48ch] text-base leading-7 text-muted-foreground">{siteIdentity.tagline}</p> : null}
    </div>
  );
}

/* ───────────────────────── rows builder ───────────────────────── */

const SPAN: Record<number, string> = {
  1: "lg:col-span-1",
  2: "lg:col-span-2",
  3: "lg:col-span-3",
  4: "lg:col-span-4",
  5: "lg:col-span-5",
  6: "lg:col-span-6",
  7: "lg:col-span-7",
  8: "lg:col-span-8",
  9: "lg:col-span-9",
  10: "lg:col-span-10",
  11: "lg:col-span-11",
  12: "lg:col-span-12",
};

function RowColumns({ row }: { row: FooterRow }) {
  const align = row.alignment === "center" ? "text-center items-center" : row.alignment === "right" ? "text-right items-end" : "";
  return (
    <div className={cn("flex flex-col gap-6", row.topBorder && row.topBorder !== "none" && "border-t border-border pt-10")}>
      {row.heading ? <SmallCaps as="h2">{row.heading}</SmallCaps> : null}
      <div className={cn("grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-12", align)}>
        {row.columns.map((column) => (
          <Column key={column.id} column={column} total={row.columns.length} />
        ))}
      </div>
    </div>
  );
}

function Column({ column, total }: { column: FooterColumn; total: number }) {
  const width = column.width ?? Math.max(1, Math.floor(12 / Math.max(1, total)));
  const align = column.alignment === "center" ? "text-center items-center" : column.alignment === "right" ? "text-right items-end" : "";
  return (
    <div className={cn("flex min-w-0 flex-col gap-3", SPAN[Math.min(12, Math.max(1, width))], align)}>
      <Cell cell={column.cell} />
    </div>
  );
}

function CellHeading({ children }: { children?: string }) {
  if (!children) return null;
  return <SmallCaps as="h3" className="text-foreground">{children}</SmallCaps>;
}

const linkClass = "text-sm leading-6 text-muted-foreground transition-colors hover:text-foreground";

function Cell({ cell }: { cell: FooterCell }) {
  switch (cell.type) {
    case "text":
      return (
        <>
          <CellHeading>{cell.heading}</CellHeading>
          <p className="whitespace-pre-line text-sm leading-6 text-muted-foreground">{cell.body}</p>
        </>
      );
    case "links":
      return (
        <>
          <CellHeading>{cell.heading}</CellHeading>
          <ul className="flex flex-col gap-1.5">
            {cell.items.map((item, index) => (
              <li key={index}>
                <a href={item.url} target={item.target ?? "_self"} rel={item.rel} className={linkClass}>
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </>
      );
    case "nav":
      return <NavCell heading={cell.heading} location={cell.menuLocation} />;
    case "image":
      return <ImageCell mediaId={cell.mediaId} alt={cell.alt} href={cell.href} width={cell.width} />;
    case "social":
      return (
        <>
          <CellHeading>{cell.heading}</CellHeading>
          <SocialLinks iconSize="sm" showLabels={cell.style === "icons-and-labels" || cell.style === "labels"} hideIcons={cell.style === "labels"} />
        </>
      );
    case "newsletter":
      return <NewsletterForm heading={cell.heading} subtext={cell.subtext} buttonText={cell.buttonText} />;
    case "contact":
      return (
        <>
          <CellHeading>{cell.heading}</CellHeading>
          <div className="flex flex-col gap-1.5 text-sm leading-6 text-muted-foreground">
            {cell.address ? <p className="whitespace-pre-line">{cell.address}</p> : null}
            {cell.phone ? (
              <a href={`tel:${cell.phone}`} className={linkClass}>
                {cell.phone}
              </a>
            ) : null}
            {cell.email ? (
              <a href={`mailto:${cell.email}`} className={cn(linkClass, "break-all")}>
                {cell.email}
              </a>
            ) : null}
          </div>
        </>
      );
    case "brand":
      return <BrandCell showLogo={cell.showLogo} showTagline={cell.showTagline} description={cell.showDescription ? cell.description : ""} />;
    case "html":
      return cell.rawHtml ? <div className="text-sm leading-6 text-muted-foreground" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(cell.rawHtml) }} /> : null;
    case "divider":
      return <Rule className={cn(cell.thickness === "medium" && "border-t-2", cell.thickness === "thick" && "border-t-4")} />;
    case "copyright":
      return <p className="text-sm text-muted-foreground">{cell.insertYear ? cell.text.replace(/\{year\}/g, String(new Date().getFullYear())) : cell.text}</p>;
    case "payments":
      return cell.methods.length ? (
        <div className="flex flex-wrap items-center gap-2">
          {cell.methods.map((method) => (
            <span key={method} className="rounded-full border border-border px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {method}
            </span>
          ))}
        </div>
      ) : null;
  }
}

function NavCell({ heading, location }: { heading?: string; location: string }) {
  const menu = useMenuForLocation(location);
  if (!menu) return null;
  return (
    <>
      <CellHeading>{heading || menu.name}</CellHeading>
      <MenuLinks items={menu.items} />
    </>
  );
}

function MenuLinks({ items }: { items: ResolvedMenuItem[] }) {
  const visible = items.filter((item) => !item.isOrphaned);
  if (visible.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1.5">
      {visible.map((item) => {
        const props = { ...(item.target ? { target: item.target } : {}), ...(item.rel ? { rel: item.rel } : {}) };
        return (
          <li key={item.id}>
            <MenuItemTarget item={item} className={cn(linkClass, item.cssClasses)} {...props} />
          </li>
        );
      })}
    </ul>
  );
}

function ImageCell({ mediaId, alt, href, width }: { mediaId: string | null; alt: string; href?: string; width?: number }) {
  if (!mediaId) return null;
  const isUrl = mediaId.startsWith("http://") || mediaId.startsWith("https://");
  const image = isUrl ? (
    <img src={mediaId} alt={alt} style={{ width: width ?? 200, height: "auto" }} loading="lazy" />
  ) : (
    <div style={{ width: width ?? 200 }}>
      <MediaImage mediaId={mediaId as any} alt={alt} className="h-auto w-full" preferredSize="medium" sizes={`${width ?? 200}px`} />
    </div>
  );
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className="inline-block">
        {image}
      </a>
    );
  }
  return image;
}

function BrandCell({ showLogo, showTagline, description }: { showLogo: boolean; showTagline: boolean; description: string }) {
  // The masthead already sets the wordmark large; this cell adds the logo mark, tagline and description the admin asked for.
  const identity = useSiteIdentity();
  const title = identity?.title ?? "";
  return (
    <div className="flex flex-col gap-3">
      {showLogo && identity?.logoUrl ? (
        <Link to="/" className="inline-block">
          <img src={identity.logoUrl} alt={identity.logoAlt || title} className="h-8 w-auto" />
        </Link>
      ) : null}
      {showTagline && identity?.tagline ? <p className="text-sm leading-6 text-muted-foreground">{identity.tagline}</p> : null}
      {description ? <p className="text-sm leading-6 text-muted-foreground">{description}</p> : null}
    </div>
  );
}

/* ───────────────────────── legacy sections ───────────────────────── */

function LegacyColumns({ footerConfig }: { footerConfig: FooterConfig }) {
  const showBranding = footerConfig.branding.enabled;
  const showNav = footerConfig.navColumns.enabled;
  const showNewsletter = footerConfig.newsletter.enabled;
  const showContact = footerConfig.contactInfo.enabled;
  const navColumns = showNav ? footerConfig.navColumns.columns : [];

  if (!showBranding && !showNav && !showNewsletter && !showContact) {
    return <FooterLocationLinks location="footer" inline />;
  }

  return (
    <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
      {showBranding ? (
        <div className="flex flex-col gap-3">
          {footerConfig.branding.showDescription && footerConfig.branding.description ? (
            <p className="text-sm leading-6 text-muted-foreground">{footerConfig.branding.description}</p>
          ) : null}
          {footerConfig.branding.showSocial ? <SocialLinks iconSize="sm" /> : null}
        </div>
      ) : null}
      {navColumns.map((column, index) => (
        <FooterColumn
          key={`${column.menuSource}-${index}`}
          heading={column.heading}
          location={column.menuSource === "footer-1" || column.menuSource === "footer-2" || column.menuSource === "footer-3" ? column.menuSource : "footer"}
          first={index === 0}
        />
      ))}
      {showNewsletter ? (
        <div className="flex flex-col gap-3">
          <NewsletterForm heading={footerConfig.newsletter.heading} subtext={footerConfig.newsletter.subtext} buttonText={footerConfig.newsletter.buttonText} />
        </div>
      ) : null}
      {showContact ? (
        <div className="flex flex-col gap-3">
          <CellHeading>Contact</CellHeading>
          <div className="flex flex-col gap-1.5 text-sm leading-6 text-muted-foreground">
            {footerConfig.contactInfo.address ? <p className="whitespace-pre-line">{footerConfig.contactInfo.address}</p> : null}
            {footerConfig.contactInfo.phone ? (
              <a href={`tel:${footerConfig.contactInfo.phone}`} className={linkClass}>
                {footerConfig.contactInfo.phone}
              </a>
            ) : null}
            {footerConfig.contactInfo.email ? (
              <a href={`mailto:${footerConfig.contactInfo.email}`} className={cn(linkClass, "break-all")}>
                {footerConfig.contactInfo.email}
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** A heading + links column; renders nothing when its menu location has no links (the first column falls back to the Footer menu). */
function FooterColumn({ heading, location, first }: { heading: string; location: string; first: boolean }) {
  const located = useMenuForLocation(location);
  const fallback = useMenuForLocation("footer");
  const menu = located && located.items.some((item) => !item.isOrphaned) ? located : first ? fallback : null;
  const visible = menu ? menu.items.filter((item) => !item.isOrphaned) : [];
  if (visible.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      <CellHeading>{heading}</CellHeading>
      <MenuLinks items={visible} />
    </div>
  );
}

function FooterLocationLinks({ location, inline = false }: { location: string; inline?: boolean }) {
  const located = useMenuForLocation(location);
  // Column locations (footer-1/2/3) that are not assigned fall back to the site's Footer menu,
  // so a site that only built one footer menu still shows it.
  const fallback = useMenuForLocation(location === "footer" ? "footer" : "footer");
  const menu = located && located.items.some((item) => !item.isOrphaned) ? located : location === "footer-1" ? fallback : located;
  if (!menu) return null;
  const visible = menu.items.filter((item) => !item.isOrphaned);
  if (visible.length === 0) return null;
  if (!inline) return <MenuLinks items={visible} />;
  return (
    <nav data-slot="footer-nav" aria-label="Footer navigation">
      <ul className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {visible.map((item) => {
          const props = { ...(item.target ? { target: item.target } : {}), ...(item.rel ? { rel: item.rel } : {}) };
          return (
            <li key={item.id}>
              <MenuItemTarget item={item} separatorOrientation="vertical" className={linkClass} {...props}>
                  {item.label}
                </MenuItemTarget>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* ───────────────────────── newsletter + copyright ───────────────────────── */

function NewsletterForm({ heading, subtext, buttonText }: { heading?: string; subtext?: string; buttonText: string }) {
  const { subscribe, status, message, reset } = useNewsletterSubscribe("site_footer");
  const [email, setEmail] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = await subscribe(email);
    if (ok) setEmail("");
  }

  return (
    <>
      <CellHeading>{heading}</CellHeading>
      {subtext ? <p className="text-sm leading-6 text-muted-foreground">{subtext}</p> : null}
      <form onSubmit={onSubmit} className="flex items-end gap-4">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Email address for newsletter</span>
          <UnderlineInput
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              if (status !== "submitting") reset();
            }}
            className="h-10 text-sm"
            required
          />
        </label>
        <button
          type="submit"
          disabled={status === "submitting"}
          className="h-10 shrink-0 text-sm font-medium text-foreground underline decoration-border underline-offset-[6px] transition-colors hover:decoration-foreground disabled:opacity-50"
        >
          {status === "submitting" ? "Subscribing" : buttonText}
        </button>
      </form>
      {message ? (
        <p className={cn("text-xs", status === "error" ? "text-destructive" : "text-muted-foreground")} role={status === "error" ? "alert" : "status"}>
          {message}
        </p>
      ) : null}
    </>
  );
}

function Copyright({ siteTitle, footerConfig }: { siteTitle: string; footerConfig: FooterConfig }) {
  const year = new Date().getFullYear();
  const text = footerConfig.bottomBar.copyrightText
    ? footerConfig.bottomBar.copyrightText.replace(/\{year\}/g, () => String(year)).replace(/\{(?:site|siteName)\}/g, () => siteTitle)
    : `© ${year} ${siteTitle}. All rights reserved.`;
  const poweredBy = footerConfig.bottomBar.poweredBy !== false;
  return (
    <div data-slot="footer-bottom" className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <p className="text-xs text-muted-foreground">{text}</p>
        {poweredBy ? <p className="text-xs text-muted-foreground/60">Powered by ConvexPress</p> : null}
      </div>
      <SocialLinks iconSize="sm" />
    </div>
  );
}
