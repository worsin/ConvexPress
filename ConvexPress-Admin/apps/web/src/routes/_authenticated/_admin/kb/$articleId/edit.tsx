import { KBInheritedCategoryAccess } from "@/components/kb/KBInheritedCategoryAccess";
import { KBAudienceInput } from "@/components/kb/KBAudienceInput";
import { KbEditor } from "@/components/kb/editor/KbEditor";
import { KBHelpSpotsInput } from "@/components/kb/KBHelpSpotsInput";
/**
 * KB Article Editor - /admin/kb/$articleId/edit
 *
 * Title and body (KbEditor), excerpt, address, category and position,
 * visibility and audiences, SEO fields, version history with restore, and
 * Publish / Unpublish.
 *
 * The form loads an article once. Later reactive updates never overwrite what
 * the author is typing: a change someone else saves shows a notice instead,
 * and loads only when asked (or at once when there is nothing unsaved).
 */

import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, ErrorComponent } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { RoutePermissionGuard } from "@/lib/route-permission-guard";
import { toast } from "sonner";
import { Save, Globe, EyeOff, ArrowLeft, Loader2, History, RotateCcw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_admin/kb/$articleId/edit")({
  component: EditKBArticlePage,
  errorComponent: ErrorComponent,
});

function EditKBArticlePage() {
  const { articleId } = Route.useParams();
  return (
    <RoutePermissionGuard requiredAccess="/admin/kb">
      <ArticleEditor key={articleId} articleId={articleId as Id<"kb_articles">} />
    </RoutePermissionGuard>
  );
}

type Form = {
  title: string;
  excerpt: string;
  slug: string;
  categoryId: string;
  position: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string;
  visibility: "public" | "internal";
  audiences: string[];
  helpContexts: string[];
};

const inputClass = "w-full px-2 py-1.5 text-sm border border-border rounded-md bg-background focus:outline-hidden focus:ring-2 focus:ring-primary/30";
const labelClass = "block text-xs font-medium text-foreground/70 mb-1";

function errorMessage(err: unknown, fallback: string) {
  return (err as { data?: { message?: string } })?.data?.message ?? fallback;
}

function ArticleEditor({ articleId }: { articleId: Id<"kb_articles"> }) {
  const article = useQuery(api.kb.queries.getById, { articleId });
  const versions = useQuery(api.kb.queries.getVersions, { articleId });
  const helpSpots = useQuery(api.kb.helpContexts.forArticle, { articleId });
  const categories = useQuery(api.kb.categories.list) ?? [];
  const updateArticle = useMutation(api.kb.mutations.update);
  const publishArticle = useMutation(api.kb.mutations.publish);
  const unpublishArticle = useMutation(api.kb.mutations.unpublish);
  const markReviewed = useMutation(api.kb.mutations.markReviewed);
  const updateReview = useMutation(api.kb.mutations.update);

  const [form, setForm] = useState<Form | null>(null);
  const contentRef = useRef("");
  const [contentChanged, setContentChanged] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const [changeSummary, setChangeSummary] = useState("");
  const [baseline, setBaseline] = useState<number | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const ownSave = useRef(false);

  function load(source: NonNullable<typeof article>, spots: string[]) {
    setForm({
      title: source.title,
      excerpt: source.excerpt ?? "",
      slug: source.slug,
      categoryId: source.categoryId ?? "",
      position: String(source.sortOrder ?? 0),
      metaTitle: source.metaTitle ?? "",
      metaDescription: source.metaDescription ?? "",
      keywords: (source.keywords ?? []).join(", "),
      visibility: source.visibility,
      audiences: source.audiences,
      helpContexts: spots,
    });
    contentRef.current = source.content;
    setContentChanged(false);
    setEditorKey((key) => key + 1);
    setBaseline(source.updatedAt);
    setIsDirty(false);
  }

  const spotKeys = helpSpots?.map((spot) => spot.key);
  useEffect(() => {
    if (!article || !spotKeys) return;
    if (baseline === null) return load(article, spotKeys);
    if (article.updatedAt === baseline) return;
    // Our own save came back: it becomes the baseline without reloading the form.
    if (ownSave.current) {
      ownSave.current = false;
      setBaseline(article.updatedAt);
      return;
    }
    // Someone else saved. Nothing unsaved here: take their version.
    if (!isDirty) load(article, spotKeys);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load is stable in effect; only article changes matter
  }, [article, helpSpots === undefined]);

  const changedElsewhere = article && baseline !== null && article.updatedAt !== baseline && isDirty;

  function edit<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
    setIsDirty(true);
  }

  /** The form as an update, or null (with a message) when something can't be saved. */
  function articleUpdate() {
    if (!form || !article) return null;
    const sortOrder = Number(form.position);
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 9999) {
      toast.error("Position in category must be a whole number from 0 to 9,999.");
      return null;
    }
    if (!form.title.trim()) {
      toast.error("An article needs a title.");
      return null;
    }
    const keywords = form.keywords.split(",").map((k) => k.trim()).filter(Boolean);
    return {
      articleId,
      title: form.title.trim(),
      ...(contentChanged ? { content: contentRef.current } : {}),
      ...(form.slug.trim() && form.slug.trim() !== article.slug ? { slug: form.slug.trim() } : {}),
      excerpt: form.excerpt.trim() || undefined,
      categoryId: (form.categoryId as Id<"kb_categories">) || undefined,
      sortOrder,
      metaTitle: form.metaTitle || undefined,
      metaDescription: form.metaDescription || undefined,
      keywords,
      visibility: form.visibility,
      audiences: form.audiences,
      helpContexts: form.helpContexts,
      ...(changeSummary.trim() ? { changeSummary: changeSummary.trim() } : {}),
    };
  }

  async function save(): Promise<boolean> {
    const update = articleUpdate();
    if (!update) return false;
    ownSave.current = true;
    try {
      await updateArticle(update);
      setIsDirty(false);
      setContentChanged(false);
      setChangeSummary("");
      return true;
    } catch (err) {
      ownSave.current = false;
      toast.error(errorMessage(err, "Failed to save article"));
      return false;
    }
  }

  async function handleSave() {
    setIsSaving(true);
    if (await save()) toast.success("Article saved");
    setIsSaving(false);
  }

  async function handlePublish() {
    setIsPublishing(true);
    try {
      if (isDirty && !(await save())) return;
      ownSave.current = true;
      await publishArticle({ articleId });
      toast.success("Article published");
    } catch (err) {
      ownSave.current = false;
      toast.error(errorMessage(err, "Failed to publish article"));
    } finally {
      setIsPublishing(false);
    }
  }

  async function handleUnpublish() {
    setIsPublishing(true);
    try {
      ownSave.current = true;
      await unpublishArticle({ articleId });
      toast.success("Article reverted to draft");
    } catch (err) {
      ownSave.current = false;
      toast.error(errorMessage(err, "Failed to unpublish article"));
    } finally {
      setIsPublishing(false);
    }
  }

  function restore(version: NonNullable<typeof versions>[number]) {
    contentRef.current = version.content;
    setContentChanged(true);
    setEditorKey((key) => key + 1);
    edit("title", version.title);
    setChangeSummary(`Restored version ${version.version}`);
    toast.message(`Version ${version.version} is in the editor. Save to keep it.`);
  }

  // Warn before leaving with unsaved work.
  useEffect(() => {
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  if (article === undefined || helpSpots === undefined || (article && !form)) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (article === null || !form) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground mb-4">Article not found.</p>
        <Link to="/kb" className="text-primary hover:underline text-sm">
          ← Back to Articles
        </Link>
      </div>
    );
  }

  const isPublished = article.status === "published";
  const slugChanged = form.slug.trim() !== "" && form.slug.trim() !== article.slug;

  return (
    <div className="space-y-5">
      {article.hasInheritedCategoryAccess && <KBInheritedCategoryAccess articleId={articleId} />}
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/kb" aria-label="Back to articles" className="text-foreground/50 hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-xl font-bold truncate max-w-md">{form.title || "Untitled Article"}</h1>
          <span
            className={[
              "text-xs px-2 py-0.5 rounded-full border",
              isPublished
                ? "border-success/30 bg-success/10 text-success"
                : article.status === "review"
                ? "border-warning/30 bg-warning/10 text-warning"
                : "border-border bg-muted text-foreground/50",
            ].join(" ")}
          >
            {article.status}
          </span>
          {article.visibility === "internal" && (
            <span className="text-xs px-2 py-0.5 rounded-full border border-primary/30 bg-primary/10 text-primary">Internal</span>
          )}
          {isDirty && <span className="text-xs text-foreground/40">Unsaved changes</span>}
        </div>

        <div className="flex items-center gap-2">
          <input
            aria-label="Note for this save"
            value={changeSummary}
            onChange={(e) => setChangeSummary(e.target.value)}
            placeholder="What changed? (optional)"
            className="hidden lg:block w-52 px-2 py-1.5 text-xs border border-border rounded-md bg-background"
          />
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

      {changedElsewhere && (
        <div role="alert" className="flex items-center justify-between gap-4 rounded-lg border border-warning/40 bg-warning/10 px-4 py-2.5 text-sm">
          <span>Someone else saved this article while you were editing. Saving now replaces their changes with yours.</span>
          <button type="button" onClick={() => load(article, spotKeys ?? form.helpContexts)} className="shrink-0 rounded-md border border-border bg-card px-3 py-1 text-xs hover:bg-muted">
            Load their version
          </button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-5">
        {/* Main editing area */}
        <div className="col-span-2 space-y-4">
          <div>
            <label className="block text-xs font-medium text-foreground/60 mb-1" htmlFor="kb-title">Title</label>
            <input
              id="kb-title"
              type="text"
              value={form.title}
              onChange={(e) => edit("title", e.target.value)}
              placeholder="Article title"
              className="w-full px-3 py-2 text-base font-medium border border-border rounded-md bg-card focus:outline-hidden focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <KbEditor
            key={editorKey}
            initialContent={contentRef.current}
            currentArticleId={articleId}
            onChange={(json) => {
              contentRef.current = json;
              setContentChanged(true);
              setIsDirty(true);
            }}
          />

          <div>
            <label className="block text-xs font-medium text-foreground/60 mb-1" htmlFor="kb-excerpt">Excerpt</label>
            <textarea
              id="kb-excerpt"
              value={form.excerpt}
              onChange={(e) => edit("excerpt", e.target.value)}
              placeholder="Leave empty to use the opening of the article"
              rows={3}
              className="w-full px-3 py-2 text-sm border border-border rounded-md bg-card resize-none focus:outline-hidden focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <h3 className="text-xs font-semibold text-foreground/60 uppercase tracking-wider">Article Details</h3>

            <div>
              <label className={labelClass} htmlFor="kb-slug">Address</label>
              <input id="kb-slug" type="text" value={form.slug} onChange={(e) => edit("slug", e.target.value)} className={`${inputClass} font-mono text-xs`} />
              <p className="text-xs text-foreground/40 mt-0.5">
                {slugChanged && isPublished
                  ? "The old address will keep working and send readers here."
                  : isPublished
                  ? "Published articles keep their address when retitled."
                  : "Follows the title until the article is published."}
              </p>
            </div>

            <div>
              <label className={labelClass} htmlFor="kb-category">Category</label>
              <select id="kb-category" value={form.categoryId} onChange={(e) => edit("categoryId", e.target.value)} className={inputClass}>
                <option value="">— Uncategorized —</option>
                {categories.map((cat) => (
                  <option key={cat._id} value={cat._id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="kb-position" className={labelClass}>Position in category</label>
              <input id="kb-position" type="number" min={0} max={9999} step={1} value={form.position} onChange={(e) => edit("position", e.target.value)} className={inputClass} />
              <p className="text-xs text-foreground/40 mt-0.5">The category page lists lower numbers first; equal numbers list the oldest article first.</p>
            </div>

            <div className="text-xs text-foreground/50">Reading time: ~{article.readingTimeMinutes} min</div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <h3 className="text-xs font-semibold text-foreground/60 uppercase tracking-wider">Visibility</h3>
            <div>
              <label htmlFor="kb-visibility" className={labelClass}>Visibility</label>
              <select id="kb-visibility" value={form.visibility} onChange={(e) => edit("visibility", e.target.value === "internal" ? "internal" : "public")} className={inputClass}>
                <option value="public">Public</option>
                <option value="internal">Internal</option>
              </select>
              <p className="text-xs text-foreground/40 mt-0.5">
                {form.visibility === "internal"
                  ? "Internal articles never appear on the website; only trusted integrations can read them."
                  : "Public articles appear on the website once published."}
              </p>
            </div>
            <div>
              <label className={labelClass}>
                Audiences
                <span className="ml-1 text-foreground/40 font-normal">(optional)</span>
              </label>
              <KBAudienceInput audiences={form.audiences} onChange={(next) => edit("audiences", next)} />
              <p className="text-xs text-foreground/40 mt-1">Labels for integrations, such as staff or doctor.</p>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 space-y-2">
            <h3 className="text-xs font-semibold text-foreground/60 uppercase tracking-wider">Review</h3>
            <div className="flex items-center justify-between text-xs">
              <span className="text-foreground/60">Owner</span>
              <span>{article.owner?.displayName ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-xs">
              <label htmlFor="kb-review-interval" className="text-foreground/60">Review every</label>
              <select
                id="kb-review-interval"
                value={String(article.reviewIntervalDays ?? "")}
                onChange={(e) => {
                  ownSave.current = !isDirty;
                  void updateReview({ articleId, reviewIntervalDays: e.target.value ? Number(e.target.value) : null }).catch((err: unknown) => toast.error(errorMessage(err, "Couldn't change the review interval")));
                }}
                className="rounded-md border border-border bg-background px-1.5 py-0.5"
              >
                <option value="">Site default (6 months)</option>
                <option value="30">Month</option>
                <option value="90">3 months</option>
                <option value="365">Year</option>
              </select>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-foreground/60">Next review</span>
              <span className={article.reviewDueAt < Date.now() ? "font-medium text-warning" : ""}>
                {new Date(article.reviewDueAt).toLocaleDateString()}
                {article.reviewDueAt < Date.now() ? " · overdue" : ""}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                ownSave.current = !isDirty;
                void markReviewed({ articleId }).then(() => toast.success("Marked reviewed"), (err: unknown) => toast.error(errorMessage(err, "Couldn't mark it reviewed")));
              }}
              className="w-full rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
            >
              Still correct — mark reviewed
            </button>
            <p className="text-xs text-foreground/40">Saving a change to the text also counts as a review.</p>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 space-y-2">
            <h3 className="text-xs font-semibold text-foreground/60 uppercase tracking-wider">In-app help</h3>
            <KBHelpSpotsInput spots={form.helpContexts} onChange={(next) => edit("helpContexts", next)} />
            <p className="text-xs text-foreground/40">The “?” spots in your apps that list this article. Order and summaries are set on the In-app help page.</p>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <h3 className="text-xs font-semibold text-foreground/60 uppercase tracking-wider">SEO</h3>
            <div>
              <label className={labelClass} htmlFor="kb-meta-title">Meta Title</label>
              <input id="kb-meta-title" type="text" value={form.metaTitle} onChange={(e) => edit("metaTitle", e.target.value)} placeholder="SEO title override" className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="kb-meta-description">Meta Description</label>
              <textarea id="kb-meta-description" value={form.metaDescription} onChange={(e) => edit("metaDescription", e.target.value)} placeholder="SEO description" rows={3} className={`${inputClass} resize-none`} />
            </div>
            <div>
              <label className={labelClass} htmlFor="kb-keywords">
                Keywords
                <span className="ml-1 text-foreground/40 font-normal">(comma-separated)</span>
              </label>
              <input id="kb-keywords" type="text" value={form.keywords} onChange={(e) => edit("keywords", e.target.value)} placeholder="keyword1, keyword2" className={inputClass} />
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 space-y-2">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold text-foreground/60 uppercase tracking-wider">
              <History className="h-3.5 w-3.5" aria-hidden="true" /> History
            </h3>
            {versions === undefined ? (
              <p className="text-xs text-foreground/40">Loading…</p>
            ) : versions.length === 0 ? (
              <p className="text-xs text-foreground/40">Each save keeps the previous text here.</p>
            ) : (
              <ul className="max-h-64 space-y-1 overflow-y-auto">
                {versions.map((version) => (
                  <li key={version._id} className="flex items-start justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60">
                    <div className="min-w-0 text-xs">
                      <div className="font-medium">
                        Version {version.version}
                        <span className="ml-1 font-normal text-foreground/50">· {version.changeSummary}</span>
                      </div>
                      <div className="text-foreground/50">
                        {new Date(version.createdAt).toLocaleString()} {version.author ? `· ${version.author.displayName}` : ""}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => restore(version)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[11px] hover:bg-card"
                    >
                      <RotateCcw className="h-3 w-3" aria-hidden="true" /> Restore
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex justify-between border-t border-border pt-2 text-xs text-foreground/50">
              <span>Current version {article.version}</span>
              <span>{article.viewCount} views</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
