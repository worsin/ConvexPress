import { cn } from "@/lib/utils";

import { WidgetArea } from "./WidgetArea";

interface SidebarProps {
  widgetAreaSlug?: string;
  position?: "left" | "right";
  className?: string;
}

/**
 * Optional sidebar rendering widget area content.
 * Hidden on mobile, sticky below the header on desktop.
 */
export function Sidebar({
  widgetAreaSlug = "sidebar-1",
  position = "right",
  className,
}: SidebarProps) {
  return (
    <aside
      data-slot="sidebar"
      role="complementary"
      aria-label="Sidebar"
      className={cn(
        "hidden w-64 shrink-0 lg:block lg:w-72",
        "sticky top-20",
        position === "left" ? "border-r border-border pr-6" : "border-l border-border pl-6",
        className,
      )}
    >
      <WidgetArea slug={widgetAreaSlug} />
    </aside>
  );
}
