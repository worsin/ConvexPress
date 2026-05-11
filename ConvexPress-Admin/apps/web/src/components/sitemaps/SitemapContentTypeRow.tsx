/**
 * SitemapContentTypeRow - Per content-type settings row.
 *
 * Displays:
 *   - Enable/disable checkbox
 *   - Content type label and description
 *   - Changefreq dropdown
 *   - Priority number input
 *
 * Used for Posts, Pages, Categories, Tags, Authors.
 */

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { CHANGEFREQ_OPTIONS, VALIDATION } from "@/lib/sitemaps/constants";
import type { SitemapChangefreq, ContentSitemapType } from "@/lib/sitemaps/types";

interface SitemapContentTypeRowProps {
  type: ContentSitemapType;
  label: string;
  description: string;
  enabled: boolean;
  changefreq: SitemapChangefreq;
  priority: number;
  onEnabledChange: (enabled: boolean) => void;
  onChangefreqChange: (changefreq: SitemapChangefreq) => void;
  onPriorityChange: (priority: number) => void;
}

export function SitemapContentTypeRow({
  type,
  label,
  description,
  enabled,
  changefreq,
  priority,
  onEnabledChange,
  onChangefreqChange,
  onPriorityChange,
}: SitemapContentTypeRowProps) {
  return (
    <div className="flex items-start gap-4 py-3 border-b border-border last:border-b-0">
      {/* Enable checkbox */}
      <div className="pt-0.5">
        <Checkbox
          checked={enabled}
          onCheckedChange={(checked) => onEnabledChange(checked === true)}
        />
      </div>

      {/* Label + description */}
      <div className="flex-1 min-w-0">
        <Label className="text-xs font-medium">{label}</Label>
        <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>
      </div>

      {/* Changefreq dropdown */}
      <div className="w-28 shrink-0">
        <label className="text-[11px] text-muted-foreground block mb-1">Changefreq</label>
        <select
          value={changefreq}
          onChange={(e) => onChangefreqChange(e.target.value as SitemapChangefreq)}
          disabled={!enabled}
          className="dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/50 h-7 rounded-none border bg-transparent px-2 py-1 text-xs transition-colors focus-visible:ring-1 w-full min-w-0 outline-hidden appearance-none disabled:opacity-50"
        >
          {CHANGEFREQ_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Priority input */}
      <div className="w-20 shrink-0">
        <label className="text-[11px] text-muted-foreground block mb-1">Priority</label>
        <input
          type="number"
          min={VALIDATION.PRIORITY_MIN}
          max={VALIDATION.PRIORITY_MAX}
          step={VALIDATION.PRIORITY_STEP}
          value={priority}
          onChange={(e) => {
            const val = parseFloat(e.target.value);
            if (!isNaN(val) && val >= VALIDATION.PRIORITY_MIN && val <= VALIDATION.PRIORITY_MAX) {
              onPriorityChange(val);
            }
          }}
          disabled={!enabled}
          className="dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/50 h-7 rounded-none border bg-transparent px-2 py-1 text-xs transition-colors focus-visible:ring-1 w-full min-w-0 outline-hidden disabled:opacity-50"
        />
      </div>
    </div>
  );
}
