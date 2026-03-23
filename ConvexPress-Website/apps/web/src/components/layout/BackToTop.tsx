import { ArrowUp } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";
import { useLayoutShell } from "@/hooks/layout/useLayoutShell";

/**
 * Floating button that appears after scrolling down.
 * Scrolls the user back to the top of the page on click.
 * Only renders client-side to avoid SSR hydration mismatch.
 */
export function BackToTop() {
  const { showBackToTop } = useLayoutShell();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Don't render during SSR
  if (!mounted) return null;

  const handleClick = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <button
      data-slot="back-to-top"
      type="button"
      onClick={handleClick}
      aria-label="Back to top"
      className={cn(
        "fixed bottom-6 right-6 z-30 flex size-10 items-center justify-center rounded-none bg-primary text-primary-foreground shadow-md transition-all",
        "hover:bg-primary/90",
        showBackToTop
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-4 opacity-0",
      )}
    >
      <ArrowUp className="size-4" aria-hidden="true" />
    </button>
  );
}
