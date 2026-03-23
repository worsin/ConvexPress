import { Menu } from "lucide-react";

import { cn } from "@/lib/utils";

interface MobileMenuToggleProps {
  /** Called when the toggle button is clicked */
  onToggle: () => void;
  /** Whether the mobile menu is currently open */
  isOpen?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Hamburger button that toggles the mobile navigation overlay.
 * Visible only on viewports smaller than lg.
 */
export function MobileMenuToggle({
  onToggle,
  isOpen = false,
  className,
}: MobileMenuToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "flex size-8 items-center justify-center text-muted-foreground transition-colors hover:text-foreground lg:hidden",
        className,
      )}
      aria-label={isOpen ? "Close navigation menu" : "Open navigation menu"}
      aria-expanded={isOpen}
    >
      <Menu className="size-5" />
    </button>
  );
}
