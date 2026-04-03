/**
 * RegenerateButton - AI content regeneration trigger
 *
 * Small button with sparkle icon. Extension point for AI-powered
 * content generation — currently shows a "coming soon" toast.
 */

import { Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface RegenerateButtonProps {
  onClick: () => void;
  isLoading?: boolean;
  label?: string;
  className?: string;
}

export function RegenerateButton({
  onClick,
  isLoading = false,
  label = "Regenerate with AI",
  className,
}: RegenerateButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isLoading}
      className={cn(
        "inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium",
        "bg-primary/10 text-primary hover:bg-primary/20",
        "transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
        className,
      )}
      title={label}
      aria-label={label}
    >
      {isLoading ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        <Sparkles className="size-3" />
      )}
      <span className="hidden sm:inline">{isLoading ? "Generating..." : label}</span>
    </button>
  );
}
