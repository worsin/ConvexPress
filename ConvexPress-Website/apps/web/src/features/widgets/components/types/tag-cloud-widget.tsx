/**
 * Tag Cloud Widget - Website Renderer
 *
 * Displays tags in a cloud layout with varying sizes based on usage.
 */

import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

interface TagCloudWidgetConfig {
  maxTags?: number;
  taxonomy?: string;
}

export function TagCloudWidget({
  config,
}: {
  config: TagCloudWidgetConfig;
}) {
  const maxTags = config.maxTags ?? 45;

  const taxonomyType = config.taxonomy === "category" ? "category" as const : "post_tag" as const;

  // useQuery never throws - it returns undefined while loading.
  // No try/catch needed (and wrapping hooks in try/catch is an anti-pattern).
  const result = useQuery(api.taxonomies.queries.list, {
    taxonomy: taxonomyType,
    hideEmpty: true,
    orderBy: "count" as const,
    orderDir: "desc" as const,
  });
  const tags = result?.terms;

  if (!tags || tags.length === 0) {
    return <p className="text-sm text-muted-foreground">No tags.</p>;
  }

  const displayTags = tags.slice(0, maxTags);

  // Calculate font sizes based on count
  const counts = displayTags.map((t: (typeof displayTags)[number]) => t.count ?? 1);
  const maxCount = Math.max(...counts, 1);
  const minCount = Math.min(...counts, 1);

  const getFontSize = (count: number) => {
    if (maxCount === minCount) return "text-sm";
    const ratio = (count - minCount) / (maxCount - minCount);
    if (ratio < 0.2) return "text-xs";
    if (ratio < 0.4) return "text-sm";
    if (ratio < 0.6) return "text-base";
    if (ratio < 0.8) return "text-lg";
    return "text-xl";
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      {displayTags.map((tag: (typeof displayTags)[number]) => (
        <a
          key={tag._id}
          href={`/tag/${tag.slug}`}
          className={`${getFontSize(tag.count ?? 1)} hover:underline text-foreground/70 hover:text-foreground transition-colors`}
        >
          {tag.name}
        </a>
      ))}
    </div>
  );
}
