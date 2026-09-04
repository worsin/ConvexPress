/**
 * Depot · plugin parts — controls and frames shared by the content-plugin
 * surfaces (courses, certificates, help, support, gallery, recipes, forms,
 * auth). Same vocabulary as `parts/index.tsx`: dense, boxed, sans,
 * `rounded-md`, controls `h-10`.
 */

import { Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

import { Card, Label } from "./index";

/* ───────────────────────── controls ───────────────────────── */

export const inputClasses =
  "h-10 w-full min-w-0 rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive";

/** Native text input in Depot dress. */
export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputClasses, className)} {...props} />;
}

/** Native textarea in Depot dress. */
export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(inputClasses, "h-auto min-h-24 py-2", className)} {...props} />;
}

/** Form field: label above control, optional hint / error below. */
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
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-foreground">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-destructive" aria-live="polite">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/** Filter chip that navigates (catalog facets). */
export function ChipLink({
  to,
  params,
  search,
  active,
  className,
  children,
  ...rest
}: {
  to: string;
  params?: Record<string, string>;
  search?: Record<string, unknown>;
  active?: boolean;
  className?: string;
  children: ReactNode;
} & Record<string, unknown>) {
  return (
    <Link
      to={to}
      params={params as any}
      search={search as any}
      aria-current={active ? "true" : undefined}
      className={cn(
        "inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-md border px-2.5 text-[13px] transition-colors",
        active ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border bg-background text-foreground hover:bg-muted",
        className,
      )}
      {...rest}
    >
      {children}
    </Link>
  );
}

/* ───────────────────────── frames ───────────────────────── */

/** Eyebrow label, h1, optional description, optional aside on the right; underlined row. */
export function PluginPageHeader({
  eyebrow,
  title,
  description,
  aside,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4", className)}>
      <div className="flex min-w-0 flex-col gap-1">
        {eyebrow ? <Label>{eyebrow}</Label> : null}
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl">{title}</h1>
        {description ? <p className="max-w-3xl text-[13px] leading-5 text-muted-foreground">{description}</p> : null}
      </div>
      {aside ? <div className="flex shrink-0 flex-wrap items-center gap-2">{aside}</div> : null}
    </div>
  );
}

/** A card centred on a muted band (auth, sign-in prompts, verdicts). */
export function Band({ children, className, cardClassName, label }: { children: ReactNode; className?: string; cardClassName?: string; label?: string }) {
  return (
    <div aria-label={label} className={cn("flex w-full items-center justify-center rounded-md bg-muted/40 px-4 py-10", className)}>
      <Card className={cn("flex w-full max-w-md flex-col gap-4 p-5 sm:p-6", cardClassName)}>{children}</Card>
    </div>
  );
}

/** Centred loading spinner for surfaces that wait on auth / data. */
export function Spinner({ label = "Loading", className }: { label?: string; className?: string }) {
  return (
    <div className={cn("flex items-center justify-center py-10", className)} role="status" aria-live="polite">
      <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label={label} />
    </div>
  );
}

/**
 * Class string that restyles the frames of composed behaviour components
 * (ticket forms, form wizard, auth forms): every large radius becomes
 * `rounded-md`, inputs become `h-10` on the page background, skeletons square.
 */
export const frameReset = cn(
  "[&_.rounded-4xl]:rounded-md [&_.rounded-3xl]:rounded-md [&_.rounded-2xl]:rounded-md [&_.rounded-xl]:rounded-md [&_.rounded-lg]:rounded-md",
  "[&_[data-slot=input]]:h-10 [&_[data-slot=input]]:rounded-md [&_[data-slot=input]]:bg-background",
  "[&_[data-slot=button]]:rounded-md [&_[data-slot=skeleton]]:rounded-md [&_[data-slot=auth-error]]:rounded-md",
  "[&_textarea]:rounded-md [&_select]:rounded-md",
);
