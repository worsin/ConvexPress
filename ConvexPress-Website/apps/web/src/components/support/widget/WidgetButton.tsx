/**
 * Floating support widget button.
 *
 * Renders as a fixed-position circular button in the bottom corner.
 * Shows an unread badge when there are ticket updates.
 * Clicking toggles the widget panel open/closed.
 */

import { MessageCircleQuestion, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface WidgetButtonProps {
  isOpen: boolean;
  position: "bottomRight" | "bottomLeft";
  unreadCount?: number;
  onClick: () => void;
}

export function WidgetButton({
  isOpen,
  position,
  unreadCount = 0,
  onClick,
}: WidgetButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={isOpen ? "Close support widget" : "Open support widget"}
      className={cn(
        "fixed z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-lg",
        "bg-primary text-primary-foreground",
        "transition-all duration-200 hover:scale-105 hover:shadow-xl",
        "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        position === "bottomRight" ? "bottom-6 right-6" : "bottom-6 left-6",
      )}
    >
      {isOpen ? (
        <X className="h-6 w-6" />
      ) : (
        <>
          <MessageCircleQuestion className="h-6 w-6" />
          {unreadCount > 0 && (
            <span
              className={cn(
                "absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center",
                "rounded-full bg-destructive px-1 text-xs font-bold text-destructive-foreground",
              )}
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </>
      )}
    </button>
  );
}
