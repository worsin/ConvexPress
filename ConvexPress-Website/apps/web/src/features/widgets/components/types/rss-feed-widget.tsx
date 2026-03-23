/**
 * RSS Feed Widget - Website Renderer
 *
 * Displays items from an external RSS feed.
 * Uses the fetchRssFeed action with 15-minute server-side caching.
 */

import { useAction } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import { useState, useEffect } from "react";

interface RssFeedWidgetConfig {
  feedUrl?: string;
  numItems?: number;
  showSummary?: boolean;
  showAuthor?: boolean;
  showDate?: boolean;
}

interface FeedItem {
  title: string;
  link: string;
  description?: string;
  author?: string;
  pubDate?: string;
}

export function RssFeedWidget({
  config,
}: {
  config: RssFeedWidgetConfig;
}) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchFeed = useAction(api.widgets.actions.fetchRssFeed);

  useEffect(() => {
    if (!config.feedUrl) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        const result = await fetchFeed({
          feedUrl: config.feedUrl!,
          maxItems: config.numItems ?? 5,
        });

        if (!cancelled) {
          setItems(result.items);
          setError(result.error || null);
          setIsLoading(false);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError("Unable to load feed");
          setIsLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [config.feedUrl, config.numItems, fetchFeed]);

  if (!config.feedUrl) {
    return <p className="text-sm text-muted-foreground">No feed URL configured.</p>;
  }

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-2">
        {Array.from({ length: config.numItems ?? 3 }).map((_, i) => (
          <div key={i} className="space-y-1">
            <div className="h-3.5 w-3/4 bg-muted rounded" />
            <div className="h-3 w-1/2 bg-muted rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (error && items.length === 0) {
    return <p className="text-sm text-muted-foreground">{error}</p>;
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No feed items available.</p>;
  }

  return (
    <ul className="space-y-3">
      {items.map((item, index) => (
        <li key={item.link}>
          <a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium hover:underline block leading-snug"
          >
            {item.title}
          </a>

          {config.showDate && item.pubDate && (
            <time className="text-xs text-muted-foreground block mt-0.5">
              {formatRssDate(item.pubDate)}
            </time>
          )}

          {config.showAuthor && item.author && (
            <span className="text-xs text-muted-foreground block">
              by {item.author}
            </span>
          )}

          {config.showSummary && item.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {item.description}
            </p>
          )}
        </li>
      ))}

      {error && (
        <li className="text-[11px] text-muted-foreground/50 italic">{error}</li>
      )}
    </ul>
  );
}

function formatRssDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}
