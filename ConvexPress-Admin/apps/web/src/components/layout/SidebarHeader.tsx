import { Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { isMacElectron } from "@/lib/electron";

interface SidebarHeaderProps {
  collapsed: boolean;
}

export function SidebarHeader({ collapsed }: SidebarHeaderProps) {
  const macElectron = isMacElectron();
  // On macOS Electron, traffic-light buttons sit at top-left of the window.
  // Reserve ~76px of horizontal space so they don't overlap the logo/text.
  const hideLogo = macElectron && collapsed;

  return (
    <div
      className={cn(
        "flex h-12 items-center border-b border-sidebar-border",
        collapsed ? "justify-center px-3" : "gap-2 px-3",
        macElectron && !collapsed && "pl-20",
        macElectron && "app-drag",
      )}
    >
      {!hideLogo && (
        <Shield
          className="size-5 shrink-0 text-sidebar-primary-foreground"
          aria-hidden="true"
        />
      )}
      {!collapsed && (
        <span className="text-sm font-semibold text-sidebar-foreground truncate">
          ConvexPress
        </span>
      )}
    </div>
  );
}
