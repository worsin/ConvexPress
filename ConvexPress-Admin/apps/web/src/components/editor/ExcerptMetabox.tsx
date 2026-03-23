/**
 * ExcerptMetabox - Plain textarea for manual excerpt
 *
 * Provides a resizable textarea with character count and help text.
 */

import { cn } from "@/lib/utils";

interface ExcerptMetaboxProps {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
}

export function ExcerptMetabox({
  value,
  onChange,
  maxLength = 1000,
}: ExcerptMetaboxProps) {
  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Write a short excerpt (optional)"
        maxLength={maxLength}
        className={cn(
          "w-full min-h-[80px] resize-y bg-transparent",
          "border border-border px-2.5 py-1.5 text-xs",
          "rounded-none outline-hidden",
          "placeholder:text-muted-foreground",
          "focus:border-ring focus:ring-1 focus:ring-ring/50",
        )}
        aria-label="Excerpt"
      />
      <div className="flex justify-between mt-1">
        <p className="text-xs text-muted-foreground">
          Excerpts are optional hand-crafted summaries of your content. These
          are used in your theme and in RSS feeds.
        </p>
        <span className="text-xs text-muted-foreground shrink-0 ml-2">
          {value.length}/{maxLength}
        </span>
      </div>
    </div>
  );
}
