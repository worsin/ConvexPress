/**
 * SeoMetaboxSocialTab - Social sharing preview and overrides tab.
 *
 * Facebook preview + OG overrides, Twitter preview + overrides.
 */

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FacebookPreview } from "./FacebookPreview";
import { TwitterPreview } from "./TwitterPreview";

interface SeoMetaboxSocialTabProps {
  postTitle: string;
  seoTitle: string;
  seoDescription: string;
  url: string;
  ogTitle: string;
  onOgTitleChange: (v: string) => void;
  ogDescription: string;
  onOgDescriptionChange: (v: string) => void;
  ogImage: string;
  onOgImageChange: (v: string) => void;
  twitterTitle: string;
  onTwitterTitleChange: (v: string) => void;
  twitterDescription: string;
  onTwitterDescriptionChange: (v: string) => void;
  twitterImage: string;
  onTwitterImageChange: (v: string) => void;
  onSave: () => Promise<void>;
}

export function SeoMetaboxSocialTab({
  postTitle,
  seoTitle,
  seoDescription,
  url,
  ogTitle,
  onOgTitleChange,
  ogDescription,
  onOgDescriptionChange,
  ogImage,
  onOgImageChange,
  twitterTitle,
  onTwitterTitleChange,
  twitterDescription,
  onTwitterDescriptionChange,
  twitterImage,
  onTwitterImageChange,
  onSave,
}: SeoMetaboxSocialTabProps) {
  const effectiveOgTitle = ogTitle || seoTitle || postTitle;
  const effectiveOgDescription = ogDescription || seoDescription;
  const effectiveTwitterTitle = twitterTitle || effectiveOgTitle;
  const effectiveTwitterDescription = twitterDescription || effectiveOgDescription;

  return (
    <div className="space-y-6">
      {/* Facebook / Open Graph */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-foreground">Facebook / Open Graph</h4>

        <FacebookPreview
          title={effectiveOgTitle}
          description={effectiveOgDescription}
          image={ogImage || null}
          url={url}
        />

        <div className="space-y-1">
          <Label className="text-xs font-medium">OG Title</Label>
          <Input
            value={ogTitle}
            onChange={(e) => onOgTitleChange(e.target.value)}
            onBlur={onSave}
            placeholder={seoTitle || postTitle || "Uses SEO title"}
            className="h-7 text-xs"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs font-medium">OG Description</Label>
          <textarea
            value={ogDescription}
            onChange={(e) => onOgDescriptionChange(e.target.value)}
            onBlur={onSave}
            placeholder={seoDescription || "Uses meta description"}
            className={cn(
              "w-full min-h-[48px] resize-y bg-transparent",
              "border border-border px-2.5 py-1.5 text-xs",
              "rounded-none outline-hidden",
              "placeholder:text-muted-foreground",
              "focus:border-ring focus:ring-1 focus:ring-ring/50",
            )}
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs font-medium">OG Image URL</Label>
          <Input
            value={ogImage}
            onChange={(e) => onOgImageChange(e.target.value)}
            onBlur={onSave}
            placeholder="https://... (1200x630 recommended)"
            className="h-7 text-xs"
          />
          {!ogImage && (
            <p className="text-[10px] text-muted-foreground">
              Falls back to featured image, then default OG image from SEO settings.
            </p>
          )}
        </div>
      </div>

      {/* Twitter Card */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-foreground">Twitter Card</h4>

        <TwitterPreview
          title={effectiveTwitterTitle}
          description={effectiveTwitterDescription}
          image={twitterImage || ogImage || null}
          url={url}
        />

        <div className="space-y-1">
          <Label className="text-xs font-medium">Twitter Title</Label>
          <Input
            value={twitterTitle}
            onChange={(e) => onTwitterTitleChange(e.target.value)}
            onBlur={onSave}
            placeholder={ogTitle || seoTitle || "Uses OG title"}
            className="h-7 text-xs"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs font-medium">Twitter Description</Label>
          <textarea
            value={twitterDescription}
            onChange={(e) => onTwitterDescriptionChange(e.target.value)}
            onBlur={onSave}
            placeholder={ogDescription || seoDescription || "Uses OG description"}
            className={cn(
              "w-full min-h-[48px] resize-y bg-transparent",
              "border border-border px-2.5 py-1.5 text-xs",
              "rounded-none outline-hidden",
              "placeholder:text-muted-foreground",
              "focus:border-ring focus:ring-1 focus:ring-ring/50",
            )}
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs font-medium">Twitter Image URL</Label>
          <Input
            value={twitterImage}
            onChange={(e) => onTwitterImageChange(e.target.value)}
            onBlur={onSave}
            placeholder="https://... (falls back to OG image)"
            className="h-7 text-xs"
          />
        </div>
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={onSave}
        className="text-xs h-7"
      >
        Save Social Data
      </Button>
    </div>
  );
}
