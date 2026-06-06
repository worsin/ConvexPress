/**
 * FooterRowsRenderer — renders the v2 block-style footer.
 *
 * Mirror of the admin's FooterRowsBuilder data shape. Each row becomes a
 * horizontal stripe; each column is a flex-grid cell that delegates to a
 * dedicated renderer per cell type.
 */

import { useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import DOMPurify from "isomorphic-dompurify";
import { useMutation, useQuery } from "convex/react";
import { Mail, MapPin, Phone } from "lucide-react";
import { api } from "@convexpress-website/backend/generated/api";

import { cn } from "@/lib/utils";
import { useSiteIdentity } from "@/hooks/layout/useSiteIdentity";
import { useMenuForLocation } from "@/hooks/layout/useMenuForLocation";
import type {
  FooterBrandCell,
  FooterCell,
  FooterColumn,
  FooterContactCell,
  FooterCopyrightCell,
  FooterDividerCell,
  FooterHtmlCell,
  FooterImageCell,
  FooterLinksCell,
  FooterNavCell,
  FooterNewsletterCell,
  FooterPaymentsCell,
  FooterRow,
  FooterSocialCell,
  FooterTextCell,
  ResolvedMenuItem,
} from "@/lib/layout/types";

import { SocialLinks } from "./SocialLinks";

interface FooterRowsRendererProps {
  rows: FooterRow[];
}

export function FooterRowsRenderer({ rows }: FooterRowsRendererProps) {
  return (
    <>
      {rows.map((row) => (
        <FooterRowRenderer key={row.id} row={row} />
      ))}
    </>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────────

const ROW_BG: Record<FooterRow["background"], string> = {
  default: "bg-background",
  muted: "bg-muted/40",
  accent: "bg-accent/10",
  contrast: "bg-foreground text-background",
  transparent: "",
};
const ROW_PAD: Record<FooterRow["padding"], string> = {
  none: "py-0",
  compact: "py-3 lg:py-4",
  normal: "py-6 lg:py-8",
  spacious: "py-10 lg:py-14",
};
const ROW_CONTAINER: Record<FooterRow["container"], string> = {
  narrow: "max-w-3xl",
  default: "max-w-5xl",
  wide: "max-w-7xl",
  full: "max-w-none",
};
const ROW_BORDER: Record<NonNullable<FooterRow["topBorder"]>, string> = {
  none: "",
  subtle: "border-t border-border",
  bold: "border-t-2 border-border",
  accent: "border-t-2 border-accent",
};
const ALIGN: Record<NonNullable<FooterRow["alignment"]>, string> = {
  left: "text-left items-start",
  center: "text-center items-center",
  right: "text-right items-end",
};

function FooterRowRenderer({ row }: { row: FooterRow }) {
  return (
    <div className={cn(ROW_BG[row.background], row.topBorder && ROW_BORDER[row.topBorder])}>
      <div
        className={cn(
          "mx-auto px-4 md:px-6 lg:px-8",
          ROW_CONTAINER[row.container],
          ROW_PAD[row.padding],
        )}
      >
        {row.heading && (
          <h2 className="mb-4 text-sm font-semibold text-foreground">{row.heading}</h2>
        )}
        <div
          className={cn(
            "grid grid-cols-12 gap-8",
            row.alignment && ALIGN[row.alignment],
          )}
        >
          {row.columns.map((col) => (
            <FooterColumnRenderer
              key={col.id}
              column={col}
              totalColumns={row.columns.length}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Column ──────────────────────────────────────────────────────────────────

function FooterColumnRenderer({
  column,
  totalColumns,
}: {
  column: FooterColumn;
  totalColumns: number;
}) {
  // If width is omitted, distribute equally.
  const width = column.width ?? Math.max(1, Math.floor(12 / totalColumns));
  const colSpanClass = WIDTH_TO_CLASS[Math.min(12, Math.max(1, width))];

  return (
    <div
      className={cn(
        "col-span-12 flex flex-col gap-3",
        colSpanClass,
        column.alignment && ALIGN[column.alignment],
      )}
    >
      <FooterCellRenderer cell={column.cell} />
    </div>
  );
}

const WIDTH_TO_CLASS: Record<number, string> = {
  1: "md:col-span-1",
  2: "md:col-span-2",
  3: "md:col-span-3",
  4: "md:col-span-4",
  5: "md:col-span-5",
  6: "md:col-span-6",
  7: "md:col-span-7",
  8: "md:col-span-8",
  9: "md:col-span-9",
  10: "md:col-span-10",
  11: "md:col-span-11",
  12: "md:col-span-12",
};

// ─── Cell dispatcher ─────────────────────────────────────────────────────────

function FooterCellRenderer({ cell }: { cell: FooterCell }) {
  switch (cell.type) {
    case "text":
      return <TextCellRenderer cell={cell} />;
    case "links":
      return <LinksCellRenderer cell={cell} />;
    case "nav":
      return <NavCellRenderer cell={cell} />;
    case "image":
      return <ImageCellRenderer cell={cell} />;
    case "social":
      return <SocialCellRenderer cell={cell} />;
    case "newsletter":
      return <NewsletterCellRenderer cell={cell} />;
    case "contact":
      return <ContactCellRenderer cell={cell} />;
    case "brand":
      return <BrandCellRenderer cell={cell} />;
    case "html":
      return <HtmlCellRenderer cell={cell} />;
    case "divider":
      return <DividerCellRenderer cell={cell} />;
    case "copyright":
      return <CopyrightCellRenderer cell={cell} />;
    case "payments":
      return <PaymentsCellRenderer cell={cell} />;
  }
}

function CellHeading({ children }: { children?: string }) {
  if (!children) return null;
  return <h3 className="text-sm font-semibold text-foreground">{children}</h3>;
}

// ─── Per-cell renderers ──────────────────────────────────────────────────────

function TextCellRenderer({ cell }: { cell: FooterTextCell }) {
  return (
    <>
      <CellHeading>{cell.heading}</CellHeading>
      <p className="whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
        {cell.body}
      </p>
    </>
  );
}

function LinksCellRenderer({ cell }: { cell: FooterLinksCell }) {
  return (
    <>
      <CellHeading>{cell.heading}</CellHeading>
      <ul className="flex flex-col gap-2">
        {cell.items.map((item, idx) => (
          <li key={idx}>
            <a
              href={item.url}
              target={item.target ?? "_self"}
              rel={item.rel}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}

function NavCellRenderer({ cell }: { cell: FooterNavCell }) {
  const menu = useMenuForLocation(cell.menuLocation);
  if (!menu) return null;
  return (
    <>
      <CellHeading>{cell.heading || menu.name}</CellHeading>
      <ul className="flex flex-col gap-2">
        {menu.items.map((item) => (
          <NavItemLink key={item.id} item={item} />
        ))}
      </ul>
    </>
  );
}

function NavItemLink({ item }: { item: ResolvedMenuItem }) {
  return (
    <li>
      <a
        href={item.url}
        target={item.target}
        rel={item.rel}
        className={cn(
          "text-xs text-muted-foreground transition-colors hover:text-foreground",
          item.cssClasses,
        )}
      >
        {item.label}
      </a>
    </li>
  );
}

function ImageCellRenderer({ cell }: { cell: FooterImageCell }) {
  const mediaId = cell.mediaId ?? "";
  const mediaDoc = useQuery(
    (api as any).media.queries.getPublic,
    !mediaId || mediaId.startsWith("http://") || mediaId.startsWith("https://")
      ? "skip"
      : { mediaId },
  ) as { url?: string; altText?: string; title?: string } | null | undefined;
  if (!mediaId) return null;
  const src = mediaDoc?.url ?? mediaId;
  const img = (
    <img
      src={src}
      alt={cell.alt || mediaDoc?.altText || mediaDoc?.title || ""}
      style={{ width: cell.width ?? 200, height: "auto" }}
      loading="lazy"
    />
  );
  if (cell.href) {
    return (
      <a href={cell.href} target="_blank" rel="noreferrer">
        {img}
      </a>
    );
  }
  return img;
}

function SocialCellRenderer({ cell }: { cell: FooterSocialCell }) {
  return (
    <>
      <CellHeading>{cell.heading}</CellHeading>
      <SocialLinks
        iconSize="sm"
        showLabels={cell.style === "icons-and-labels" || cell.style === "labels"}
        hideIcons={cell.style === "labels"}
      />
    </>
  );
}

function NewsletterCellRenderer({ cell }: { cell: FooterNewsletterCell }) {
  const subscribe = useMutation((api as any).emails.mutations.subscribeNewsletter);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setMessage("");
    try {
      await subscribe({ email, source: "site_footer" });
      setEmail("");
      setStatus("success");
      setMessage("You're subscribed.");
    } catch (err) {
      setStatus("error");
      setMessage(
        (err as { data?: { message?: string } })?.data?.message ??
          "Could not subscribe. Please try again.",
      );
    }
  }

  return (
    <>
      <CellHeading>{cell.heading}</CellHeading>
      {cell.subtext && (
        <p className="text-xs text-muted-foreground">{cell.subtext}</p>
      )}
      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          type="email"
          aria-label="Email address for newsletter"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 border border-border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          required
        />
        <button
          type="submit"
          disabled={status === "submitting"}
          className="bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-colors hover:bg-foreground/90"
        >
          {status === "submitting" ? "Subscribing" : cell.buttonText}
        </button>
      </form>
      {message && (
        <p
          className={cn(
            "text-xs",
            status === "error" ? "text-destructive" : "text-muted-foreground",
          )}
          role={status === "error" ? "alert" : "status"}
        >
          {message}
        </p>
      )}
    </>
  );
}

function ContactCellRenderer({ cell }: { cell: FooterContactCell }) {
  return (
    <>
      <CellHeading>{cell.heading}</CellHeading>
      <div className="space-y-2 text-xs text-muted-foreground">
        {cell.address && (
          <div className="flex items-start gap-2">
            {cell.showIcons && (
              <MapPin className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
            )}
            <span className="whitespace-pre-line">{cell.address}</span>
          </div>
        )}
        {cell.phone && (
          <a
            href={`tel:${cell.phone}`}
            className="flex min-w-0 items-center gap-2 transition-colors hover:text-foreground"
          >
            {cell.showIcons && (
              <Phone className="size-3 shrink-0" aria-hidden="true" />
            )}
            <span className="break-words">{cell.phone}</span>
          </a>
        )}
        {cell.email && (
          <a
            href={`mailto:${cell.email}`}
            className="flex min-w-0 items-center gap-2 transition-colors hover:text-foreground"
          >
            {cell.showIcons && (
              <Mail className="size-3 shrink-0" aria-hidden="true" />
            )}
            <span className="break-all">{cell.email}</span>
          </a>
        )}
      </div>
    </>
  );
}

function BrandCellRenderer({ cell }: { cell: FooterBrandCell }) {
  const identity = useSiteIdentity();
  const title = identity?.title ?? "ConvexPress";
  return (
    <div className="space-y-3">
      {cell.showLogo && identity?.logoUrl ? (
        <Link to="/" className="inline-block">
          <img
            src={identity.logoUrl}
            alt={identity.logoAlt || title}
            className="h-8 w-auto"
          />
        </Link>
      ) : (
        <Link
          to="/"
          className="text-sm font-semibold text-foreground no-underline"
        >
          {title}
        </Link>
      )}
      {cell.showTagline && identity?.tagline && (
        <p className="text-xs text-muted-foreground">{identity.tagline}</p>
      )}
      {cell.showDescription && cell.description && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {cell.description}
        </p>
      )}
    </div>
  );
}

function HtmlCellRenderer({ cell }: { cell: FooterHtmlCell }) {
  if (!cell.rawHtml) return null;
  return <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(cell.rawHtml) }} />;
}

function DividerCellRenderer({ cell }: { cell: FooterDividerCell }) {
  const heightClass = {
    thin: "border-t",
    medium: "border-t-2",
    thick: "border-t-4",
  }[cell.thickness];
  return <hr className={cn(heightClass, "border-border")} />;
}

function CopyrightCellRenderer({ cell }: { cell: FooterCopyrightCell }) {
  const rendered = cell.insertYear
    ? cell.text.replace(/\{year\}/g, String(new Date().getFullYear()))
    : cell.text;
  return <p className="text-xs text-muted-foreground">{rendered}</p>;
}

function PaymentsCellRenderer({ cell }: { cell: FooterPaymentsCell }) {
  if (cell.methods.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {cell.methods.map((method) => (
        <span
          key={method}
          className="rounded border border-border bg-background px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground"
        >
          {method}
        </span>
      ))}
    </div>
  );
}
