/**
 * SitemapAutoRegenSettings - Auto-regeneration toggle and debounce config.
 *
 * Controls:
 *   - Auto-regeneration enable/disable toggle
 *   - Debounce interval selector (5s - 5min)
 */

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { DEBOUNCE_PRESETS } from "@/lib/sitemaps/constants";

interface SitemapAutoRegenSettingsProps {
  autoRegenerate: boolean;
  debounceMs: number;
  onAutoRegenerateChange: (enabled: boolean) => void;
  onDebounceMsChange: (ms: number) => void;
  disabled?: boolean;
}

export function SitemapAutoRegenSettings({
  autoRegenerate,
  debounceMs,
  onAutoRegenerateChange,
  onDebounceMsChange,
  disabled = false,
}: SitemapAutoRegenSettingsProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <Checkbox
          checked={autoRegenerate}
          onCheckedChange={(checked) => onAutoRegenerateChange(checked === true)}
          disabled={disabled}
        />
        <div>
          <Label className="text-xs font-medium">Auto-regenerate on content changes</Label>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Automatically regenerate the sitemap when posts, pages, or taxonomies are published, updated, or deleted.
          </p>
        </div>
      </div>

      {autoRegenerate && (
        <div className="ml-7">
          <label className="text-[11px] text-muted-foreground block mb-1">
            Debounce Interval
          </label>
          <select
            value={debounceMs}
            onChange={(e) => onDebounceMsChange(parseInt(e.target.value, 10))}
            disabled={disabled}
            className="dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/50 h-7 rounded-none border bg-transparent px-2 py-1 text-xs transition-colors focus-visible:ring-1 w-48 min-w-0 outline-hidden appearance-none disabled:opacity-50"
          >
            {DEBOUNCE_PRESETS.map((preset) => (
              <option key={preset.value} value={preset.value}>
                {preset.label}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-muted-foreground mt-1">
            Wait this long after the last content change before regenerating.
            Prevents excessive regeneration during bulk operations.
          </p>
        </div>
      )}
    </div>
  );
}
