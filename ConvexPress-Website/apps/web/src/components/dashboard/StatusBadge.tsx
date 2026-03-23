import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: string;
  variant?: "default" | "outline";
}

/**
 * Status badge mapping using CSS variables only.
 */
const STATUS_STYLES: Record<string, string> = {
  published: "bg-primary/10 text-primary",
  approved: "bg-primary/10 text-primary",
  draft: "bg-muted text-muted-foreground",
  pending: "bg-primary/20 text-primary",
  spam: "bg-destructive/10 text-destructive",
  trash: "bg-destructive/10 text-destructive",
};

/**
 * Small badge component for showing content/comment status.
 */
export function StatusBadge({ status, variant = "default" }: StatusBadgeProps) {
  const statusKey = status.toLowerCase();
  const styleClass =
    STATUS_STYLES[statusKey] ?? "bg-muted text-muted-foreground";

  return (
    <span
      data-slot="status-badge"
      className={cn(
        "inline-flex items-center rounded-none px-1.5 py-0.5 text-[10px] font-medium",
        variant === "outline" && "border border-border bg-transparent",
        variant === "default" && styleClass,
      )}
    >
      {status}
    </span>
  );
}
