/**
 * Journal · extra parts — the receipt and form vocabulary shared by the
 * checkout steps, order pages and gates. Same rules as ../parts: rules not
 * boxes, display type for totals, pills for controls, token classes only.
 */

import { Link } from "@tanstack/react-router";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

import { Pagination, PostCard, Rule, SkeletonBlock, SkeletonText, SmallCaps, UnderlineInput, type JournalPostLike, type LinkTarget } from "./index";

/* ───────────────────────── checkout progress ───────────────────────── */

export const CHECKOUT_STEPS = [
  { key: "contact", label: "Contact", to: "/checkout" },
  { key: "shipping", label: "Shipping", to: "/checkout/shipping" },
  { key: "payment", label: "Payment", to: "/checkout/payment" },
  { key: "review", label: "Review", to: "/checkout/review" },
] as const;

export type CheckoutStepKey = (typeof CHECKOUT_STEPS)[number]["key"];

/** The small-caps progress line: Contact / Shipping / Payment / Review. */
export function CheckoutSteps({ current, className }: { current: CheckoutStepKey; className?: string }) {
  const activeIndex = CHECKOUT_STEPS.findIndex((step) => step.key === current);
  return (
    <nav aria-label="Checkout progress" className={cn("border-y border-border py-3", className)}>
      <ol className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {CHECKOUT_STEPS.map((step, index) => {
          const isActive = step.key === current;
          const isComplete = index < activeIndex;
          return (
            <li key={step.key} className="flex items-center gap-x-3">
              {index > 0 ? (
                <span className="text-[11px] text-muted-foreground/60" aria-hidden="true">
                  /
                </span>
              ) : null}
              <Link
                to={step.to}
                aria-current={isActive ? "step" : undefined}
                className={cn(
                  "inline-flex items-baseline gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] transition-colors",
                  isActive ? "text-foreground underline decoration-foreground underline-offset-[6px]" : isComplete ? "text-foreground hover:text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="tabular-nums">{index + 1}</span>
                {step.label}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/* ───────────────────────── notices ───────────────────────── */

/** A quiet notice: a left rule, a short heading, one or two sentences. */
export function Notice({
  tone = "muted",
  title,
  children,
  action,
  className,
}: {
  tone?: "muted" | "primary" | "destructive";
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "destructive" ? "alert" : undefined}
      className={cn(
        "flex flex-col gap-1.5 border-l-2 pl-4 text-sm leading-6",
        tone === "muted" && "border-border text-muted-foreground",
        tone === "primary" && "border-primary text-foreground",
        tone === "destructive" && "border-destructive text-destructive",
        className,
      )}
    >
      {title ? <p className={cn("font-medium", tone === "muted" && "text-foreground")}>{title}</p> : null}
      {children ? <div className={cn(tone === "primary" && "text-muted-foreground", tone === "destructive" && "text-destructive/80")}>{children}</div> : null}
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}

/** Same rule as Core's CheckoutStatusNotice: only failed / abandoned sessions show it. */
export function CheckoutStatusNotice({ status, failureReason, className }: { status?: string; failureReason?: string; className?: string }) {
  if (!status || !["failed", "abandoned"].includes(status)) return null;
  return (
    <Notice
      tone="destructive"
      title={status === "failed" ? "Checkout needs attention" : "Checkout expired"}
      action={
        <Link to="/cart" className="text-xs font-medium underline decoration-current/40 underline-offset-4 hover:decoration-current">
          Return to cart
        </Link>
      }
      className={className}
    >
      {failureReason || "Return to your cart and restart checkout to refresh the order state."}
    </Notice>
  );
}

/* ───────────────────────── form fields ───────────────────────── */

/** Small-caps label above an underline input. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

export function TextField({ label, hint, error, className, id, ...props }: ComponentProps<"input"> & { label: ReactNode; hint?: ReactNode; error?: ReactNode }) {
  return (
    <Field label={label} htmlFor={id} hint={hint} error={error} className={className}>
      <UnderlineInput id={id} {...props} />
    </Field>
  );
}

/** Underline-style select, matching the catalog's sort control. */
export function UnderlineSelect({ className, ...props }: ComponentProps<"select">) {
  return (
    <span className="relative block">
      <select
        className={cn(
          "h-11 w-full appearance-none rounded-none border-0 border-b border-border bg-transparent pr-6 text-base text-foreground focus:border-foreground focus:outline-none disabled:opacity-50",
          className,
        )}
        {...props}
      />
      <span className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true">
        <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 6l4 4 4-4" />
        </svg>
      </span>
    </span>
  );
}

/* ───────────────────────── choice rows ───────────────────────── */

/** A rule-separated radio row: label + meta left, price right. */
export function ChoiceRow({
  name,
  value,
  checked,
  disabled,
  onChange,
  title,
  meta,
  badges,
  trailing,
  className,
}: {
  name: string;
  value: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
  title: ReactNode;
  meta?: ReactNode;
  badges?: ReactNode;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "flex items-start gap-4 py-4 transition-colors",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        className,
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 size-4 shrink-0 accent-primary"
      />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className={cn("text-base text-foreground", checked && "font-medium")}>{title}</span>
          {badges}
        </span>
        {meta ? <span className="text-sm text-muted-foreground">{meta}</span> : null}
      </span>
      {trailing ? <span className="shrink-0 text-right">{trailing}</span> : null}
    </label>
  );
}

/* ───────────────────────── receipt ───────────────────────── */

export function ReceiptList({ className, ...props }: ComponentProps<"dl">) {
  return <dl className={cn("flex flex-col divide-y divide-border border-y border-border text-sm", className)} {...props} />;
}

export function ReceiptRow({ label, value, className }: { label: ReactNode; value: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-6 py-3", className)}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

/** The total line: small-caps label, amount in display type. */
export function ReceiptTotal({ label = "Total", value, className }: { label?: ReactNode; value: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-6 py-4", className)}>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground">{label}</dt>
      <dd className="font-display text-2xl tabular-nums text-foreground md:text-3xl">{value}</dd>
    </div>
  );
}

/* ───────────────────────── archives ───────────────────────── */

/**
 * Feature + rule-separated list, as on blog.index: page one leads with the
 * first post as a full-width feature, then a rule, then the two-column list.
 * `posts` undefined = loading skeleton; empty = the given empty state.
 */
export function ArchivePosts({
  posts,
  pagination,
  getLink,
  empty,
}: {
  posts: JournalPostLike[] | undefined;
  pagination: { currentPage: number; totalPages: number } | undefined;
  getLink: (page: number) => LinkTarget;
  empty: ReactNode;
}) {
  if (posts === undefined) {
    return (
      <div className="grid gap-x-10 gap-y-10 md:grid-cols-2" aria-hidden="true">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="flex flex-col gap-4 border-b border-border pb-8">
            <SkeletonBlock className="aspect-[3/2] rounded-2xl" />
            <SkeletonBlock className="h-3 w-24 rounded-full" />
            <SkeletonBlock className="h-7 w-3/4" />
            <SkeletonText lines={2} />
          </div>
        ))}
      </div>
    );
  }
  if (posts.length === 0) return <>{empty}</>;

  const page = pagination?.currentPage ?? 1;
  const featureFirst = page === 1;
  const feature = featureFirst ? posts[0] : null;
  const list = featureFirst ? posts.slice(1) : posts;

  return (
    <div className="flex flex-col gap-14">
      {feature ? <PostCard post={feature} variant="feature" /> : null}
      {feature && list.length > 0 ? <Rule /> : null}
      {list.length > 0 ? (
        <div className="grid gap-x-10 gap-y-2 md:grid-cols-2">
          {list.map((post) => (
            <PostCard key={post._id} post={post} />
          ))}
        </div>
      ) : null}
      {pagination ? <Pagination page={pagination.currentPage} totalPages={pagination.totalPages} getLink={getLink} /> : null}
    </div>
  );
}

/* ───────────────────────── misc ───────────────────────── */

export function Spinner({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("inline-block size-5 animate-spin rounded-full border-2 border-border border-t-foreground", className)} />;
}

export function AsideHeading({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <SmallCaps as="h2" className={className}>
      {children}
    </SmallCaps>
  );
}

export function formatDateTime(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}
