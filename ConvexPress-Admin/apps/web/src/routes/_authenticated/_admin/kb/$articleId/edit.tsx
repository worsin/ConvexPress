/**
 * KB Article Editor - /admin/kb/$articleId/edit
 *
 * Full article editor: title, content, excerpt, slug, category, SEO fields.
 * Publish / Unpublish actions.
 * Wired to api.kb.queries.getById, api.kb.mutations.update, api.kb.mutations.publish
 */

import { useState, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { RoutePermissionGuard } from "@/lib/route-permission-guard";
import { toast } from "sonner";
import { Save, Globe, EyeOff, ArrowLeft, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_admin/kb/$articleId/edit")({
  component: EditKBArticlePage,
});

function EditKBArticlePage() {
  const { articleId } = Route.useParams();
  return (
    <RoutePermissionGuard requiredAccess="/admin/kb">
      <ArticleEditor articleId={articleId} />
    </RoutePermissionGuard>
  );
}

// Local type matching the shape returned by api.kb.queries.getById
type KBArticle = {
  _id: Id<"kb_articles">;
  title: string;
  content?: string;
  excerpt?: string;
  slug: string;
  status: "draft" | "review" | "published" | "archived";
  categoryId?: Id<"kb_categories">;
  metaTitle?: string;
  metaDescription?: string;
  keywords?: string[];
  readingTimeMinutes?: number;
  viewCount: number;
  version: number;
  publishedAt?: number;
  updatedAt: number;
};

function ArticleEditor({ articleId }: { articleId: string }) {
  const article = useQuery(api.kb.queries.getById, { articleId: articleId as Id<"kb_articles"> });
  const categories = useQuery(api.kb.categories.list) ?? [];
  const updateArticle = useMutation(api.kb.mutations.update);
  const publishArticle = useMutation(api.kb.mutations.publish);
  const unpublishArticle = useMutation(api.kb.mutations.unpublish);

  // Form state
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [slug, setSlug] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [keywords, setKeywords] = useState("");

  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const art = article as KBArticle | null | undefined;

  // Populate form when article loads
  useEffect(() => {
    if (!art) return;
    setTitle(art.title ?? "");
    setContent(art.content ?? "");
    setExcerpt(art.excerpt ?? "");
    setSlug(art.slug ?? "");
    setCategoryId(art.categoryId ?? "");
    setMetaTitle(art.metaTitle ?? "");
    setMetaDescription(art.metaDescription ?? "");
    setKeywords((art.keywords ?? []).join(", "));
    setIsDirty(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [art?._id]);

  function markDirty() {
    setIsDirty(true);
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      const kwArray = keywords
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);
      await updateArticle({
        articleId: articleId as Id<"kb_articles">,
        title: title.trim(),
        content: content || undefined,
        excerpt: excerpt || undefined,
        categoryId: (categoryId as Id<"kb_categories">) || undefined,
        metaTitle: metaTitle || undefined,
        metaDescription: metaDescription || undefined,
        keywords: kwArray.length > 0 ? kwArray : undefined,
      });
      toast.success("Article saved");
      setIsDirty(false);
    } catch (err: unknown) {
      toast.error((err as { data?: { message?: string } })?.data?.message ?? "Failed to save article");
    } finally {
      setIsSaving(false);
    }
  }

  async function handlePublish() {
    setIsPublishing(true);
    try {
      // Save first
      const kwArray = keywords.split(",").map((k) => k.trim()).filter(Boolean);
      await updateArticle({
        articleId: articleId as Id<"kb_articles">,
        title: title.trim(),
        content: content || undefined,
        excerpt: excerpt || undefined,
        categoryId: (categoryId as Id<"kb_categories">) || undefined,
        metaTitle: metaTitle || undefined,
        metaDescription: metaDescription || undefined,
        keywords: kwArray.length > 0 ? kwArray : undefined,
      });
      await publishArticle({ articleId: articleId as Id<"kb_articles"> });
      toast.success("Article published");
      setIsDirty(false);
    } catch (err: unknown) {
      toast.error((err as { data?: { message?: string } })?.data?.message ?? "Failed to publish article");
    } finally {
      setIsPublishing(false);
    }
  }

  async function handleUnpublish() {
    setIsPublishing(true);
    try {
      await unpublishArticle({ articleId: articleId as Id<"kb_articles"> });
      toast.success("Article reverted to draft");
    } catch (err: unknown) {
      toast.error((err as { data?: { message?: string } })?.data?.message ?? "Failed to unpublish article");
    } finally {
      setIsPublishing(false);
    }
  }

  if (article === undefined) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (article === null) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground mb-4">Article not found.</p>
        <Link to="/admin/kb" className="text-primary hover:underline text-sm">
          ← Back to Articles
        </Link>
      </div>
    );
  }

  // At this point article is guaranteed non-null/undefined
  const isPublished = art!.status === "published";

  return (
    <div className="space-y-5">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to="/admin/kb"
            aria-label="Back to articles"
            className="text-foreground/50 hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-xl font-bold truncate max-w-md">{art?.title || "Untitled Article"}</h1>
          <span
            className={[
              "text-xs px-2 py-0.5 rounded-full border",
              isPublished
                ? "border-success/30 bg-success/10 text-success"
                : art?.status === "review"
                ? "border-warning/30 bg-warning/10 text-warning"
                : "border-border bg-muted text-foreground/50",
            ].join(" ")}
          >
            {art?.status ?? "draft"}
          </span>
          {isDirty && (
            <span className="text-xs text-foreground/40">Unsaved changes</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => void handleSave()}
            disabled={isSaving || !isDirty}
            className="flex items-center gap-2 px-3 py-1.5 text-sm border border-border rounded-md hover:bg-muted transition-colors disabled:opacity-40"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </button>

          {isPublished ? (
            <button
              onClick={() => void handleUnpublish()}
              disabled={isPublishing}
              className="flex items-center gap-2 px-3 py-1.5 text-sm border border-border rounded-md hover:bg-muted transition-colors disabled:opacity-40"
            >
              {isPublishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <EyeOff className="h-4 w-4" />}
              Unpublish
            </button>
          ) : (
            <button
              onClick={() => void handlePublish()}
              disabled={isPublishing}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 transition-colors disabled:opacity-40"
            >
              {isPublishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
              Publish
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-5">
        {/* Main editing area */}
        <div className="col-span-2 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-foreground/60 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => { setTitle(e.target.value); markDirty(); }}
              placeholder="Article title"
              className="w-full px-3 py-2 text-base font-medium border border-border rounded-md bg-card focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Content */}
          <div>
            <label className="block text-xs font-medium text-foreground/60 mb-1">Content</label>
            <textarea
              value={content}
              onChange={(e) => { setContent(e.target.value); markDirty(); }}
              placeholder="Write article content here…"
              rows={16}
              className="w-full px-3 py-2 text-sm border border-border rounded-md bg-card resize-y focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono"
            />
          </div>

          {/* Excerpt */}
          <div>
            <label className="block text-xs font-medium text-foreground/60 mb-1">Excerpt</label>
            <textarea
              value={excerpt}
              onChange={(e) => { setExcerpt(e.target.value); markDirty(); }}
              placeholder="Short summary of the article"
              rows={3}
              className="w-full px-3 py-2 text-sm border border-border rounded-md bg-card resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Article Details */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <h3 className="text-xs font-semibold text-foreground/60 uppercase tracking-wider">
              Article Details
            </h3>

            <div>
              <label className="block text-xs font-medium text-foreground/70 mb-1">Slug</label>
              <input
                type="text"
                value={slug}
                readOnly
                className="w-full px-2 py-1.5 text-xs border border-border rounded-md bg-muted text-foreground/60 font-mono"
              />
              <p className="text-xs text-foreground/40 mt-0.5">Auto-generated from title</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-foreground/70 mb-1">Category</label>
              <select
                value={categoryId}
                onChange={(e) => { setCategoryId(e.target.value); markDirty(); }}
                className="w-full px-2 py-1.5 text-sm border border-border rounded-md bg-background"
              >
                <option value="">— Uncategorized —</option>
                {categories.map((cat) => (
                  <option key={cat._id} value={cat._id}>{cat.name}</option>
                ))}
              </select>
            </div>

            {art?.readingTimeMinutes && (
              <div className="text-xs text-foreground/50">
                Reading time: ~{art.readingTimeMinutes} min
              </div>
            )}
          </div>

          {/* SEO */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <h3 className="text-xs font-semibold text-foreground/60 uppercase tracking-wider">SEO</h3>

            <div>
              <label className="block text-xs font-medium text-foreground/70 mb-1">Meta Title</label>
              <input
                type="text"
                value={metaTitle}
                onChange={(e) => { setMetaTitle(e.target.value); markDirty(); }}
                placeholder="SEO title override"
                className="w-full px-2 py-1.5 text-sm border border-border rounded-md bg-background"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-foreground/70 mb-1">Meta Description</label>
              <textarea
                value={metaDescription}
                onChange={(e) => { setMetaDescription(e.target.value); markDirty(); }}
                placeholder="SEO description"
                rows={3}
                className="w-full px-2 py-1.5 text-sm border border-border rounded-md bg-background resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-foreground/70 mb-1">
                Keywords
                <span className="ml-1 text-foreground/40 font-normal">(comma-separated)</span>
              </label>
              <input
                type="text"
                value={keywords}
                onChange={(e) => { setKeywords(e.target.value); markDirty(); }}
                placeholder="keyword1, keyword2"
                className="w-full px-2 py-1.5 text-sm border border-border rounded-md bg-background"
              />
            </div>
          </div>

          {/* Article Info */}
          {art && (
            <div className="rounded-lg border border-border bg-card p-4 space-y-1.5 text-xs text-foreground/50">
              <div className="flex justify-between">
                <span>Version</span>
                <span>{art.version}</span>
              </div>
              <div className="flex justify-between">
                <span>Views</span>
                <span>{art.viewCount}</span>
              </div>
              {art.publishedAt && (
                <div className="flex justify-between">
                  <span>Published</span>
                  <span>{new Date(art.publishedAt).toLocaleDateString()}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Updated</span>
                <span>{new Date(art.updatedAt).toLocaleDateString()}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
