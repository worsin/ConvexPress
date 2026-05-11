import { AlertTriangleIcon } from "lucide-react";

/**
 * Warning badge displayed on orphaned menu items (original content deleted).
 */
export function MenuOrphanedBadge() {
  return (
    <span className="inline-flex items-center gap-1 bg-warning/10 text-warning px-1.5 py-0.5 text-[10px] font-medium border border-warning/20">
      <AlertTriangleIcon className="size-3" />
      Original content deleted
    </span>
  );
}
