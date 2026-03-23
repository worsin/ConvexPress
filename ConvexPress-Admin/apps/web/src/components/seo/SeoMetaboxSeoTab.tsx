/**
 * SeoMetaboxSeoTab - Main SEO tab in the metabox.
 *
 * Focus keyphrase, SERP preview, SEO title/description with char counters,
 * advanced section (cornerstone, canonical, noindex/nofollow), analysis results.
 */

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SerpPreview } from "./SerpPreview";
import { CharacterCounter } from "./CharacterCounter";
import { SeoAnalysisResults } from "./SeoAnalysisResults";
import { SeoScoreBadge } from "./SeoScoreBadge";
import {
  SEO_TITLE_RECOMMENDED_MIN,
  SEO_TITLE_RECOMMENDED_MAX,
  SEO_TITLE_MAX,
  META_DESCRIPTION_RECOMMENDED_MIN,
  META_DESCRIPTION_RECOMMENDED_MAX,
  META_DESCRIPTION_MAX,
  FOCUS_KEYPHRASE_MAX,
} from "@/lib/seo/constants";
import type { AnalysisResult } from "@/lib/seo/types";

interface SeoMetaboxSeoTabProps {
  postTitle: string;
  postSlug: string;
  url: string;
  seoTitle: string;
  onSeoTitleChange: (v: string) => void;
  seoDescription: string;
  onSeoDescriptionChange: (v: string) => void;
  focusKeyphrase: string;
  onFocusKeyphraseChange: (v: string) => void;
  canonical: string;
  onCanonicalChange: (v: string) => void;
  noindex: boolean;
  onNoindexChange: (v: boolean) => void;
  nofollow: boolean;
  onNofollowChange: (v: boolean) => void;
  cornerstone: boolean;
  onCornerstoneChange: (v: boolean) => void;
  contentType: "post" | "page";
  analysisResult: AnalysisResult | null;
  onSave: () => Promise<void>;
}

export function SeoMetaboxSeoTab({
  postTitle,
  postSlug,
  url,
  seoTitle,
  onSeoTitleChange,
  seoDescription,
  onSeoDescriptionChange,
  focusKeyphrase,
  onFocusKeyphraseChange,
  canonical,
  onCanonicalChange,
  noindex,
  onNoindexChange,
  nofollow,
  onNofollowChange,
  cornerstone,
  onCornerstoneChange,
  contentType,
  analysisResult,
  onSave,
}: SeoMetaboxSeoTabProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const displayTitle = seoTitle || postTitle || "Untitled";
  const displayDescription =
    seoDescription || "No meta description set. Search engines will use an excerpt from the page content.";

  return (
    <div className="space-y-4">
      {/* Score badge */}
      {analysisResult && (
        <SeoScoreBadge score={analysisResult.score} />
      )}

      {/* Focus keyphrase */}
      <div className="space-y-1">
        <Label className="text-xs font-medium">Focus Keyphrase</Label>
        <Input
          value={focusKeyphrase}
          onChange={(e) => onFocusKeyphraseChange(e.target.value)}
          onBlur={onSave}
          placeholder="Enter focus keyphrase"
          maxLength={FOCUS_KEYPHRASE_MAX}
          className="h-7 text-xs"
        />
        {!focusKeyphrase && (
          <p className="text-[11px] text-muted-foreground">
            No focus keyphrase set. SEO analysis requires a keyphrase.
          </p>
        )}
      </div>

      {/* SERP Preview */}
      <SerpPreview
        title={displayTitle}
        description={displayDescription}
        url={url}
      />

      {/* SEO Title */}
      <div className="space-y-1">
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
          onChange={(e) => onSeoTitleChange(e.target.value)}
          onBlur={onSave}
          placeholder={postTitle || "Enter SEO title"}
          maxLength={SEO_TITLE_MAX}
          className="h-7 text-xs"
        />
      </div>

      {/* Slug display */}
      <div className="space-y-1">
        <Label className="text-xs font-medium text-muted-foreground">Slug</Label>
        <p className="text-xs text-muted-foreground font-mono px-2 py-1 bg-muted/50 border border-border">
          {postSlug || "..."}
        </p>
      </div>

      {/* Meta Description */}
      <div className="space-y-1">
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
          onChange={(e) => onSeoDescriptionChange(e.target.value)}
          onBlur={onSave}
          placeholder="Enter meta description"
          maxLength={META_DESCRIPTION_MAX}
          className={cn(
            "w-full min-h-[60px] resize-y bg-transparent",
            "border border-border px-2.5 py-1.5 text-xs",
            "rounded-none outline-hidden",
            "placeholder:text-muted-foreground",
            "focus:border-ring focus:ring-1 focus:ring-ring/50",
          )}
        />
      </div>

      {/* Advanced section */}
      <div className="border border-border rounded-none">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full flex items-center gap-1.5 px-3 py-2 text-xs font-medium hover:bg-muted/50 transition-colors"
        >
          {showAdvanced ? (
            <ChevronDown className="size-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 text-muted-foreground" />
          )}
          Advanced
        </button>

        {showAdvanced && (
          <div className="px-3 pb-3 space-y-3 border-t border-border pt-3">
            {/* Cornerstone */}
            <div className="flex items-center gap-2">
              <Checkbox
                checked={cornerstone}
                onCheckedChange={(checked) => {
                  onCornerstoneChange(!!checked);
                }}
              />
              <Label className="cursor-pointer text-xs font-normal">
                Mark as cornerstone content
              </Label>
            </div>

            {/* Canonical URL */}
            <div className="space-y-1">
              <Label className="text-xs font-medium">Canonical URL</Label>
              <Input
                value={canonical}
                onChange={(e) => onCanonicalChange(e.target.value)}
                onBlur={onSave}
                placeholder="Leave empty to use default URL"
                className="h-7 text-xs"
              />
            </div>

            {/* Noindex */}
            <div className="flex items-center gap-2">
              <Checkbox
                checked={noindex}
                onCheckedChange={(checked) => {
                  onNoindexChange(!!checked);
                }}
              />
              <Label className="cursor-pointer text-xs font-normal">
                Discourage search engines from indexing this {contentType}
              </Label>
            </div>

            {/* Nofollow */}
            <div className="flex items-center gap-2">
              <Checkbox
                checked={nofollow}
                onCheckedChange={(checked) => {
                  onNofollowChange(!!checked);
                }}
              />
              <Label className="cursor-pointer text-xs font-normal">
                Tell search engines not to follow links on this {contentType}
              </Label>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={onSave}
              className="text-xs h-7"
            >
              Save SEO Data
            </Button>
          </div>
        )}
      </div>

      {/* Analysis results */}
      {analysisResult && (
        <SeoAnalysisResults
          checks={analysisResult.checks}
          title="SEO Analysis"
        />
      )}
    </div>
  );
}
