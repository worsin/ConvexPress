import { useProductCardPricing } from "@/components/shop/product/useProductCardPricing";
import { formatSiteDate } from "@/lib/blog/date";
import { useSetting } from "@/contexts/SettingsContext";
/**
 * Journal · parts — the small vocabulary every Journal surface is built from.
 *
 * Rules, not boxes; display type for headlines; pills for controls. Token
 * classes only. See ../DESIGN.md.
 */

import { Link } from "@tanstack/react-router";
import { Minus, Plus } from "lucide-react";
import type { ComponentProps, ElementType, ReactNode } from "react";

import { MediaImage } from "@/components/media/MediaImage";
import type { ProductCardData } from "@/components/shop/ProductMiniCard";
import { useCart } from "@/hooks/useCart";
import { formatMoney } from "@/lib/commerce/format";
import { cn } from "@/lib/utils";

/* ───────────────────────── rhythm and measure ───────────────────────── */

export function Container({ className, as: Tag = "div", ...props }: ComponentProps<"div"> & { as?: ElementType }) {
  return <Tag className={cn("mx-auto w-full max-w-6xl px-5 sm:px-8", className)} {...props} />;
}

export function Prose({ className, as: Tag = "div", ...props }: ComponentProps<"div"> & { as?: ElementType }) {
  return <Tag className={cn("mx-auto w-full max-w-[68ch]", className)} {...props} />;
}

export function Rule({ className, ...props }: ComponentProps<"hr">) {
  return <hr className={cn("border-0 border-t border-border", className)} {...props} />;
}

/* ───────────────────────── type ───────────────────────── */

export function Eyebrow({ className, as: Tag = "p", ...props }: ComponentProps<"p"> & { as?: ElementType }) {
  return <Tag className={cn("text-[11px] font-semibold uppercase tracking-[0.22em] text-primary", className)} {...props} />;
}

/** Small caps used for meta lines (author · date · reading time). */
export function SmallCaps({ className, as: Tag = "span", ...props }: ComponentProps<"span"> & { as?: ElementType }) {
  return <Tag className={cn("text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground", className)} {...props} />;
}

export function Headline({
  level = 1,
  className,
  ...props
}: ComponentProps<"h1"> & { level?: 1 | 2 | 3 }) {
  const Tag = `h${level}` as "h1" | "h2" | "h3";
  return (
    <Tag
      className={cn(
        "font-display tracking-tight text-foreground",
        level === 1 && "text-4xl leading-[1.02] md:text-6xl",
        level === 2 && "text-3xl leading-[1.08] md:text-4xl",
        level === 3 && "text-xl leading-snug",
        className,
      )}
      {...props}
    />
  );
}

export function SectionHeading({
  eyebrow,
  title,
  lede,
  align = "left",
  level = 2,
  action,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  align?: "left" | "center";
  level?: 1 | 2 | 3;
  /** Quiet action shown opposite the title (left-aligned headings only). */
  action?: ReactNode;
  className?: string;
}) {
  const centered = align === "center";
  return (
    <div className={cn("flex flex-col gap-3", centered && "items-center text-center", className)}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <div className={cn("flex flex-col gap-3", !centered && action && "sm:flex-row sm:items-end sm:justify-between sm:gap-6")}>
        <Headline level={level} className={cn(centered && "text-balance")}>
          {title}
        </Headline>
        {action && !centered ? <div className="shrink-0 pb-1">{action}</div> : null}
      </div>
      {lede ? <p className={cn("max-w-[60ch] text-base leading-8 text-muted-foreground md:text-[17px]", centered && "text-balance")}>{lede}</p> : null}
    </div>
  );
}

/* ───────────────────────── controls ───────────────────────── */

export type ButtonVariant = "primary" | "ghost" | "link";

export function buttonClasses(variant: ButtonVariant = "primary", className?: string) {
  return cn(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
    variant === "primary" && "h-11 rounded-full bg-primary px-6 text-primary-foreground hover:bg-primary/90",
    variant === "ghost" && "h-11 rounded-full border border-border bg-transparent px-6 text-foreground hover:border-foreground/40 hover:bg-muted/40",
    variant === "link" && "h-auto rounded-none px-0 text-foreground underline decoration-border underline-offset-[6px] hover:decoration-foreground",
    className,
  );
}

export function Button({ variant = "primary", className, type = "button", ...props }: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return <button type={type} className={buttonClasses(variant, className)} {...props} />;
}

/** Router link dressed as a button. `to` is any storefront path; `search`/`params` pass through. */
export function LinkButton({
  variant = "primary",
  className,
  to,
  params,
  search,
  hash,
  ...props
}: Omit<ComponentProps<"a">, "href"> & {
  variant?: ButtonVariant;
  to: string;
  params?: Record<string, string>;
  search?: Record<string, unknown>;
  hash?: string;
}) {
  return <Link to={to as any} params={params as any} search={search as any} hash={hash} className={buttonClasses(variant, className)} {...(props as any)} />;
}

export function Badge({ className, tone = "muted", ...props }: ComponentProps<"span"> & { tone?: "muted" | "primary" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
        tone === "muted" ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary",
        className,
      )}
      {...props}
    />
  );
}

/** Underline-style text input (newsletter, discount code, quiet search). */
export function UnderlineInput({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-none border-0 border-b border-border bg-transparent px-0 text-base text-foreground placeholder:text-muted-foreground focus:border-foreground focus:outline-none focus-visible:outline-none",
        className,
      )}
      {...props}
    />
  );
}

/* ───────────────────────── money ───────────────────────── */

export function Price({
  amount,
  currency = "USD",
  compareAt,
  label,
  size = "md",
  className,
}: {
  amount?: number;
  currency?: string;
  /** Regular price shown struck through when higher than `amount`. */
  compareAt?: number | null;
  /** Pre-formatted price (ranges, "Price unavailable"); wins over `amount`. */
  label?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const text = label ?? (typeof amount === "number" ? formatMoney(amount, currency) : "");
  const showCompare = typeof compareAt === "number" && typeof amount === "number" && compareAt > amount;
  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5", className)}>
      <span className={cn("font-display tabular-nums text-foreground", size === "sm" ? "text-lg" : size === "lg" ? "text-3xl" : "text-2xl")}>{text}</span>
      {showCompare ? <span className="text-sm tabular-nums text-muted-foreground line-through">{formatMoney(compareAt, currency)}</span> : null}
    </span>
  );
}

/* ───────────────────────── lists ───────────────────────── */

export interface LinkTarget {
  to: string;
  params?: Record<string, string>;
  search?: Record<string, unknown>;
}

export function Pagination({
  page,
  totalPages,
  getLink,
  className,
}: {
  page: number;
  totalPages: number;
  getLink: (page: number) => LinkTarget;
  className?: string;
}) {
  if (totalPages <= 1) return null;
  const prev = page > 1 ? getLink(page - 1) : null;
  const next = page < totalPages ? getLink(page + 1) : null;
  const linkClass = "text-sm font-medium text-foreground underline decoration-border underline-offset-[6px] transition-colors hover:decoration-foreground";
  const mutedClass = "text-sm text-muted-foreground/60";
  return (
    <nav aria-label="Pagination" className={cn("flex items-center justify-between border-t border-border pt-6", className)}>
      {prev ? (
        <Link to={prev.to as any} params={prev.params as any} search={prev.search as any} className={linkClass} aria-label="Previous page">
          Previous
        </Link>
      ) : (
        <span className={mutedClass}>Previous</span>
      )}
      <SmallCaps className="tabular-nums">
        Page {page} of {totalPages}
      </SmallCaps>
      {next ? (
        <Link to={next.to as any} params={next.params as any} search={next.search as any} className={linkClass} aria-label="Next page">
          Next
        </Link>
      ) : (
        <span className={mutedClass}>Next</span>
      )}
    </nav>
  );
}

export function EmptyState({
  eyebrow,
  title,
  action,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-5 border-y border-border py-14 text-center md:py-20", className)}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <p className="max-w-[40ch] font-display text-2xl leading-snug text-foreground text-balance md:text-3xl">{title}</p>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

export function Breadcrumbs({
  items,
  className,
}: {
  items: Array<{ label: string; to?: string; params?: Record<string, string>; search?: Record<string, unknown> }>;
  className?: string;
}) {
  return (
    <nav aria-label="Breadcrumb" className={cn("flex flex-wrap items-center gap-x-2 gap-y-1", className)}>
      {items.map((item, index) => {
        const last = index === items.length - 1;
        return (
          <span key={`${item.label}-${index}`} className="flex items-center gap-x-2">
            {item.to && !last ? (
              <Link to={item.to as any} params={item.params as any} search={item.search as any} className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground">
                {item.label}
              </Link>
            ) : (
              <SmallCaps className={cn(last && "text-foreground")} aria-current={last ? "page" : undefined}>
                {item.label}
              </SmallCaps>
            )}
            {!last ? (
              <span className="text-[11px] text-muted-foreground/60" aria-hidden="true">
                /
              </span>
            ) : null}
          </span>
        );
      })}
    </nav>
  );
}

/* ───────────────────────── skeletons ───────────────────────── */

export function SkeletonBlock({ className, ...props }: ComponentProps<"div">) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-xl bg-muted", className)} {...props} />;
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={cn("flex flex-col gap-3", className)}>
      {Array.from({ length: lines }).map((_, index) => (
        <div key={index} className={cn("h-3 animate-pulse rounded-full bg-muted", index === lines - 1 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}

/* ───────────────────────── posts ───────────────────────── */

export interface JournalPostLike {
  _id: string;
  title: string;
  slug: string;
  excerpt?: string | null;
  featuredImageUrl?: string | null;
  featuredImageAlt?: string | null;
  publishedAt?: string | number | null;
  author?: { displayName: string; slug: string } | null;
  primaryCategory?: { name: string; slug: string } | null;
  readingTime?: number | null;
  commentCount?: number;
}

export function formatDate(value: string | number | null | undefined, timeZone = "UTC"): string | null {
  return formatSiteDate(value, timeZone);
}

function isoDate(value: string | number | null | undefined): string | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/** Author · date · reading time, in small caps. Any part may be missing. */
export function PostMetaLine({ post, className }: { post: JournalPostLike; className?: string }) {
  const date = formatDate(post.publishedAt, useSetting("timezone") ?? "UTC");
  const author = post.author?.displayName ? post.author : null;
  const minutes = post.readingTime && post.readingTime > 0 ? post.readingTime : null;
  if (!date && !author && !minutes) return null;
  return (
    <p className={cn("flex flex-wrap items-center gap-x-2 gap-y-1", className)}>
      {author ? (
        author.slug ? (
          <Link to="/author/$slug" params={{ slug: author.slug }} className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground">
            {author.displayName}
          </Link>
        ) : (
          <SmallCaps>{author.displayName}</SmallCaps>
        )
      ) : null}
      {author && date ? <Dot /> : null}
      {date ? (
        <SmallCaps as="time" {...({ dateTime: isoDate(post.publishedAt) } as object)}>
          {date}
        </SmallCaps>
      ) : null}
      {(author || date) && minutes ? <Dot /> : null}
      {minutes ? <SmallCaps className="tabular-nums">{minutes} min read</SmallCaps> : null}
    </p>
  );
}

function Dot() {
  return (
    <span className="text-muted-foreground/60" aria-hidden="true">
      ·
    </span>
  );
}

export function PostCard({ post, variant = "default", className }: { post: JournalPostLike; variant?: "default" | "feature"; className?: string }) {
  const date = formatDate(post.publishedAt, useSetting("timezone") ?? "UTC");
  const image = post.featuredImageUrl ? (
    <Link to="/blog/$slug" params={{ slug: post.slug }} className="group/image block overflow-hidden rounded-2xl bg-muted" tabIndex={-1} aria-hidden="true">
      <img
        src={post.featuredImageUrl}
        alt={post.featuredImageAlt ?? post.title}
        className="aspect-[3/2] w-full object-cover transition-transform duration-500 group-hover/image:scale-[1.02]"
        loading={variant === "feature" ? "eager" : "lazy"}
      />
    </Link>
  ) : null;

  if (variant === "feature") {
    return (
      <article data-slot="journal-post-card" data-variant="feature" className={cn("grid gap-8 lg:grid-cols-12 lg:gap-12", className)}>
        {image ? <div className="lg:col-span-7">{image}</div> : null}
        <div className={cn("flex flex-col justify-center gap-5", image ? "lg:col-span-5" : "lg:col-span-12")}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {post.primaryCategory ? (
              <Link to="/category/$slug" params={{ slug: post.primaryCategory.slug }} className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary hover:underline">
                {post.primaryCategory.name}
              </Link>
            ) : null}
            {date ? <SmallCaps as="time" {...({ dateTime: isoDate(post.publishedAt) } as object)}>{date}</SmallCaps> : null}
          </div>
          <h2 className="font-display text-3xl leading-[1.08] tracking-tight text-foreground text-balance md:text-5xl">
            <Link to="/blog/$slug" params={{ slug: post.slug }} className="transition-colors hover:text-primary">
              {post.title}
            </Link>
          </h2>
          {post.excerpt ? <p className="line-clamp-4 text-base leading-8 text-muted-foreground md:text-[17px]">{post.excerpt}</p> : null}
          <PostMetaLine post={{ ...post, publishedAt: null }} />
          <div>
            <Link to="/blog/$slug" params={{ slug: post.slug }} className={buttonClasses("link")}>
              Read the story
            </Link>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article data-slot="journal-post-card" data-variant="default" className={cn("flex flex-col gap-4 border-b border-border pb-8", className)}>
      {image}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {post.primaryCategory ? (
          <Link to="/category/$slug" params={{ slug: post.primaryCategory.slug }} className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary hover:underline">
            {post.primaryCategory.name}
          </Link>
        ) : null}
        {date ? <SmallCaps as="time" {...({ dateTime: isoDate(post.publishedAt) } as object)}>{date}</SmallCaps> : null}
      </div>
      <h3 className="font-display text-2xl leading-snug tracking-tight text-foreground text-balance md:text-[1.75rem]">
        <Link to="/blog/$slug" params={{ slug: post.slug }} className="transition-colors hover:text-primary">
          {post.title}
        </Link>
      </h3>
      {post.excerpt ? <p className="line-clamp-3 text-base leading-7 text-muted-foreground">{post.excerpt}</p> : null}
      <PostMetaLine post={{ ...post, publishedAt: null }} />
    </article>
  );
}

/* ───────────────────────── products ───────────────────────── */

/** The quiet "Add" pill; becomes a stepper once the product is in the cart. */
export function AddPill({
  product,
  className,
}: {
  product: Pick<ProductCardData, "productId" | "title" | "inStock" | "defaultVariantId">;
  className?: string;
}) {
  const { lineByProduct, add, setQuantity, busyProductId, isReady, enabled } = useCart();
  if (!enabled) return null;
  const line = lineByProduct.get(product.productId);
  const busy = busyProductId === product.productId || !isReady;

  if (!product.inStock) {
    return <Badge className={className}>Sold out</Badge>;
  }

  if (line) {
    return (
      <span className={cn("inline-flex h-9 items-center rounded-full border border-primary bg-primary text-primary-foreground", className)} role="group" aria-label={`${product.title} quantity`}>
        <button
          type="button"
          aria-label={line.quantity === 1 ? `Remove ${product.title} from cart` : `Remove one ${product.title} from cart`}
          disabled={busy}
          onClick={() => void setQuantity(product.productId, line.quantity - 1)}
          className="flex h-full w-8 items-center justify-center rounded-l-full transition-colors hover:bg-primary-foreground/10 disabled:opacity-50"
        >
          <Minus className="size-3.5" aria-hidden="true" />
        </button>
        <span className="min-w-6 text-center text-sm font-semibold tabular-nums">{line.quantity}</span>
        <button
          type="button"
          aria-label={`Add one more ${product.title} to cart`}
          disabled={busy}
          onClick={() => void setQuantity(product.productId, line.quantity + 1)}
          className="flex h-full w-8 items-center justify-center rounded-r-full transition-colors hover:bg-primary-foreground/10 disabled:opacity-50"
        >
          <Plus className="size-3.5" aria-hidden="true" />
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void add(product.productId, { variantId: product.defaultVariantId, label: product.title })}
      className={cn(
        "inline-flex h-9 items-center justify-center rounded-full border border-border bg-transparent px-4 text-sm font-medium text-foreground transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground disabled:opacity-50",
        className,
      )}
    >
      Add
    </button>
  );
}

export function ProductCard({ product: sourceProduct, className }: { product: ProductCardData; className?: string }) {
  const product = useProductCardPricing(sourceProduct);
  const compareAt = product.compareAtPrice && product.compareAtPrice.amount > product.price.amount ? product.compareAtPrice.amount : null;
  return (
    <article data-slot="journal-product-card" className={cn("group flex flex-col gap-4", className)}>
      <Link to="/products/$slug" params={{ slug: product.slug }} className="relative block overflow-hidden rounded-2xl bg-muted" aria-label={product.title}>
        <div className="aspect-[4/5] w-full">
          {product.featuredMediaId ? (
            <MediaImage
              mediaId={product.featuredMediaId as any}
              alt={product.title}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
              preferredSize="large"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            />
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center font-display text-lg text-muted-foreground">{product.title}</div>
          )}
        </div>
        {compareAt !== null ? <Badge tone="primary" className="absolute left-3 top-3">Sale</Badge> : null}
      </Link>
      <div className="flex flex-col gap-1.5">
        {product.categories[0] ? <SmallCaps>{product.categories[0].name}</SmallCaps> : null}
        <h3 className="font-display text-xl leading-snug tracking-tight text-foreground">
          <Link to="/products/$slug" params={{ slug: product.slug }} className="transition-colors hover:text-primary">
            {product.title}
          </Link>
        </h3>
        {product.summary || product.excerpt ? <p className="line-clamp-1 text-sm leading-6 text-muted-foreground">{product.summary || product.excerpt}</p> : null}
        <div className="mt-1 flex items-center justify-between gap-3">
          <Price amount={product.price.amount} currency={product.price.currencyCode} compareAt={compareAt} size="sm" />
          <AddPill product={product} />
        </div>
      </div>
    </article>
  );
}
