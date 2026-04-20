/**
 * New KB Article Route - /admin/kb/new
 *
 * Quick-create form: title, optional template, optional category.
 * On submit: creates article and navigates to the edit page.
 * Wired to api.kb.mutations.create, api.kb.templates.list, api.kb.categories.list
 */

import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { RoutePermissionGuard } from "@/lib/route-permission-guard";
import { toast } from "sonner";
import { PenLine, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_admin/kb/new")({
  component: NewKBArticlePage,
});

function NewKBArticlePage() {
  return (
    <RoutePermissionGuard requiredAccess="/admin/kb">
      <NewKBArticleForm />
    </RoutePermissionGuard>
  );
}

function NewKBArticleForm() {
  const navigate = useNavigate();
  const templates = (useQuery(api.kb.templates.list) ?? []) as Array<{
    _id: string;
    name: string;
    isDefault?: boolean;
    category?: string;
  }>;
  const categories = (useQuery(api.kb.categories.list) ?? []) as Array<{
    _id: string;
    name: string;
  }>;
  const createArticle = useMutation(api.kb.mutations.create);

  const [title, setTitle] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    setIsCreating(true);
    try {
      const articleId = await createArticle({
        title: title.trim(),
        templateId: (templateId as Id<"kb_templates">) || undefined,
        categoryId: (categoryId as Id<"kb_categories">) || undefined,
      });
      toast.success("Article created");
      void navigate({
        to: "/kb/$articleId/edit",
        params: { articleId: String(articleId) },
      });
    } catch (err: unknown) {
      toast.error((err as { data?: { message?: string } })?.data?.message ?? "Failed to create article");
      setIsCreating(false);
    }
  }

  return (
    <div className="max-w-xl">
      <div className="flex items-center gap-3 mb-6">
        <PenLine className="h-6 w-6 text-muted-foreground" />
        <h1 className="text-2xl font-bold">New Article</h1>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
        <div className="rounded-lg border border-border bg-card p-6 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1.5">
              Title <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Article title"
              autoFocus
              className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-hidden focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Template */}
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1.5">
              Start from template
              <span className="ml-1.5 text-xs text-foreground/40 font-normal">(optional)</span>
            </label>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border rounded-md bg-card"
            >
              <option value="">— Blank article —</option>
              {templates.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.name}
                  {t.isDefault ? " (default)" : ""}
                  {t.category ? ` · ${t.category}` : ""}
                </option>
              ))}
            </select>
            {templateId && (
              <p className="text-xs text-foreground/40 mt-1">
                Template content will be pre-filled in the editor.
              </p>
            )}
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1.5">
              Category
              <span className="ml-1.5 text-xs text-foreground/40 font-normal">(optional)</span>
            </label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border rounded-md bg-card"
            >
              <option value="">— Uncategorized —</option>
              {categories.map((cat) => (
                <option key={cat._id} value={cat._id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="submit"
          disabled={isCreating || !title.trim()}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isCreating ? (
            <>Creating…</>
          ) : (
            <>
              Create & Edit
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </form>
    </div>
  );
}
