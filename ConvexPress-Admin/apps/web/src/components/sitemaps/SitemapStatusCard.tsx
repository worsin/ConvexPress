/**
 * SitemapStatusCard - Status overview card for the sitemap settings page.
 *
 * Displays:
 *   - Active/Inactive/Stale status badge
 *   - Sitemap URL with copy button
 *   - Total URL count with per-type breakdown
 *   - Last generated timestamp
 *   - Regenerate Now button
 *   - View Sitemap external link
 *
 * Subscribes to real-time updates via useQuery.
 */

import { useState } from "react";
import {
  Globe,
  Copy,
  Check,
  ExternalLink,
  FileText,
  Tag,
  FolderOpen,
  Users,
  FileStack,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, CardAction } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SitemapRegenerateButton } from "./SitemapRegenerateButton";
import { CONTENT_TYPE_LABELS } from "@/lib/sitemaps/constants";
import type { SitemapStatus, ContentSitemapType } from "@/lib/sitemaps/types";

interface SitemapStatusCardProps {
  status: SitemapStatus | undefined;
  isRegenerating: boolean;
  onRegenerate: (force?: boolean) => Promise<unknown>;
}

const TYPE_ICONS: Record<ContentSitemapType, React.ReactNode> = {
  posts: <FileText className="size-3.5" />,
  pages: <FileStack className="size-3.5" />,
  categories: <FolderOpen className="size-3.5" />,
  tags: <Tag className="size-3.5" />,
  authors: <Users className="size-3.5" />,
};

function StatusBadge({ status }: { status: SitemapStatus | undefined }) {
  if (!status) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium bg-muted text-muted-foreground">
        Loading...
      </span>
    );
  }

  if (!status.enabled) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium bg-muted text-muted-foreground">
        Inactive
      </span>
    );
  }

  if (status.hasStale) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400">
        <span className="size-1.5 bg-amber-500 rounded-full" />
        Stale
      </span>
    );
  }

  if (!status.lastGenerated) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium bg-muted text-muted-foreground">
        No sitemap generated
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
      <span className="size-1.5 bg-emerald-500 rounded-full" />
      Active
    </span>
  );
}

function formatTimestamp(ts: number | null): string {
  if (!ts) return "Never";
  const date = new Date(ts);
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SitemapStatusCard({
  status,
  isRegenerating,
  onRegenerate,
}: SitemapStatusCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!status?.indexUrl) return;
    try {
      await navigator.clipboard.writeText(status.indexUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Globe className="size-4 text-muted-foreground" />
          <CardTitle>Sitemap Status</CardTitle>
          <StatusBadge status={status} />
        </div>
        <CardAction>
          <div className="flex items-center gap-2">
            {status?.indexUrl && (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => window.open(status.indexUrl!, "_blank")}
              >
                <ExternalLink className="size-3" />
                View Sitemap
              </Button>
            )}
            <SitemapRegenerateButton
              onRegenerate={onRegenerate}
              isRegenerating={isRegenerating}
              disabled={!status?.enabled}
            />
          </div>
        </CardAction>
      </CardHeader>

      <CardContent>
        {/* Loading state */}
        {status === undefined && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            Loading sitemap status...
          </div>
        )}

        {/* Disabled state */}
        {status && !status.enabled && (
          <p className="text-xs text-muted-foreground">
            XML sitemap generation is disabled. Enable it below to start generating sitemaps.
          </p>
        )}

        {/* Active state with data */}
        {status && status.enabled && (
          <div className="space-y-4">
            {/* Sitemap URL */}
            {status.indexUrl && (
              <div className="flex items-center gap-2">
                <code className="text-xs bg-muted px-2 py-1 flex-1 truncate">
                  {status.indexUrl}
                </code>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={handleCopy}
                  title="Copy URL"
                >
                  {copied ? (
                    <Check className="size-3 text-emerald-500" />
                  ) : (
                    <Copy className="size-3" />
                  )}
                </Button>
              </div>
            )}

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <p className="text-[11px] text-muted-foreground">Total URLs</p>
                <p className="text-sm font-semibold">{status.totalUrls.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Last Generated</p>
                <p className="text-sm font-semibold">
                  {formatTimestamp(status.lastGenerated)}
                </p>
              </div>
            </div>

            {/* Per-type breakdown */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                URL Breakdown
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {(["posts", "pages", "categories", "tags", "authors"] as const).map((type) => {
                  const typeStats = status.perType[type];
                  if (!typeStats || typeStats.urlCount === 0) return null;
                  return (
                    <div
                      key={type}
                      className={cn(
                        "flex items-center gap-1.5 px-2 py-1 bg-muted/50 text-xs",
                      )}
                    >
                      {TYPE_ICONS[type]}
                      <span className="text-muted-foreground">
                        {CONTENT_TYPE_LABELS[type]}:
                      </span>
                      <span className="font-medium">{typeStats.urlCount}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
