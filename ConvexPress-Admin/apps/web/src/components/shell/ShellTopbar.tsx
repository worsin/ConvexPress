/**
 * Shell topbar — the single 52px row above every screen.
 *
 * Shared by the site admin (search, notifications, user menu) and the
 * standalone frame shown before a site is open. In Electron the whole bar is
 * a drag region; interactive children opt out with `app-no-drag`.
 */

import type { ReactNode } from "react";

import { isElectron } from "@/lib/electron";
import { cn } from "@/lib/utils";

export const SHELL_TOPBAR_HEIGHT = 52;

interface ShellTopbarProps {
  /** Identity label of the active environment, exposed for automation. */
  activeEnvironment?: string | null;
  left?: ReactNode;
  center?: ReactNode;
  right?: ReactNode;
  className?: string;
}

export function ShellTopbar({
  activeEnvironment,
  left,
  center,
  right,
  className,
}: ShellTopbarProps) {
  return (
    <header
      role="banner"
      data-active-environment={activeEnvironment ?? undefined}
      className={cn(
        "sticky top-0 z-40 flex shrink-0 items-center gap-3 border-b border-border bg-background px-4",
        isElectron() && "app-drag",
        className,
      )}
      style={{ height: SHELL_TOPBAR_HEIGHT }}
    >
      <div className="flex min-w-0 shrink items-center gap-2.5">{left}</div>
      <div className="hidden min-w-0 flex-1 items-center justify-center px-2 md:flex">
        {center}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1.5">{right}</div>
    </header>
  );
}
