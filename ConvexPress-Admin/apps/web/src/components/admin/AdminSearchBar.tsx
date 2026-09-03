/**
 * Admin Search Bar
 *
 * Trigger button for the admin command palette search overlay.
 * Placed in the admin header/toolbar, visible on every admin page.
 *
 * Keyboard shortcut: Ctrl+K / Cmd+K
 *
 * Layout: [Search icon] [Search posts, pages, people, settings] [⌘K hint]
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
          "flex h-9 w-full min-w-[140px] max-w-[340px] items-center gap-2.5 rounded-lg border border-border bg-card px-3 text-[13.5px] text-muted-foreground transition-colors hover:border-line-strong hover:text-foreground",
          className,
        )}
        aria-label="Search admin content (Ctrl+K)"
      >
        <Search className="size-4 shrink-0" aria-hidden="true" />
        <span className="flex-1 truncate text-left">
          Search posts, pages, people, settings
        </span>
        <kbd className="hidden rounded-[5px] border border-border px-1.5 py-px font-sans text-[10.5px] leading-[16px] text-muted-foreground sm:inline-block">
          {isMac ? "⌘K" : "Ctrl+K"}
        </kbd>
      </button>

      <AdminSearchOverlay isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
