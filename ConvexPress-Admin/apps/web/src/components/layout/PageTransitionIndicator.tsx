import { useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

/**
 * Thin progress bar at the top of the content area during route transitions.
 * Uses TanStack Router's isLoading state.
 */
export function PageTransitionIndicator() {
  const routerState = useRouterState();
  const isLoading = routerState.isLoading;

  return (
    <div
      className={cn(
        "h-0.5 bg-primary transition-all duration-500 ease-in-out",
        isLoading ? "w-4/5 opacity-100" : "w-full opacity-0",
      )}
      role="progressbar"
      aria-hidden={!isLoading}
    />
  );
}
