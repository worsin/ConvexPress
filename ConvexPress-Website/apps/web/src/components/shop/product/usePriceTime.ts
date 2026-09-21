import { useEffect, useState } from "react";
import { nextPriceBoundary, type PriceInput } from "@/templates/sdk/block-data/portable/commercePricing";
/** Wake at a price boundary, not on every animation frame. Recheck when a
 * suspended tab resumes; browsers can throttle background timers. */
export function usePriceTime(prices: readonly PriceInput[], serverTime?: number, deadline?: number): number {
  const [now, setNow] = useState(() => serverTime ?? Date.now());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      if (timer !== undefined) clearTimeout(timer);
      const current = Date.now();
      setNow(current);
      const priceBoundary = nextPriceBoundary(prices, current);
      const next = deadline !== undefined && deadline > current
        ? Math.min(priceBoundary ?? deadline, deadline) : priceBoundary;
      timer = next === null ? undefined : setTimeout(refresh, Math.min(2_147_483_647, Math.max(1, next - current)));
    };
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      if (timer !== undefined) clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [prices, deadline]);
  return now;
}
