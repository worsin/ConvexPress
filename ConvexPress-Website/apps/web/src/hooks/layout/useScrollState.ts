import { useCallback, useEffect, useRef, useState } from "react";

import { LAYOUT_DIMENSIONS } from "@/lib/layout/constants";

interface ScrollState {
  /** Whether the user has scrolled past the threshold */
  isScrolled: boolean;
  /** Whether the back-to-top button should be visible */
  showBackToTop: boolean;
  /** Current scroll Y position */
  scrollY: number;
}

/**
 * Track scroll position for sticky header effects and back-to-top button visibility.
 * Uses requestAnimationFrame for performance.
 */
export function useScrollState(
  threshold: number = LAYOUT_DIMENSIONS.scrollThreshold,
): ScrollState {
  const [state, setState] = useState<ScrollState>({
    isScrolled: false,
    showBackToTop: false,
    scrollY: 0,
  });

  const rafRef = useRef<number | null>(null);

  const handleScroll = useCallback(() => {
    if (rafRef.current !== null) return;

    rafRef.current = requestAnimationFrame(() => {
      const y = window.scrollY;
      setState({
        isScrolled: y > threshold,
        showBackToTop: y > LAYOUT_DIMENSIONS.backToTopThreshold,
        scrollY: y,
      });
      rafRef.current = null;
    });
  }, [threshold]);

  useEffect(() => {
    // Only run on client
    if (typeof window === "undefined") return;

    window.addEventListener("scroll", handleScroll, { passive: true });
    // Set initial state
    handleScroll();

    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [handleScroll]);

  return state;
}
