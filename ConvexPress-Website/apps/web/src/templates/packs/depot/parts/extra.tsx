/**
 * Depot · extra parts — pieces shared by the checkout, system and form-heavy
 * surfaces that the base vocabulary in `./index.tsx` does not cover: the
 * numbered checkout step strip, the failed / expired checkout notice, a
 * bordered notice box, and the Depot dress for text inputs.
 */

import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import type { InputHTMLAttributes, ReactNode } from "react";

import type { PostCard as BlogPostCard } from "@/lib/blog/types";
import { cn } from "@/lib/utils";

import { PostCard, Skeleton, buttonClasses, type PostCardInput } from "./index";

/* ───────────────────────── forms ───────────────────────── */

/** Class string for a Depot text input / select (`h-10`, `rounded-md`). */
export const inputClasses =
  "h-10 w-full rounded-md border border-border bg-background px-3 text-[13px] text-foreground placeholder:text-muted-foreground focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50";

/** Labelled input in Depot dress. Pass `children` instead of input props for a custom control. */
export function Field({
  label,
  hint,
  error,
  className,
  children,
  ...input
}: { label: ReactNode; hint?: ReactNode; error?: ReactNode; className?: string; children?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={cn("flex flex-col gap-1", className)}>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      {children ?? <input className={cn(inputClasses, error && "border-destructive")} {...input} />}
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </label>
  );
}

/* ───────────────────────── notices ───────────────────────── */

export type NoticeTone = "info" | "primary" | "danger";

/** Bordered notice box: a short title and body, optionally an action. */
export function Notice({ tone = "info", title, children, action, className }: { tone?: NoticeTone; title?: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div
      role={tone === "danger" ? "alert" : undefined}
      className={cn(
        "flex flex-col gap-1 rounded-md border px-3 py-2 text-[13px]",
        tone === "info" && "border-border bg-muted/40 text-muted-foreground",
        tone === "primary" && "border-primary/30 bg-primary/10 text-primary",
        tone === "danger" && "border-destructive/30 bg-destructive/10 text-destructive",
        className,
      )}
    >
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={cn(tone === "info" ? "text-muted-foreground" : "opacity-90")}>{children}</div> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

/** Failed / abandoned checkout session notice (same gate as Core's `CheckoutStatusNotice`). */
export function CheckoutNotice({ status, failureReason }: { status?: string; failureReason?: string }) {
  if (!status || !["failed", "abandoned"].includes(status)) return null;
  return (
    <Notice
      tone="danger"
      title={status === "failed" ? "Checkout needs attention" : "Checkout expired"}
      action={
        <Link to="/cart" className={buttonClasses("secondary", "sm", "border-current text-current hover:bg-destructive/10")}>
          Return to cart
        </Link>
      }
    >
      {failureReason || "Return to your cart and restart checkout to refresh the order state."}
    </Notice>
  );
}

/* ───────────────────────── checkout steps ───────────────────────── */

export const CHECKOUT_STEPS = [
  { key: "contact", label: "Contact", to: "/checkout" },
  { key: "shipping", label: "Shipping", to: "/checkout/shipping" },
  { key: "payment", label: "Payment", to: "/checkout/payment" },
  { key: "review", label: "Review", to: "/checkout/review" },
] as const;

export type CheckoutStepKey = (typeof CHECKOUT_STEPS)[number]["key"];

/** Numbered step strip across the top of every checkout step. Every step stays a link, as in Core. */
export function CheckoutSteps({ current, className }: { current: CheckoutStepKey; className?: string }) {
  const activeIndex = CHECKOUT_STEPS.findIndex((step) => step.key === current);
  return (
    <nav aria-label="Checkout progress" className={cn("rounded-md border border-border bg-card", className)}>
      <ol className="grid grid-cols-2 sm:grid-cols-4">
        {CHECKOUT_STEPS.map((step, index) => {
          const active = step.key === current;
          const complete = index < activeIndex;
          return (
            <li key={step.key} className="min-w-0 border-b border-border sm:border-b-0 sm:border-r sm:last:border-r-0 [&:nth-child(n+3)]:border-b-0">
              <Link
                to={step.to}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex h-10 items-center gap-2 px-3 text-[13px] transition-colors hover:bg-muted",
                  active ? "font-semibold text-primary" : complete ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-md border text-[11px] font-semibold tabular-nums",
                    active ? "border-primary bg-primary text-primary-foreground" : complete ? "border-border bg-muted text-foreground" : "border-border text-muted-foreground",
                  )}
                >
                  {complete ? <Check className="size-3" aria-hidden="true" /> : index + 1}
                </span>
                <span className="truncate">{step.label}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/* ───────────────────────── blog ───────────────────────── */

/** Maps a blog `PostCard` view model onto the Depot `PostCard` part's input. */
export function toPostCard(post: BlogPostCard): PostCardInput {
  return {
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    imageUrl: post.featuredImageUrl,
    imageAlt: post.featuredImageAlt,
    date: post.publishedAt,
    category: post.primaryCategory,
    readingTime: post.readingTime,
    commentCount: post.commentCount,
  };
}

/** Two-column list of post rows, with the loading and empty states. */
export function PostRows({ posts, skeletons = 6, empty }: { posts: BlogPostCard[] | undefined; skeletons?: number; empty: ReactNode }) {
  if (posts === undefined) {
    return (
      <div className="grid gap-3 md:grid-cols-2">
        {Array.from({ length: skeletons }).map((_, index) => (
          <Skeleton key={index} className="h-28" />
        ))}
      </div>
    );
  }
  if (posts.length === 0) return <>{empty}</>;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {posts.map((post) => (
        <PostCard key={post._id} post={toPostCard(post)} />
      ))}
    </div>
  );
}

/* ───────────────────────── page frames ───────────────────────── */

/** Page title row: small label above, h1, optional meta on the right. */
export function PageHeader({ label, title, meta, description, className }: { label?: ReactNode; title: ReactNode; meta?: ReactNode; description?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4", className)}>
      <div className="flex min-w-0 flex-col gap-1">
        {label ? <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span> : null}
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl">{title}</h1>
        {description ? <p className="max-w-3xl text-[13px] leading-5 text-muted-foreground">{description}</p> : null}
      </div>
      {meta ? <div className="text-[13px] tabular-nums text-muted-foreground">{meta}</div> : null}
    </div>
  );
}

/** System screens: a card centred on a muted band. */
export function SystemFrame({ children, slot, className }: { children: ReactNode; slot?: string; className?: string }) {
  return (
    <div data-slot={slot} className={cn("flex min-h-[50vh] w-full items-center justify-center rounded-md bg-muted/40 px-4 py-10", className)}>
      <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-md border border-border bg-card p-6 text-center text-card-foreground">{children}</div>
    </div>
  );
}
