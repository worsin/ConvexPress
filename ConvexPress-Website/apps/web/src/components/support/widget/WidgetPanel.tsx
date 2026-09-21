/**
 * Nonmodal panel container for the support widget.
 *
 * Renders a fixed-position panel in the bottom corner while open.
 * Contains a header with title, back button, and close button.
 * Children are rendered in a scrollable content area.
 */

import { useEffect, useRef } from "react";
import { ArrowLeft, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface WidgetPanelProps {
  isOpen: boolean;
  position: "bottomRight" | "bottomLeft";
  title: string;
  showBack: boolean;
  onBack: () => void;
  onClose: () => void;
  children: React.ReactNode;
}

export function WidgetPanel({
  isOpen,
  position,
  title,
  showBack,
  onBack,
  onClose,
  children,
}: WidgetPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    const trigger = document.activeElement;
    panelRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("keydown", handleEscape);
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, [isOpen, onClose]);

  // A closed panel has no interactive descendants or accessibility-tree entry.
  // Widget navigation state remains in the parent and reopening starts at Home.
  if (!isOpen) return null;

  return (
    <div
      ref={panelRef}
      className={cn(
        "fixed z-50 flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl",
        "w-[380px] max-w-[calc(100vw-2rem)]",
        position === "bottomRight"
          ? "bottom-24 right-6 origin-bottom-right"
          : "bottom-24 left-6 origin-bottom-left",
        "h-[min(600px,calc(100vh-8rem))]",
      )}
      role="dialog"
      aria-label="Support widget"
    >
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/50 px-4 py-3">
        {showBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Go back"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <h2 className="flex-1 truncate text-sm font-semibold text-foreground">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close support widget"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
