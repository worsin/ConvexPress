/**
 * SitemapRegenerateButton - Manual regeneration trigger with loading state.
 *
 * Calls the sitemaps.actions.generate action when clicked.
 * Shows a spinner while regeneration is in progress.
 * Disabled when already regenerating.
 */

import { RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SitemapRegenerateButtonProps {
  onRegenerate: (force?: boolean) => Promise<unknown>;
  isRegenerating: boolean;
  disabled?: boolean;
}

export function SitemapRegenerateButton({
  onRegenerate,
  isRegenerating,
  disabled = false,
}: SitemapRegenerateButtonProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={disabled || isRegenerating}
      onClick={() => onRegenerate(true)}
    >
      {isRegenerating ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <RefreshCw className="size-3.5" />
      )}
      {isRegenerating ? "Regenerating..." : "Regenerate Now"}
    </Button>
  );
}
