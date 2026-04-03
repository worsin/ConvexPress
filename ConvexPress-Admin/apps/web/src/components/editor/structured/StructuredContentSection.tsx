/**
 * StructuredContentSection - Collapsible section wrapper
 *
 * Similar to MetaboxContainer but without drag-and-drop.
 * Used in the main column for hero, topics, summary, etc.
 */

import { ChevronDown, ChevronRight } from "lucide-react";
import { RegenerateButton } from "./RegenerateButton";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface StructuredContentSectionProps {
  title: string;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onRegenerate?: () => void;
  isRegenerating?: boolean;
  children: ReactNode;
  className?: string;
}

export function StructuredContentSection({
  title,
  isCollapsed,
  onToggleCollapse,
  onRegenerate,
  isRegenerating = false,
  children,
  className,
}: StructuredContentSectionProps) {
  return (
    <div className={cn("border border-border bg-card", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b border-border">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
        >
          {isCollapsed ? (
            <ChevronRight className="size-3.5" />
          ) : (
            <ChevronDown className="size-3.5" />
          )}
          {title}
        </button>

        {onRegenerate && !isCollapsed && (
          <RegenerateButton
            onClick={onRegenerate}
            isLoading={isRegenerating}
          />
        )}
      </div>

      {/* Content */}
      {!isCollapsed && (
        <div className="p-3 space-y-3">
          {children}
        </div>
      )}
    </div>
  );
}
