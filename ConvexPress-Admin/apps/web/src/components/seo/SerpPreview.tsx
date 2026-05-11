/**
 * SerpPreview - Live Google SERP snippet preview.
 *
 * Shows URL breadcrumb, SEO title (truncated at ~60), and
 * meta description (truncated at ~160) in Google style.
 */

import { truncateForSerp, formatSerpUrl } from "@/lib/seo/utils";

interface SerpPreviewProps {
  title: string;
  description: string;
  url: string;
  /** Post/page slug for URL display */
  slug?: string;
}

export function SerpPreview({
  title,
  description,
  url,
}: SerpPreviewProps) {
  const displayTitle = title || "Untitled";
  const displayDescription =
    description ||
    "No meta description set. Search engines will use an excerpt from the page content.";

  const { text: truncatedTitle, isTruncated: titleTruncated } = truncateForSerp(
    displayTitle,
    60,
  );
  const { text: truncatedDesc } = truncateForSerp(displayDescription, 160);
  const formattedUrl = formatSerpUrl(url);

  return (
    <div className="border border-border rounded-none p-3 bg-muted/30">
      <p className="text-[10px] text-muted-foreground mb-1.5 uppercase tracking-wider font-medium">
        Google Preview
      </p>
      <div className="space-y-0.5">
        {/* URL breadcrumb */}
        <p className="text-xs text-muted-foreground truncate">{formattedUrl}</p>
        {/* Title */}
        <p
          className="text-sm text-primary hover:underline cursor-pointer leading-snug"
          title={titleTruncated ? displayTitle : undefined}
        >
          {truncatedTitle}
        </p>
        {/* Description */}
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
          {truncatedDesc}
        </p>
      </div>
    </div>
  );
}
