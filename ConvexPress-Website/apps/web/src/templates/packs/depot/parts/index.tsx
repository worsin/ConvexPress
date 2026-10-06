import { useProductCardPricing } from "@/components/shop/product/useProductCardPricing";
import { formatSiteDate } from "@/lib/blog/date";
import { useSetting } from "@/contexts/SettingsContext";
/**
 * Depot · parts — the small vocabulary every Depot surface is built from.
 *
 * Dense, boxed, sans. Token classes only; `rounded-md` everywhere; controls
 * `h-10`. See DESIGN.md for the rhythm these encode.
 */

import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, ShoppingBag } from "lucide-react";
import type { ButtonHTMLAttributes, ElementType, ReactNode, SelectHTMLAttributes } from "react";

import { MediaImage } from "@/components/media/MediaImage";
import { CartStepper, type ProductCardData } from "@/components/shop/ProductMiniCard";
import { formatMoney, percentOff } from "@/lib/commerce/format";
import { cn } from "@/lib/utils";

/* ───────────────────────── measure ───────────────────────── */

/**
 * Edge-to-edge page container. `padded` adds the gutter; turn it off when the
 * surface already sits inside a padded shell (ContentWrapper, ShopShell).
 */
export function Container({
  as: Tag = "div",
  padded = true,
  className,
  children,
  ...rest
}: {
  as?: ElementType;
  padded?: boolean;
  className?: string;
  children: ReactNode;
} & Record<string, unknown>) {
  return (
    <Tag className={cn("mx-auto w-full max-w-[1760px]", padded && "px-4 md:px-6 xl:px-8", className)} {...rest}>
      {children}
    </Tag>
  );
}

/** Reading measure for long-form text. */
export function Prose({ as: Tag = "div", className, children, ...rest }: { as?: ElementType; className?: string; children: ReactNode } & Record<string, unknown>) {
  return (
    <Tag className={cn("mx-auto w-full max-w-3xl", className)} {...rest}>
      {children}
    </Tag>
  );
}

/** Small uppercase label. */
export function Label({ as: Tag = "span", className, children, ...rest }: { as?: ElementType; className?: string; children: ReactNode } & Record<string, unknown>) {
  return (
    <Tag className={cn("text-[11px] font-semibold uppercase tracking-wide text-muted-foreground", className)} {...rest}>
      {children}
    </Tag>
  );
}

/** Title left, optional "See all" link right, one row. */
export function SectionHeading({
  title,
  count,
  action,
  as: Tag = "h2",
  className,
}: {
  title: ReactNode;
  count?: ReactNode;
  action?: { label: string; to: string; search?: Record<string, unknown> };
  as?: ElementType;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4", className)}>
      <Tag className="flex items-baseline gap-2 text-lg font-semibold text-foreground">
        {title}
        {count !== undefined && count !== null ? <span className="text-[13px] font-normal tabular-nums text-muted-foreground">{count}</span> : null}
      </Tag>
      {action && (
        <Link to={action.to} search={action.search as any} className="text-[13px] font-medium text-primary hover:underline">
          {action.label}
        </Link>
      )}
    </div>
  );
}

/** A box: bordered card surface. Panels stack with `gap-3`. */
export function Card({ as: Tag = "div", className, children, ...rest }: { as?: ElementType; className?: string; children: ReactNode } & Record<string, unknown>) {
  return (
    <Tag className={cn("rounded-md border border-border bg-card text-card-foreground", className)} {...rest}>
      {children}
    </Tag>
  );
}

/* ───────────────────────── controls ───────────────────────── */

export type ButtonVariant = "primary" | "secondary" | "quiet";
export type ButtonSize = "md" | "sm";

/** Class string for a Depot button; use directly on `<Link>` / `<a>`. */
export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return cn(
    "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
    size === "md" ? "h-10 px-4 text-sm" : "h-8 px-3 text-[13px]",
    variant === "primary" && "bg-primary text-primary-foreground hover:bg-primary/90",
    variant === "secondary" && "border border-border bg-background text-foreground hover:bg-muted",
    variant === "quiet" && "text-foreground hover:bg-muted",
    className,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button type={type} className={buttonClasses(variant, size, className)} {...props} />;
}

export function LinkButton({
  to,
  params,
  search,
  hash,
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: {
  to: string;
  params?: Record<string, string>;
  search?: Record<string, unknown>;
  hash?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
} & Record<string, unknown>) {
  return (
    <Link to={to} params={params as any} search={search as any} hash={hash} className={buttonClasses(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}

/** Filter chip (toolbar). */
export function Chip({ active, className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-md border px-2.5 text-[13px] transition-colors",
        active ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border bg-background text-foreground hover:bg-muted",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/** Native select in Depot dress. */
export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-10 rounded-md border border-border bg-background px-2 text-[13px] text-foreground focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20",
        className,
      )}
      {...props}
    />
  );
}

/** Row of chips with a select on the right. */
export function Toolbar({ children, end, className, label }: { children: ReactNode; end?: ReactNode; className?: string; label?: string }) {
  return (
    <div aria-label={label} className={cn("flex flex-col gap-2 rounded-md border border-border bg-card px-3 py-2 md:flex-row md:items-center md:justify-between", className)}>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">{children}</div>
      {end ? <div className="flex shrink-0 items-center gap-2">{end}</div> : null}
    </div>
  );
}

/* ───────────────────────── display ───────────────────────── */

export type BadgeTone = "sale" | "stock" | "new" | "danger";

export function Badge({ tone = "stock", className, children }: { tone?: BadgeTone; className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center whitespace-nowrap rounded-md px-1.5 text-[11px] font-semibold uppercase tracking-wide",
        tone === "sale" && "bg-primary text-primary-foreground",
        tone === "stock" && "bg-muted text-muted-foreground",
        tone === "new" && "bg-muted text-foreground",
        tone === "danger" && "bg-destructive/10 text-destructive",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Tabular price with optional compare-at. Amounts in minor units. */
export function Price({
  amount,
  compareAt,
  currency = "USD",
  size = "md",
  label,
  className,
}: {
  amount?: number | null;
  compareAt?: number | null;
  currency?: string;
  size?: "sm" | "md" | "lg";
  /** Pre-formatted label (ranges); wins over `amount`. */
  label?: string;
  className?: string;
}) {
  const text = label ?? (typeof amount === "number" ? formatMoney(amount, currency) : "Price unavailable");
  const struck = typeof compareAt === "number" && typeof amount === "number" && compareAt > amount ? compareAt : null;
  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-2", className)}>
      <span className={cn("font-semibold tabular-nums text-foreground", size === "lg" ? "text-3xl" : size === "md" ? "text-lg" : "text-sm")}>{text}</span>
      {struck !== null && <span className={cn("tabular-nums text-muted-foreground line-through", size === "lg" ? "text-base" : "text-xs")}>{formatMoney(struck, currency)}</span>}
    </span>
  );
}

export interface PaginationLink {
  to: string;
  search?: Record<string, unknown>;
}

/** Numbered, compact pagination. */
export function Pagination({
  page,
  totalPages,
  linkFor,
  className,
}: {
  page: number;
  totalPages: number;
  linkFor: (page: number) => PaginationLink;
  className?: string;
}) {
  if (totalPages <= 1) return null;
  const pages = pageNumbers(page, totalPages);
  const cell = "flex h-8 min-w-8 items-center justify-center rounded-md border px-1.5 text-[13px] tabular-nums transition-colors";
  const idle = "border-border text-muted-foreground hover:bg-muted hover:text-foreground";
  const disabled = "border-border text-muted-foreground opacity-50";
  const prev = linkFor(page - 1);
  const next = linkFor(page + 1);
  return (
    <nav aria-label="Pagination" className={cn("flex flex-wrap items-center justify-between gap-2", className)}>
      <span className="text-[13px] tabular-nums text-muted-foreground">
        Page {page} of {totalPages}
      </span>
      <div className="flex items-center gap-1">
        {page > 1 ? (
          <Link to={prev.to} search={prev.search as any} className={cn(cell, idle)} aria-label="Previous page">
            <ChevronLeft className="size-3.5" aria-hidden="true" />
          </Link>
        ) : (
          <span className={cn(cell, disabled)} aria-hidden="true">
            <ChevronLeft className="size-3.5" />
          </span>
        )}
        {pages.map((entry, index) =>
          entry === "gap" ? (
            <span key={`gap-${index}`} className="px-1 text-[13px] text-muted-foreground" aria-hidden="true">
              …
            </span>
          ) : (
            <Link
              key={entry}
              to={linkFor(entry).to}
              search={linkFor(entry).search as any}
              className={cn(cell, entry === page ? "border-primary bg-primary font-semibold text-primary-foreground" : idle)}
              aria-label={`Page ${entry}`}
              aria-current={entry === page ? "page" : undefined}
            >
              {entry}
            </Link>
          ),
        )}
        {page < totalPages ? (
          <Link to={next.to} search={next.search as any} className={cn(cell, idle)} aria-label="Next page">
            <ChevronRight className="size-3.5" aria-hidden="true" />
          </Link>
        ) : (
          <span className={cn(cell, disabled)} aria-hidden="true">
            <ChevronRight className="size-3.5" />
          </span>
        )}
      </div>
    </nav>
  );
}

function pageNumbers(current: number, total: number): Array<number | "gap"> {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  const pages: Array<number | "gap"> = [1];
  if (start > 2) pages.push("gap");
  for (let index = start; index <= end; index += 1) pages.push(index);
  if (end < total - 1) pages.push("gap");
  pages.push(total);
  return pages;
}

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-2 rounded-md border border-dashed border-border bg-card px-6 py-10 text-center", className)}>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description ? <p className="max-w-md text-[13px] text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-2 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} aria-hidden="true" />;
}

/** Sticky card for buy boxes and summaries. */
export function StickyPanel({ className, children, label }: { className?: string; children: ReactNode; label?: string }) {
  return (
    <Card as="aside" aria-label={label} className={cn("flex flex-col gap-3 p-4 lg:sticky lg:top-24", className)}>
      {children}
    </Card>
  );
}

/* ───────────────────────── navigation ───────────────────────── */

export interface Crumb {
  label: string;
  to?: string;
  params?: Record<string, string>;
  search?: Record<string, unknown>;
}

/** Breadcrumb trail with small chevrons; the last crumb is the current page. */
export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="Breadcrumb" className={cn("text-[13px] text-muted-foreground", className)}>
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1">
              {index > 0 && <ChevronRight className="size-3 text-muted-foreground/70" aria-hidden="true" />}
              {last || !item.to ? (
                <span className={cn(last && "text-foreground")} aria-current={last ? "page" : undefined}>
                  {item.label}
                </span>
              ) : (
                <Link to={item.to} params={item.params as any} search={item.search as any} className="transition-colors hover:text-foreground">
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/* ───────────────────────── tables ───────────────────────── */

/**
 * Dense table. Pass `head` + `rows` for the common case, or `children` for a
 * hand-written `<thead>` / `<tbody>` using `Th` / `Td`.
 */
export function DataTable({
  head,
  rows,
  caption,
  children,
  className,
  firstColumnLabel = false,
}: {
  head?: ReactNode[];
  rows?: Array<{ key?: string; cells: ReactNode[] }>;
  caption?: string;
  children?: ReactNode;
  className?: string;
  /** Style the first cell of each row as a label (specs, summaries). */
  firstColumnLabel?: boolean;
}) {
  return (
    <div className={cn("relative overflow-x-auto rounded-md border border-border bg-card", className)}>
      <table className="w-full border-collapse text-[13px] text-foreground">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        {head ? (
          <thead>
            <tr>
              {head.map((cell, index) => (
                <Th key={index}>{cell}</Th>
              ))}
            </tr>
          </thead>
        ) : null}
        {rows ? (
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={row.key ?? rowIndex} className="border-t border-border first:border-t-0">
                {row.cells.map((cell, cellIndex) =>
                  firstColumnLabel && cellIndex === 0 ? (
                    <Th key={cellIndex} scope="row" className="w-1/3 font-normal text-muted-foreground">
                      {cell}
                    </Th>
                  ) : (
                    <Td key={cellIndex}>{cell}</Td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        ) : null}
        {children}
      </table>
    </div>
  );
}

export function Th({ className, scope = "col", children }: { className?: string; scope?: "col" | "row"; children: ReactNode }) {
  return (
    <th
      scope={scope}
      className={cn(
        "px-3 py-2 text-left align-middle text-[11px] font-semibold uppercase tracking-wide text-muted-foreground",
        scope === "col" && "border-b border-border bg-muted/40",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ className, align = "left", children, ...rest }: { className?: string; align?: "left" | "right"; children?: ReactNode } & Record<string, unknown>) {
  return (
    <td className={cn("px-3 py-2 align-middle", align === "right" && "text-right tabular-nums", className)} {...rest}>
      {children}
    </td>
  );
}

/* ───────────────────────── cards ───────────────────────── */

export interface PostCardInput {
  title: string;
  slug: string;
  excerpt?: string | null;
  imageUrl?: string | null;
  imageAlt?: string | null;
  date?: string | number | null;
  category?: { name: string; slug: string } | null;
  readingTime?: number | null;
  commentCount?: number;
}

export function formatDate(value: string | number | null | undefined, timeZone = "UTC"): string | null {
  return formatSiteDate(value, timeZone);
}

/**
 * Post row: 16:9 thumbnail left, title + date right. `tile` stacks the
 * thumbnail above the text for card rows.
 */
export function PostCard({ post, layout = "row", className }: { post: PostCardInput; layout?: "row" | "tile"; className?: string }) {
  const date = formatDate(post.date, useSetting("timezone") ?? "UTC");
  const thumb = (
    <Link to="/blog/$slug" params={{ slug: post.slug }} className={cn("block shrink-0 overflow-hidden rounded-md bg-muted", layout === "row" ? "w-32 sm:w-40" : "w-full")} aria-hidden={!post.imageUrl}>
      <div className="aspect-video w-full">
        {post.imageUrl ? <img src={post.imageUrl} alt={post.imageAlt ?? post.title} className="h-full w-full object-cover" loading="lazy" /> : null}
      </div>
    </Link>
  );
  const meta = (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
      {post.category && (
        <Link to="/category/$slug" params={{ slug: post.category.slug }} className="text-[11px] font-semibold uppercase tracking-wide text-primary hover:underline">
          {post.category.name}
        </Link>
      )}
      {date && <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{date}</span>}
      {post.readingTime ? <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{post.readingTime} min</span> : null}
      {post.commentCount ? <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{post.commentCount} comments</span> : null}
    </p>
  );
  return (
    <Card as="article" className={cn("flex gap-3 p-3", layout === "tile" && "flex-col", className)}>
      {thumb}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {meta}
        <h3 className="text-sm font-semibold leading-snug text-foreground">
          <Link to="/blog/$slug" params={{ slug: post.slug }} className="line-clamp-2 hover:text-primary">
            {post.title}
          </Link>
        </h3>
        {post.excerpt ? <p className="line-clamp-2 text-[13px] leading-5 text-muted-foreground">{post.excerpt}</p> : null}
      </div>
    </Card>
  );
}

/**
 * Product card: square image, category label, two-line name, one-line
 * excerpt, price + full-width add to cart. Same cart stepper as Core.
 */
export function ProductCard({ product: sourceProduct, className }: { product: ProductCardData; className?: string }) {
  const product = useProductCardPricing(sourceProduct);
  const off = percentOff(product.price.amount, product.compareAtPrice?.amount);
  const low = product.inStock && product.stockQuantity !== null && product.stockQuantity <= 5;
  return (
    <Card as="article" data-slot="depot-product-card" className={cn("flex flex-col overflow-hidden", className)}>
      <Link to="/products/$slug" params={{ slug: product.slug }} className="relative block aspect-square bg-muted/40">
        {product.featuredMediaId ? (
          <MediaImage
            mediaId={product.featuredMediaId as any}
            alt={product.title}
            className="h-full w-full object-cover"
            preferredSize="large"
            sizes="(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 20vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <ShoppingBag className="size-8" aria-hidden="true" />
          </div>
        )}
        {off !== null && (
          <Badge tone="sale" className="absolute left-2 top-2">
            {off}% off
          </Badge>
        )}
        {!product.inStock && (
          <Badge tone="stock" className="absolute right-2 top-2">
            Sold out
          </Badge>
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        {product.categories.length > 0 ? <Label>{product.categories[0]!.name}</Label> : <Label>&nbsp;</Label>}
        <Link to="/products/$slug" params={{ slug: product.slug }} className="line-clamp-2 text-sm font-semibold leading-5 text-foreground hover:text-primary">
          {product.title}
        </Link>
        {product.summary || product.excerpt ? <p className="line-clamp-1 text-[13px] text-muted-foreground">{product.summary || product.excerpt}</p> : null}
        <div className="mt-auto flex flex-col gap-2 pt-1">
          <div className="flex items-baseline justify-between gap-2">
            <Price amount={product.price.amount} compareAt={product.compareAtPrice?.amount} currency={product.price.currencyCode} />
            {low ? <span className="text-[11px] font-semibold text-primary">Only {product.stockQuantity} left</span> : null}
          </div>
          <CartStepper product={product} size="md" className="w-full justify-center" />
        </div>
      </div>
    </Card>
  );
}
