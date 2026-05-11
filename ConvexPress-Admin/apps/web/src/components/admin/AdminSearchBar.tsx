/**
 * Admin Search Bar
 *
 * Trigger button for the admin command palette search overlay.
 * Placed in the admin header/toolbar, visible on every admin page.
 *
 * Keyboard shortcut: Ctrl+K / Cmd+K
 *
 * Layout: [Search icon] [Search everything...] [Ctrl+K hint]
 */

import * as React from "react";
import { Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { AdminSearchOverlay } from "./AdminSearchOverlay";

interface AdminSearchBarProps {
  className?: string;
}

export function AdminSearchBar({ className }: AdminSearchBarProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  // Global keyboard shortcut: Ctrl+K / Cmd+K
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const isMac =
    typeof navigator !== "undefined" &&
    /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={cn(
          "flex items-center gap-2 rounded-sm border border-border bg-muted/50 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
          "min-w-[200px] max-w-xs",
          className,
        )}
        aria-label="Search admin content (Ctrl+K)"
      >
        <Search className="size-3.5" />
        <span className="flex-1 text-left text-xs">Search everything...</span>
        <kbd className="hidden rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] leading-none text-muted-foreground sm:inline-block">
          {isMac ? "\u2318K" : "Ctrl+K"}
        </kbd>
      </button>

      <AdminSearchOverlay isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
