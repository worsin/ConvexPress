/**
 * SeoRecentTable - Table of recently updated posts with SEO score data.
 *
 * Shows the 10 most recently updated published posts with their:
 *   - Title (linked to edit page)
 *   - Content type (post/page)
 *   - SEO score badge
 *   - Readability score badge
 *   - Focus keyphrase status
 *   - Meta description status
 *   - Noindex/Cornerstone flags
 *
 * Also shows summary stat cards above the table.
 */

import { Link } from "@tanstack/react-router";
import { FileText, Globe, Star, AlertTriangle, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SeoScoreBadge } from "./SeoScoreBadge";
import type { SeoRecentPost } from "@/lib/seo/types";

interface SeoRecentTableProps {
  recentPosts: SeoRecentPost[];
  totalPublished: number;
  totalIndexed: number;
  cornerstoneCount: number;
}

function StatusIcon({ ok }: { ok: boolean }) {
  return ok ? (
    <Check className="size-3.5 text-seo-good" />
  ) : (
    <X className="size-3.5 text-seo-poor/70" />
  );
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function SeoRecentTable({
  recentPosts,
  totalPublished,
  totalIndexed,
  cornerstoneCount,
}: SeoRecentTableProps) {
  return (
    <div className="space-y-4">
      {/* Summary stat cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="border border-border p-3 flex items-center gap-2.5">
          <FileText className="size-4 text-muted-foreground shrink-0" />
          <div>
            <p className="text-lg font-bold text-foreground tabular-nums leading-none">{totalPublished}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Total Published</p>
          </div>
        </div>
        <div className="border border-border p-3 flex items-center gap-2.5">
          <Globe className="size-4 text-muted-foreground shrink-0" />
          <div>
            <p className="text-lg font-bold text-foreground tabular-nums leading-none">{totalIndexed}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Indexed</p>
          </div>
        </div>
        <div className="border border-border p-3 flex items-center gap-2.5">
          <Star className="size-4 text-muted-foreground shrink-0" />
          <div>
            <p className="text-lg font-bold text-foreground tabular-nums leading-none">{cornerstoneCount}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Cornerstone</p>
          </div>
        </div>
      </div>

      {/* Recent posts table */}
      {recentPosts.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">
          No published posts found. Create and publish content to see SEO data here.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-2 pr-3 font-medium text-muted-foreground">Title</th>
                <th className="py-2 px-3 font-medium text-muted-foreground">Type</th>
                <th className="py-2 px-3 font-medium text-muted-foreground text-center">SEO</th>
                <th className="py-2 px-3 font-medium text-muted-foreground text-center">Readability</th>
                <th className="py-2 px-3 font-medium text-muted-foreground text-center">Keyphrase</th>
                <th className="py-2 px-3 font-medium text-muted-foreground text-center">Description</th>
                <th className="py-2 px-3 font-medium text-muted-foreground">Flags</th>
                <th className="py-2 pl-3 font-medium text-muted-foreground text-right">Updated</th>
              </tr>
            </thead>
            <tbody>
              {recentPosts.map((post) => (
                <tr
                  key={post.postId}
                  className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                >
                  {/* Title */}
                  <td className="py-2 pr-3">
                    {post.type === "page" ? (
                      <Link
                        to="/pages/$pageId/edit"
                        params={{ pageId: post.postId }}
                        className="text-foreground hover:text-primary font-medium truncate max-w-[240px] block"
                        title={post.title}
                      >
                        {post.title || "(Untitled)"}
                      </Link>
                    ) : (
                      <Link
                        to="/posts/$postId/edit"
                        params={{ postId: post.postId }}
                        className="text-foreground hover:text-primary font-medium truncate max-w-[240px] block"
                        title={post.title}
                      >
                        {post.title || "(Untitled)"}
                      </Link>
                    )}
                  </td>

                  {/* Type */}
                  <td className="py-2 px-3">
                    <span
                      className={cn(
                        "inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                        post.type === "page"
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {post.type}
                    </span>
                  </td>

                  {/* SEO Score */}
                  <td className="py-2 px-3 text-center">
                    <div className="flex justify-center">
                      <SeoScoreBadge score={post.seoScore} size="sm" />
                    </div>
                  </td>

                  {/* Readability Score */}
                  <td className="py-2 px-3 text-center">
                    <div className="flex justify-center">
                      <SeoScoreBadge score={post.readabilityScore} size="sm" />
                    </div>
                  </td>

                  {/* Keyphrase */}
                  <td className="py-2 px-3 text-center">
                    <div className="flex justify-center">
                      <StatusIcon ok={post.hasKeyphrase} />
                    </div>
                  </td>

                  {/* Description */}
                  <td className="py-2 px-3 text-center">
                    <div className="flex justify-center">
                      <StatusIcon ok={post.hasDescription} />
                    </div>
                  </td>

                  {/* Flags */}
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-1.5">
                      {post.noindex && (
                        <span
                          className="inline-flex items-center gap-0.5 px-1 py-0.5 text-[10px] bg-seo-poor/10 text-seo-poor"
                          title="Noindex"
                        >
                          <AlertTriangle className="size-2.5" />
                          noindex
                        </span>
                      )}
                      {post.cornerstone && (
                        <span
                          className="inline-flex items-center gap-0.5 px-1 py-0.5 text-[10px] bg-seo-ok/10 text-seo-ok"
                          title="Cornerstone content"
                        >
                          <Star className="size-2.5" />
                          cornerstone
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Updated */}
                  <td className="py-2 pl-3 text-right text-muted-foreground whitespace-nowrap">
                    {formatDate(post.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
