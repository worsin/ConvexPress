import { cn } from "@/lib/utils";

interface SidebarProps {
  position?: "left" | "right";
  className?: string;
  children?: React.ReactNode;
}

/**
 * Optional sidebar for supplementary content.
 * Hidden on mobile, sticky below the header on desktop.
 *
 * Previously rendered widget areas; now accepts children directly.
 */
export function Sidebar({
  position = "right",
  className,
  children,
}: SidebarProps) {
  if (!children) return null;

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
      {children}
    </aside>
  );
}
