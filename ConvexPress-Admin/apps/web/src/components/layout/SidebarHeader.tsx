import { Shield } from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarHeaderProps {
  collapsed: boolean;
}

export function SidebarHeader({ collapsed }: SidebarHeaderProps) {
  return (
    <div
      className={cn(
        "flex h-12 items-center border-b border-sidebar-border px-3",
        collapsed ? "justify-center" : "gap-2",
      )}
    >
      <Shield className="size-5 shrink-0 text-sidebar-primary-foreground" aria-hidden="true" />
      {!collapsed && (
        <span className="text-sm font-semibold text-sidebar-foreground truncate">
          ConvexPress
        </span>
      )}
    </div>
  );
}
