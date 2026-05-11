import { useContext } from "react";

import { LayoutShellContext } from "@/components/layout/LayoutShellProvider";
import type {
  LayoutShellActions,
  LayoutShellState,
} from "@/lib/layout/types";

type UseLayoutShellResult = LayoutShellState & LayoutShellActions;

/**
 * Access layout shell context (state + actions).
 * Must be used within a LayoutShellProvider.
 */
export function useLayoutShell(): UseLayoutShellResult {
  const context = useContext(LayoutShellContext);
  if (!context) {
    throw new Error(
      "useLayoutShell must be used within a LayoutShellProvider",
    );
  }
  return context;
}
