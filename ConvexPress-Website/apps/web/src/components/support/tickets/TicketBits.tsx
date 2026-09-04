import { Headphones } from "lucide-react";

import { cn } from "@/lib/utils";
import { PRIORITY_META, STATUS_META, type TicketPriority, type TicketStatus, type Tone } from "@/lib/support-tickets";

export const TONE_CHIP: Record<Tone, string> = {
  info: "bg-primary/12 text-primary",
  warn: "bg-warning/15 text-warning",
  good: "bg-success/15 text-success",
  neutral: "border border-border bg-muted text-muted-foreground",
  bad: "bg-destructive/10 text-destructive",
};

export function StatusChip({ status, className, size = "md" }: { status: TicketStatus; className?: string; size?: "sm" | "md" }) {
  const meta = STATUS_META[status] ?? STATUS_META.open;
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full font-semibold", size === "sm" ? "h-5 px-2 text-[11px]" : "h-6 pl-2 pr-2.5 text-xs", TONE_CHIP[meta.tone], className)}>
      <span className={cn("size-[6px] rounded-full bg-current", (status === "open" || status === "inProgress") && "motion-safe:animate-pulse")} aria-hidden />
      {meta.label}
    </span>
  );
}

export function PriorityChip({ priority, className }: { priority: TicketPriority; className?: string }) {
  const meta = PRIORITY_META[priority] ?? PRIORITY_META.medium;
  if (priority === "medium" || priority === "low") return null;
  return <span className={cn("inline-flex h-5 items-center rounded-full px-2 text-[11px] font-semibold", TONE_CHIP[meta.tone], className)}>{meta.label} priority</span>;
}

/** Support-side avatar: a headset on the brand color. */
export function AgentAvatar({ name, size = "md", className }: { name?: string | null; size?: "sm" | "md"; className?: string }) {
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-full bg-primary text-primary-foreground", size === "sm" ? "size-6" : "size-8", className)} aria-hidden title={name ?? "Support"}>
      <Headphones className={size === "sm" ? "size-3" : "size-4"} />
    </span>
  );
}

export function PersonAvatar({ initials, size = "md", className }: { initials: string; size?: "sm" | "md"; className?: string }) {
  return (
    <span className={cn("grid shrink-0 select-none place-items-center rounded-full border border-border bg-muted font-semibold text-foreground", size === "sm" ? "size-6 text-[10px]" : "size-8 text-xs", className)} aria-hidden>
      {initials}
    </span>
  );
}

/** Sparkle-free "AI" mark for assistant replies. */
export function AssistantAvatar({ size = "md", className }: { size?: "sm" | "md"; className?: string }) {
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-full bg-secondary font-semibold text-secondary-foreground", size === "sm" ? "size-6 text-[9px]" : "size-8 text-[10px]", className)} aria-hidden title="Assistant">
      AI
    </span>
  );
}
