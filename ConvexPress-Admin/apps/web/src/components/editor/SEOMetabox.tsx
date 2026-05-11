// DEPRECATED: This file is unused. SEO metabox functionality has been moved elsewhere.

/**
 * SEOMetabox - SEO metadata fields
 *
 * Provides SEO title override, meta description (max 160 chars), noindex
 * checkbox, and a Google search result preview card.
 */

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { EditorContentType } from "@/types/editor";

interface SEOMetaboxProps {
  postId?: string;
  contentType: EditorContentType;
  postTitle: string;
  postSlug: string;
  seoTitle: string;
  seoDescription: string;
  noindex: boolean;
  onSeoTitleChange: (value: string) => void;
  onSeoDescriptionChange: (value: string) => void;
  onNoindexChange: (value: boolean) => void;
}

// TODO: Replace with actual site URL from Settings System
const SITE_URL = "https://example.com";

export function SEOMetabox({
  postId,
  contentType,
  postTitle,
  postSlug,
  seoTitle,
  seoDescription,
  noindex,
  onSeoTitleChange,
  onSeoDescriptionChange,
  onNoindexChange,
}: SEOMetaboxProps) {
  const displayTitle = seoTitle || postTitle || "Untitled";
  const displayUrl =
    contentType === "post"
      ? `${SITE_URL}/blog/${postSlug || "..."}`
      : `${SITE_URL}/${postSlug || "..."}`;
  const displayDescription =
    seoDescription || "No meta description set. Search engines will use an excerpt from the page content.";

  return (
    <div className="space-y-3">
      {/* Google search result preview */}
      <div className="border border-border rounded-none p-3 bg-muted/30">
        <p className="text-xs text-muted-foreground mb-1">Search Preview</p>
        <div className="space-y-0.5">
          <p
            className="text-sm text-primary truncate"
            title={displayTitle}
          >
            {displayTitle}
          </p>
          <p className="text-xs text-primary/70 truncate">{displayUrl}</p>
          <p className="text-xs text-muted-foreground line-clamp-2">
            {displayDescription}
          </p>
        </div>
      </div>

      {/* SEO Title */}
      <div className="space-y-1">
        <Label className="text-xs font-medium">SEO Title</Label>
        <Input
          value={seoTitle}
          onChange={(e) => onSeoTitleChange(e.target.value)}
          placeholder={postTitle || "Enter SEO title"}
          maxLength={70}
          className="h-7 text-xs"
        />
        <p className="text-xs text-muted-foreground">
          {seoTitle.length}/70 characters
        </p>
      </div>

      {/* Meta Description */}
      <div className="space-y-1">
        <Label className="text-xs font-medium">Meta Description</Label>
        <textarea
          value={seoDescription}
          onChange={(e) => onSeoDescriptionChange(e.target.value)}
          placeholder="Enter meta description"
          maxLength={160}
          className={cn(
            "w-full min-h-[60px] resize-y bg-transparent",
            "border border-border px-2.5 py-1.5 text-xs",
            "rounded-none outline-hidden",
            "placeholder:text-muted-foreground",
            "focus:border-ring focus:ring-1 focus:ring-ring/50",
          )}
        />
        <p className="text-xs text-muted-foreground">
          {seoDescription.length}/160 characters
        </p>
      </div>

      {/* Noindex checkbox */}
      <div className="flex items-center gap-2">
        <Checkbox
          checked={noindex}
          onCheckedChange={(checked) => {
            onNoindexChange(!!checked);
          }}
        />
        <Label className="cursor-pointer text-xs font-normal">
          Discourage search engines from indexing this{" "}
          {contentType === "post" ? "post" : "page"}
        </Label>
      </div>
    </div>
  );
}
