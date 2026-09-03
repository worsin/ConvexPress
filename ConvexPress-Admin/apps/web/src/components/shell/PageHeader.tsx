/**
 * Page header — eyebrow, serif title, optional chip, a meta line, actions.
 * The one place where Instrument Serif is allowed at display size.
 */

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface PageHeaderProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  chip?: ReactNode;
  meta?: ReactNode[];
  actions?: ReactNode;
  className?: string;
  /** Smaller variant for inner pages. */
  size?: "lg" | "md";
}

export function PageHeader({
  eyebrow,
  title,
  chip,
  meta,
  actions,
  className,
  size = "lg",
}: PageHeaderProps) {
  const items = (meta ?? []).filter(Boolean);
  return (
    <div
      className={cn(
        "flex flex-wrap items-end justify-between gap-x-6 gap-y-4",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1
          className={cn(
            "mt-1.5 flex flex-wrap items-center gap-x-3.5 gap-y-2 font-serif leading-none tracking-[-0.01em] text-foreground",
            size === "lg" ? "text-[38px]" : "text-[28px]",
          )}
        >
          <span className="min-w-0 truncate">{title}</span>
          {chip}
        </h1>
        {items.length > 0 && (
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[13px] text-ink-2">
            {items.map((item, index) => (
              <span key={index} className="flex items-center gap-3.5">
                {index > 0 && (
                  <span aria-hidden="true" className="size-[3px] rounded-full bg-line-strong" />
                )}
                {item}
              </span>
            ))}
          </div>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2.5">{actions}</div>}
    </div>
  );
}
