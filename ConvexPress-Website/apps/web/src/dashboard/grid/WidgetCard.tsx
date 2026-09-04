/**
 * Widget card chrome: title row (icon, title, optional Actions slot) and a
 * scrollable body. In customize mode the header carries the drag handle and
 * the per-widget controls (size, settings, hide). Widgets render only their
 * body; the card is the shell's.
 */

import type { ReactNode } from "react";
import { EyeOff, GripVertical, Maximize2, SlidersHorizontal } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { resolveIcon } from "../icons";
import type { DashboardWidgetSize } from "../types";

interface WidgetCardProps {
  title: ReactNode;
  icon?: string;
  actions?: ReactNode;
  children: ReactNode;
  editing?: boolean;
  size?: DashboardWidgetSize | null;
  hasSettings?: boolean;
  onCycleSize?: () => void;
  onOpenSettings?: () => void;
  onHide?: () => void;
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
  className?: string;
  titleId: string;
}

export function WidgetCard({
  title,
  icon,
  actions,
  children,
  editing = false,
  size,
  hasSettings = false,
  onCycleSize,
  onOpenSettings,
  onHide,
  dragHandleProps,
  className,
  titleId,
}: WidgetCardProps) {
  const Icon = resolveIcon(icon);
  return (
    <section
      data-slot="dashboard-widget-card"
      aria-labelledby={titleId}
      className={cn(
        "flex h-full min-h-0 flex-col border border-border bg-card text-card-foreground",
        "transition-shadow",
        editing && "ring-1 ring-primary/30 shadow-sm",
        className,
      )}
    >
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border/70 px-3">
        {editing && (
          <button
            type="button"
            aria-label="Drag to move"
            className="-ml-1 flex size-7 cursor-grab touch-none items-center justify-center text-muted-foreground hover:text-foreground active:cursor-grabbing focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
            {...dragHandleProps}
          >
            <GripVertical className="size-4" aria-hidden="true" />
          </button>
        )}
        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <h2 id={titleId} className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
          {title}
        </h2>
        {editing ? (
          <div className="flex items-center gap-0.5">
            {onCycleSize && (
              <button
                type="button"
                onClick={onCycleSize}
                aria-label={`Change size (currently ${size ?? "custom"})`}
                title="Change size"
                className="flex h-7 items-center gap-1 px-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Maximize2 className="size-3.5" aria-hidden="true" />
                {size ?? "—"}
              </button>
            )}
            {hasSettings && onOpenSettings && (
              <button
                type="button"
                onClick={onOpenSettings}
                aria-label="Widget settings"
                title="Settings"
                className="flex size-7 items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
              >
                <SlidersHorizontal className="size-3.5" aria-hidden="true" />
              </button>
            )}
            {onHide && (
              <button
                type="button"
                onClick={onHide}
                aria-label="Hide widget"
                title="Hide"
                className="flex size-7 items-center justify-center text-muted-foreground hover:text-destructive focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
              >
                <EyeOff className="size-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        ) : (
          actions && <div className="flex shrink-0 items-center gap-1 text-xs">{actions}</div>
        )}
      </header>
      <div className={cn("min-h-0 flex-1 overflow-auto p-3", editing && "pointer-events-none select-none")}>
        {children}
      </div>
    </section>
  );
}

/** Body skeleton widgets can use while their first subscription resolves. */
export function WidgetSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className={cn("h-3", index === 0 ? "w-3/4" : index % 2 ? "w-1/2" : "w-2/3")} />
      ))}
    </div>
  );
}

/** Compact empty state that fits a small card. */
export function WidgetEmpty({ icon, title, description, action }: { icon?: string; title: string; description?: string; action?: ReactNode }) {
  const Icon = resolveIcon(icon);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1.5 py-4 text-center">
      <Icon className="size-6 text-muted-foreground/70" aria-hidden="true" />
      <p className="text-xs font-medium text-foreground">{title}</p>
      {description && <p className="max-w-[24ch] text-[11px] text-muted-foreground">{description}</p>}
      {action && <div className="mt-1 text-xs">{action}</div>}
    </div>
  );
}
