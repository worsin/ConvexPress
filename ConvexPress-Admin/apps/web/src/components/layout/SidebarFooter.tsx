import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarFooterProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function SidebarFooter({ collapsed, onToggle }: SidebarFooterProps) {
  return (
    <div className="border-t border-sidebar-border p-2">
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "flex w-full items-center rounded-sm px-2 py-1.5 text-sm transition-colors",
          "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          collapsed ? "justify-center" : "gap-2",
        )}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? (
          <ChevronsRight className="size-4" />
        ) : (
          <>
            <ChevronsLeft className="size-4" />
            <span className="text-xs">Collapse</span>
          </>
        )}
      </button>
    </div>
  );
}
