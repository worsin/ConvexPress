import { useContext } from "react";
import { AdminShellContext } from "@/components/layout/AdminShellProvider";

/**
 * Access admin shell context (state + actions).
 * Must be used within an AdminShellProvider.
 */
export function useAdminShell() {
  const context = useContext(AdminShellContext);
  if (!context) {
    throw new Error("useAdminShell must be used within an AdminShellProvider");
  }
  return context;
}
