/**
 * SeoMetabox - 4-tab SEO panel for post/page editor.
 *
 * Tabs: SEO, Readability, Schema, Social.
 * Integrates into the editor layout as a collapsible metabox.
 */

import { useState, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { SEO_METABOX_TABS } from "@/lib/seo/constants";
import { SeoScoreBadge } from "./SeoScoreBadge";
import { SeoMetaboxSeoTab } from "./SeoMetaboxSeoTab";
import { SeoMetaboxReadabilityTab } from "./SeoMetaboxReadabilityTab";
import { SeoMetaboxSchemaTab } from "./SeoMetaboxSchemaTab";
import { SeoMetaboxSocialTab } from "./SeoMetaboxSocialTab";
import { usePostSeo } from "@/hooks/seo/usePostSeo";
import { useSeoMutations } from "@/hooks/seo/useSeoMutations";
import { useSeoAnalysis } from "@/hooks/seo/useSeoAnalysis";
import { useReadabilityAnalysis } from "@/hooks/seo/useReadabilityAnalysis";
import type { Id } from "@backend/convex/_generated/dataModel";
import type { SeoMetaboxTab } from "@/lib/seo/types";

interface SeoMetaboxProps {
  postId: Id<"posts">;
  contentType: "post" | "page";
  postTitle: string;
  postSlug: string;
  postContent: string;
  postExcerpt: string;
  siteUrl?: string;
}

export function SeoMetabox({
  postId,
  contentType,
  postTitle,
  postSlug,
  postContent,
  postExcerpt,
  siteUrl = "",
}: SeoMetaboxProps) {
  const [activeTab, setActiveTab] = useState<SeoMetaboxTab>("seo");

  // Fetch existing SEO data
  const postSeo = usePostSeo(postId);
  const { updatePostSeo } = useSeoMutations();

  // Local state for editable fields
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
  const [schemaType, setSchemaType] = useState("");
  const [schemaArticleType, setSchemaArticleType] = useState("");

  // Sync from server data
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
      setSchemaType(postSeo.schemaType ?? "");
      setSchemaArticleType(postSeo.schemaArticleType ?? "");
    }
  }, [postSeo]);

  // Analysis hooks
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

  // Save handler (debounced save on field blur or explicit save)
  const handleSave = useCallback(async () => {
    try {
      await updatePostSeo({
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
        schemaType: schemaType || undefined,
        schemaArticleType: schemaArticleType || undefined,
        seoScore: seoAnalysis?.score,
        readabilityScore: readabilityAnalysis?.score,
      });
    } catch {
      // Error toast already handled by useSeoMutations
    }
  }, [
    postId, seoTitle, seoDescription, focusKeyphrase, canonical,
    noindex, nofollow, cornerstone, ogTitle, ogDescription, ogImage,
    twitterTitle, twitterDescription, twitterImage, schemaType,
    schemaArticleType, seoAnalysis?.score, readabilityAnalysis?.score,
    updatePostSeo,
  ]);

  const url =
    contentType === "post"
      ? `${siteUrl}/blog/${postSlug || "..."}`
      : `${siteUrl}/${postSlug || "..."}`;

  return (
    <div className="border border-border rounded-none">
      {/* Header with score badges */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
        <span className="text-xs font-semibold text-foreground">SEO</span>
        <div className="flex items-center gap-3">
          <SeoScoreBadge
            score={seoAnalysis?.score ?? postSeo?.seoScore ?? null}
            size="sm"
            showLabel={false}
          />
          <SeoScoreBadge
            score={readabilityAnalysis?.score ?? postSeo?.readabilityScore ?? null}
            label="Readability"
            size="sm"
            showLabel={false}
          />
        </div>
      </div>

      {/* Tab buttons */}
      <div className="flex border-b border-border">
        {SEO_METABOX_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex-1 px-2 py-1.5 text-xs font-medium transition-colors",
              activeTab === tab.id
                ? "text-foreground border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="p-3">
        {activeTab === "seo" && (
          <SeoMetaboxSeoTab
            postTitle={postTitle}
            postSlug={postSlug}
            url={url}
            seoTitle={seoTitle}
            onSeoTitleChange={setSeoTitle}
            seoDescription={seoDescription}
            onSeoDescriptionChange={setSeoDescription}
            focusKeyphrase={focusKeyphrase}
            onFocusKeyphraseChange={setFocusKeyphrase}
            canonical={canonical}
            onCanonicalChange={setCanonical}
            noindex={noindex}
            onNoindexChange={setNoindex}
            nofollow={nofollow}
            onNofollowChange={setNofollow}
            cornerstone={cornerstone}
            onCornerstoneChange={setCornerstone}
            contentType={contentType}
            analysisResult={seoAnalysis}
            onSave={handleSave}
          />
        )}
        {activeTab === "readability" && (
          <SeoMetaboxReadabilityTab
            analysisResult={readabilityAnalysis}
          />
        )}
        {activeTab === "schema" && (
          <SeoMetaboxSchemaTab
            contentType={contentType}
            schemaType={schemaType}
            onSchemaTypeChange={setSchemaType}
            schemaArticleType={schemaArticleType}
            onSchemaArticleTypeChange={setSchemaArticleType}
            onSave={handleSave}
          />
        )}
        {activeTab === "social" && (
          <SeoMetaboxSocialTab
            postTitle={postTitle}
            seoTitle={seoTitle}
            seoDescription={seoDescription}
            url={url}
            ogTitle={ogTitle}
            onOgTitleChange={setOgTitle}
            ogDescription={ogDescription}
            onOgDescriptionChange={setOgDescription}
            ogImage={ogImage}
            onOgImageChange={setOgImage}
            twitterTitle={twitterTitle}
            onTwitterTitleChange={setTwitterTitle}
            twitterDescription={twitterDescription}
            onTwitterDescriptionChange={setTwitterDescription}
            twitterImage={twitterImage}
            onTwitterImageChange={setTwitterImage}
            onSave={handleSave}
          />
        )}
      </div>
    </div>
  );
}
