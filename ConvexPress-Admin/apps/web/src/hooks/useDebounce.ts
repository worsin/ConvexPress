import { useEffect, useState } from "react";

/**
 * Generic debounce hook.
 * Returns the debounced value after `delay` ms of no changes.
 * Cleans up timeout on unmount.
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}
