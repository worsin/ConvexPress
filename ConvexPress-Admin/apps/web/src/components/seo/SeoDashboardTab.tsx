/**
 * SeoDashboardTab - Full-page SEO analysis and editing view.
 *
 * Displayed under the "SEO" tab in the post/page detail layout.
 * Top row: 4 score cards (SEO score, readability, issues count, cornerstone toggle).
 * Two-column layout:
 *   Left  - Editable fields (keyphrase, title, description, canonical, robots,
 *           OG overrides, Twitter overrides) + analysis results
 *   Right - Live SERP, Facebook, and Twitter previews
 *
 * Auto-saves individual fields on blur via useSeoMutations.
 */

import { useState, useCallback, useEffect } from "react";
import {
  Search,
  BookOpen,
  AlertTriangle,
  Star,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { SeoScoreBadge } from "./SeoScoreBadge";
import { SerpPreview } from "./SerpPreview";
import { FacebookPreview } from "./FacebookPreview";
import { TwitterPreview } from "./TwitterPreview";
import { SeoAnalysisResults } from "./SeoAnalysisResults";
import { CharacterCounter } from "./CharacterCounter";
import { usePostSeo } from "@/hooks/seo/usePostSeo";
import { useSeoAnalysis } from "@/hooks/seo/useSeoAnalysis";
import { useReadabilityAnalysis } from "@/hooks/seo/useReadabilityAnalysis";
import { useSeoMutations } from "@/hooks/seo/useSeoMutations";
import {
  SEO_TITLE_RECOMMENDED_MIN,
  SEO_TITLE_RECOMMENDED_MAX,
  SEO_TITLE_MAX,
  META_DESCRIPTION_RECOMMENDED_MIN,
  META_DESCRIPTION_RECOMMENDED_MAX,
  META_DESCRIPTION_MAX,
  FOCUS_KEYPHRASE_MAX,
} from "@/lib/seo/constants";
import type { Id } from "@backend/convex/_generated/dataModel";

// ─── Props ──────────────────────────────────────────────────────────────────

interface SeoDashboardTabProps {
  contentType: "post" | "page";
  postId: string;
  post: Record<string, unknown>;
  /** Pre-loaded postSeo from layout context (avoids double-fetching) */
  postSeo: ReturnType<typeof usePostSeo>;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function SeoDashboardTab({
  contentType,
  postId,
  post,
  postSeo,
}: SeoDashboardTabProps) {
  const { updatePostSeo } = useSeoMutations();

  // ── Derive post data from the generic record ─────────────────────────────
  const postTitle = (post.title as string) ?? "";
  const postSlug = (post.slug as string) ?? "";
  const postContent = (post.content as string) ?? "";
  const postExcerpt = (post.excerpt as string) ?? "";

  const siteUrl = ""; // Falls back to relative URL display in previews
  const url =
    contentType === "post"
      ? `${siteUrl}/blog/${postSlug || "..."}`
      : `${siteUrl}/${postSlug || "..."}`;

  // ── Local editable state ─────────────────────────────────────────────────
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [focusKeyphrase, setFocusKeyphrase] = useState("");
  const [canonical, setCanonical] = useState("");
  const [noindex, setNoindex] = useState(false);
  const [nofollow, setNofollow] = useState(false);
  const [cornerstone, setCornerstone] = useState(false);
  const [ogTitle, setOgTitle] = useState("");
  const [ogDescription, setOgDescription] = useState("");
  const [ogImage, setOgImage] = useState("");
  const [twitterTitle, setTwitterTitle] = useState("");
  const [twitterDescription, setTwitterDescription] = useState("");
  const [twitterImage, setTwitterImage] = useState("");

  // ── Sync from server data ────────────────────────────────────────────────
  useEffect(() => {
    if (postSeo) {
      setSeoTitle(postSeo.seoTitle ?? "");
      setSeoDescription(postSeo.seoDescription ?? "");
      setFocusKeyphrase(postSeo.focusKeyphrase ?? "");
      setCanonical(postSeo.canonical ?? "");
      setNoindex(postSeo.noindex ?? false);
      setNofollow(postSeo.nofollow ?? false);
      setCornerstone(postSeo.cornerstone ?? false);
      setOgTitle(postSeo.ogTitle ?? "");
      setOgDescription(postSeo.ogDescription ?? "");
      setOgImage(postSeo.ogImage ?? "");
      setTwitterTitle(postSeo.twitterTitle ?? "");
      setTwitterDescription(postSeo.twitterDescription ?? "");
      setTwitterImage(postSeo.twitterImage ?? "");
    }
  }, [postSeo]);

  // ── Analysis hooks ───────────────────────────────────────────────────────
  const seoAnalysis = useSeoAnalysis({
    content: postContent,
    title: postTitle,
    slug: postSlug,
    excerpt: postExcerpt,
    focusKeyphrase,
    metaTitle: seoTitle,
    metaDescription: seoDescription,
  });

  const readabilityAnalysis = useReadabilityAnalysis({
    content: postContent,
    title: postTitle,
  });

  // ── Save handler ─────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    try {
      await updatePostSeo({
        postId: postId as Id<"posts">,
        seoTitle,
        seoDescription,
        focusKeyphrase,
        canonical,
        noindex,
        nofollow,
        cornerstone,
        ogTitle,
        ogDescription,
        ogImage,
        twitterTitle,
        twitterDescription,
        twitterImage,
        seoScore: seoAnalysis?.score,
        readabilityScore: readabilityAnalysis?.score,
      });
    } catch {
      // Error toast already handled by useSeoMutations
    }
  }, [
    postId,
    seoTitle,
    seoDescription,
    focusKeyphrase,
    canonical,
    noindex,
    nofollow,
    cornerstone,
    ogTitle,
    ogDescription,
    ogImage,
    twitterTitle,
    twitterDescription,
    twitterImage,
    seoAnalysis?.score,
    readabilityAnalysis?.score,
    updatePostSeo,
  ]);

  // ── Computed values ──────────────────────────────────────────────────────
  const displayTitle = seoTitle || postTitle || "Untitled";
  const displayDescription =
    seoDescription ||
    "No meta description set. Search engines will use an excerpt from the page content.";

  const effectiveOgTitle = ogTitle || seoTitle || postTitle;
  const effectiveOgDescription = ogDescription || seoDescription;
  const effectiveTwitterTitle = twitterTitle || effectiveOgTitle;
  const effectiveTwitterDescription =
    twitterDescription || effectiveOgDescription;

  const seoScore = seoAnalysis?.score ?? postSeo?.seoScore ?? null;
  const readabilityScore =
    readabilityAnalysis?.score ?? postSeo?.readabilityScore ?? null;

  // Count issues (poor checks from both analyses)
  const seoIssues =
    seoAnalysis?.checks.filter((c) => c.status === "poor").length ?? 0;
  const readabilityIssues =
    readabilityAnalysis?.checks.filter((c) => c.status === "poor").length ?? 0;
  const totalIssues = seoIssues + readabilityIssues;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 px-6 pb-8">
      {/* ── Score Cards ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {/* SEO Score */}
        <ScoreCard
          icon={Search}
          label="SEO Score"
          value={
            <SeoScoreBadge score={seoScore} size="lg" showLabel={false} />
          }
          sublabel={seoScore != null ? `${seoScore}/100` : "Not analyzed"}
        />

        {/* Readability Score */}
        <ScoreCard
          icon={BookOpen}
          label="Readability"
          value={
            <SeoScoreBadge
              score={readabilityScore}
              size="lg"
              showLabel={false}
            />
          }
          sublabel={
            readabilityScore != null
              ? `${readabilityScore}/100`
              : "Not analyzed"
          }
        />

        {/* Issues */}
        <ScoreCard
          icon={AlertTriangle}
          label="Issues"
          value={
            <span
              className={cn(
                "text-2xl font-semibold tabular-nums",
                totalIssues === 0
                  ? "text-seo-good"
                  : totalIssues <= 3
                    ? "text-seo-ok"
                    : "text-seo-poor",
              )}
            >
              {totalIssues}
            </span>
          }
          sublabel={totalIssues === 0 ? "No issues" : `${totalIssues} to fix`}
        />

        {/* Cornerstone */}
        <div className="flex flex-col gap-2 border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <Star
              className={cn(
                "size-4",
                cornerstone
                  ? "text-primary fill-primary"
                  : "text-muted-foreground",
              )}
            />
            <span className="text-xs font-medium text-muted-foreground">
              Cornerstone
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              checked={cornerstone}
              onCheckedChange={(checked) => {
                setCornerstone(!!checked);
                // Auto-save on toggle
                setTimeout(async () => {
                  try {
                    await updatePostSeo({
                      postId: postId as Id<"posts">,
                      cornerstone: !!checked,
                    });
                  } catch {
                    // handled by useSeoMutations
                  }
                }, 0);
              }}
            />
            <Label className="cursor-pointer text-xs font-normal text-foreground">
              Mark as cornerstone content
            </Label>
          </div>
        </div>
      </div>

      {/* ── Two-Column Layout ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
        {/* ── Left Column: Editable Fields + Analysis ───────────────────── */}
        <div className="space-y-6">
          {/* Focus Keyphrase */}
          <FieldSection>
            <Label className="text-xs font-medium">Focus Keyphrase</Label>
            <Input
              value={focusKeyphrase}
              onChange={(e) => setFocusKeyphrase(e.target.value)}
              onBlur={handleSave}
              placeholder="Enter focus keyphrase"
              maxLength={FOCUS_KEYPHRASE_MAX}
              className="h-8 text-sm"
            />
            {!focusKeyphrase && (
              <p className="text-[11px] text-muted-foreground">
                No focus keyphrase set. SEO analysis requires a keyphrase to
                provide recommendations.
              </p>
            )}
          </FieldSection>

          {/* SEO Title */}
          <FieldSection>
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">SEO Title</Label>
              <CharacterCounter
                current={seoTitle.length}
                recommendedMin={SEO_TITLE_RECOMMENDED_MIN}
                recommendedMax={SEO_TITLE_RECOMMENDED_MAX}
                max={SEO_TITLE_MAX}
              />
            </div>
            <Input
              value={seoTitle}
              onChange={(e) => setSeoTitle(e.target.value)}
              onBlur={handleSave}
              placeholder={postTitle || "Enter SEO title"}
              maxLength={SEO_TITLE_MAX}
              className="h-8 text-sm"
            />
          </FieldSection>

          {/* Meta Description */}
          <FieldSection>
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">Meta Description</Label>
              <CharacterCounter
                current={seoDescription.length}
                recommendedMin={META_DESCRIPTION_RECOMMENDED_MIN}
                recommendedMax={META_DESCRIPTION_RECOMMENDED_MAX}
                max={META_DESCRIPTION_MAX}
              />
            </div>
            <textarea
              value={seoDescription}
              onChange={(e) => setSeoDescription(e.target.value)}
              onBlur={handleSave}
              placeholder="Enter meta description"
              maxLength={META_DESCRIPTION_MAX}
              className={cn(
                "w-full min-h-[80px] resize-y bg-transparent",
                "border border-border px-3 py-2 text-sm",
                "rounded-none outline-hidden",
                "placeholder:text-muted-foreground",
                "focus:border-ring focus:ring-1 focus:ring-ring/50",
              )}
            />
          </FieldSection>

          {/* Canonical URL */}
          <FieldSection>
            <Label className="text-xs font-medium">Canonical URL</Label>
            <Input
              value={canonical}
              onChange={(e) => setCanonical(e.target.value)}
              onBlur={handleSave}
              placeholder="Leave empty to use default URL"
              className="h-8 text-sm"
            />
            <p className="text-[10px] text-muted-foreground">
              Only set this if the content exists at a different primary URL.
            </p>
          </FieldSection>

          {/* Robots directives */}
          <FieldSection>
            <Label className="text-xs font-semibold">Robots Directives</Label>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={noindex}
                  onCheckedChange={(checked) => {
                    const val = !!checked;
                    setNoindex(val);
                    // Auto-save on toggle
                    void updatePostSeo({
                      postId: postId as Id<"posts">,
                      noindex: val,
                    }).catch(() => {});
                  }}
                />
                <Label className="cursor-pointer text-xs font-normal">
                  Discourage search engines from indexing this {contentType} (noindex)
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={nofollow}
                  onCheckedChange={(checked) => {
                    const val = !!checked;
                    setNofollow(val);
                    // Auto-save on toggle
                    void updatePostSeo({
                      postId: postId as Id<"posts">,
                      nofollow: val,
                    }).catch(() => {});
                  }}
                />
                <Label className="cursor-pointer text-xs font-normal">
                  Tell search engines not to follow links (nofollow)
                </Label>
              </div>
            </div>
          </FieldSection>

          {/* ── Open Graph Overrides ──────────────────────────────────────── */}
          <CollapsibleSection title="Open Graph Overrides">
            <div className="space-y-3">
              <FieldSection>
                <Label className="text-xs font-medium">OG Title</Label>
                <Input
                  value={ogTitle}
                  onChange={(e) => setOgTitle(e.target.value)}
                  onBlur={handleSave}
                  placeholder={seoTitle || postTitle || "Uses SEO title"}
                  className="h-8 text-sm"
                />
              </FieldSection>
              <FieldSection>
                <Label className="text-xs font-medium">OG Description</Label>
                <textarea
                  value={ogDescription}
                  onChange={(e) => setOgDescription(e.target.value)}
                  onBlur={handleSave}
                  placeholder={seoDescription || "Uses meta description"}
                  className={cn(
                    "w-full min-h-[60px] resize-y bg-transparent",
                    "border border-border px-3 py-2 text-sm",
                    "rounded-none outline-hidden",
                    "placeholder:text-muted-foreground",
                    "focus:border-ring focus:ring-1 focus:ring-ring/50",
                  )}
                />
              </FieldSection>
              <FieldSection>
                <Label className="text-xs font-medium">OG Image URL</Label>
                <Input
                  value={ogImage}
                  onChange={(e) => setOgImage(e.target.value)}
                  onBlur={handleSave}
                  placeholder="https://... (1200x630 recommended)"
                  className="h-8 text-sm"
                />
                {!ogImage && (
                  <p className="text-[10px] text-muted-foreground">
                    Falls back to featured image, then default OG image from SEO
                    settings.
                  </p>
                )}
              </FieldSection>
            </div>
          </CollapsibleSection>

          {/* ── Twitter Card Overrides ────────────────────────────────────── */}
          <CollapsibleSection title="Twitter Card Overrides">
            <div className="space-y-3">
              <FieldSection>
                <Label className="text-xs font-medium">Twitter Title</Label>
                <Input
                  value={twitterTitle}
                  onChange={(e) => setTwitterTitle(e.target.value)}
                  onBlur={handleSave}
                  placeholder={ogTitle || seoTitle || "Uses OG title"}
                  className="h-8 text-sm"
                />
              </FieldSection>
              <FieldSection>
                <Label className="text-xs font-medium">
                  Twitter Description
                </Label>
                <textarea
                  value={twitterDescription}
                  onChange={(e) => setTwitterDescription(e.target.value)}
                  onBlur={handleSave}
                  placeholder={
                    ogDescription || seoDescription || "Uses OG description"
                  }
                  className={cn(
                    "w-full min-h-[60px] resize-y bg-transparent",
                    "border border-border px-3 py-2 text-sm",
                    "rounded-none outline-hidden",
                    "placeholder:text-muted-foreground",
                    "focus:border-ring focus:ring-1 focus:ring-ring/50",
                  )}
                />
              </FieldSection>
              <FieldSection>
                <Label className="text-xs font-medium">
                  Twitter Image URL
                </Label>
                <Input
                  value={twitterImage}
                  onChange={(e) => setTwitterImage(e.target.value)}
                  onBlur={handleSave}
                  placeholder="https://... (falls back to OG image)"
                  className="h-8 text-sm"
                />
              </FieldSection>
            </div>
          </CollapsibleSection>

          {/* ── Analysis Results ──────────────────────────────────────────── */}
          {seoAnalysis && (
            <SeoAnalysisResults
              checks={seoAnalysis.checks}
              title="SEO Analysis"
            />
          )}
          {readabilityAnalysis && (
            <SeoAnalysisResults
              checks={readabilityAnalysis.checks}
              title="Readability Analysis"
            />
          )}
        </div>

        {/* ── Right Column: Previews ────────────────────────────────────── */}
        <div className="space-y-4">
          <StickyPreviews>
            <SerpPreview
              title={displayTitle}
              description={displayDescription}
              url={url}
            />
            <FacebookPreview
              title={effectiveOgTitle}
              description={effectiveOgDescription}
              image={ogImage || null}
              url={url}
            />
            <TwitterPreview
              title={effectiveTwitterTitle}
              description={effectiveTwitterDescription}
              image={twitterImage || ogImage || null}
              url={url}
            />
          </StickyPreviews>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

/** Simple wrapper for consistent field spacing */
function FieldSection({ children }: { children: React.ReactNode }) {
  return <div className="space-y-1.5">{children}</div>;
}

/** Score card used in the top row */
function ScoreCard({
  icon: Icon,
  label,
  value,
  sublabel,
}: {
  icon: typeof Search;
  label: string;
  value: React.ReactNode;
  sublabel: string;
}) {
  return (
    <div className="flex flex-col gap-2 border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
      </div>
      {value}
      <span className="text-[11px] text-muted-foreground">{sublabel}</span>
    </div>
  );
}

/** Collapsible section with toggle */
function CollapsibleSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-border">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-foreground hover:bg-muted/50 transition-colors"
      >
        {title}
        <span className="text-muted-foreground text-[10px]">
          {open ? "Collapse" : "Expand"}
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-2 border-t border-border">{children}</div>
      )}
    </div>
  );
}

/** Sticky wrapper for previews so they stay visible while scrolling */
function StickyPreviews({ children }: { children: React.ReactNode }) {
  return (
    <div className="lg:sticky lg:top-4 space-y-4">
      {children}
    </div>
  );
}
