/**
 * KB Templates Route - /admin/kb/templates
 *
 * Template management: list, create, update, delete.
 * Wired to api.kb.templates.*
 */

import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { RoutePermissionGuard } from "@/lib/route-permission-guard";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, X, Check, FileText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_admin/kb/templates")({
  component: KBTemplatesPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────

type FormState = {
  name: string;
  description: string;
  content: string;
  category: string;
  isDefault: boolean;
};

const EMPTY_FORM: FormState = {
  name: "",
  description: "",
  content: "",
  category: "",
  isDefault: false,
};

// ─── Page ─────────────────────────────────────────────────────────────────────

function KBTemplatesPage() {
  return (
    <RoutePermissionGuard requiredAccess="/admin/kb">
      <KBTemplatesContent />
    </RoutePermissionGuard>
  );
}

function KBTemplatesContent() {
  const templatesResult = useQuery(api.kb.templates.list);
  const templates = (templatesResult ?? []) as Array<{
    _id: string;
    name: string;
    description?: string;
    content?: string;
    category?: string;
    isDefault: boolean;
    isActive: boolean;
    usageCount?: number;
  }>;
  const createTemplate = useMutation(api.kb.templates.create);
  const updateTemplate = useMutation(api.kb.templates.update);
  const removeTemplate = useMutation(api.kb.templates.remove);

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function startEdit(t: (typeof templates)[0]) {
    setEditingId(t._id);
    setForm({
      name: t.name,
      description: t.description ?? "",
      content: t.content ?? "",
      category: t.category ?? "",
      isDefault: t.isDefault,
    });
    setShowCreate(false);
  }

  async function handleCreate() {
    if (!form.name.trim()) {
      toast.error("Template name is required");
      return;
    }
    setIsSaving(true);
    try {
      await createTemplate({
        name: form.name.trim(),
        description: form.description || undefined,
        content: form.content || undefined,
        category: form.category || undefined,
        isDefault: form.isDefault,
      });
      toast.success("Template created");
      setForm(EMPTY_FORM);
      setShowCreate(false);
    } catch (err: unknown) {
      toast.error((err as { data?: { message?: string } })?.data?.message ?? "Failed to create template");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleUpdate() {
    if (!editingId) return;
    setIsSaving(true);
    try {
      await updateTemplate({
        templateId: editingId as Id<"kb_templates">,
        name: form.name.trim(),
        description: form.description || undefined,
        content: form.content || undefined,
        category: form.category || undefined,
        isDefault: form.isDefault,
      });
      toast.success("Template updated");
      setEditingId(null);
      setForm(EMPTY_FORM);
    } catch (err: unknown) {
      toast.error((err as { data?: { message?: string } })?.data?.message ?? "Failed to update template");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(templateId: string) {
    try {
      await removeTemplate({ templateId: templateId as Id<"kb_templates"> });
      toast.success("Template deleted");
      setConfirmDelete(null);
    } catch (err: unknown) {
      toast.error((err as { data?: { message?: string } })?.data?.message ?? "Failed to delete template");
    }
  }

  const isFormOpen = showCreate || !!editingId;

  if (templatesResult === undefined) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-40 bg-muted rounded animate-pulse" />
        <div className="h-56 bg-muted rounded-lg animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">KB Templates</h1>
        <button
          onClick={() => { setShowCreate(true); setEditingId(null); setForm(EMPTY_FORM); }}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Template
        </button>
      </div>

      {/* Create / Edit Form */}
      {isFormOpen && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h2 className="text-sm font-semibold">
            {editingId ? "Edit Template" : "New Template"}
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground/70 mb-1">Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Template name"
                className="w-full px-3 py-1.5 text-sm border border-border rounded-md bg-background"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground/70 mb-1">Category</label>
              <input
                type="text"
                value={form.category}
                onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                placeholder="e.g. how-to, faq, reference"
                className="w-full px-3 py-1.5 text-sm border border-border rounded-md bg-background"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-foreground/70 mb-1">Description</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Short description"
                className="w-full px-3 py-1.5 text-sm border border-border rounded-md bg-background"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-foreground/70 mb-1">
                Content (starting template body)
              </label>
              <textarea
                value={form.content}
                onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
                placeholder="Template starter content…"
                rows={6}
                className="w-full px-3 py-1.5 text-sm border border-border rounded-md bg-background resize-y font-mono"
              />
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <input
                type="checkbox"
                id="isDefault"
                checked={form.isDefault}
                onChange={(e) => setForm((p) => ({ ...p, isDefault: e.target.checked }))}
                className="h-4 w-4 rounded border-border"
              />
              <label htmlFor="isDefault" className="text-sm text-foreground/70">
                Set as default for this category
              </label>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => void (editingId ? handleUpdate() : handleCreate())}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <Check className="h-3.5 w-3.5" />
              {isSaving ? "Saving…" : (editingId ? "Update" : "Create")}
            </button>
            <button
              onClick={() => { setShowCreate(false); setEditingId(null); setForm(EMPTY_FORM); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-border hover:bg-muted transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Template List */}
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-foreground/60">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">Name</th>
              <th className="px-4 py-2.5 text-left font-medium">Category</th>
              <th className="px-4 py-2.5 text-left font-medium">Usage</th>
              <th className="px-4 py-2.5 text-left font-medium">Status</th>
              <th className="px-4 py-2.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {templates.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No templates yet. Create one above.
                </td>
              </tr>
            ) : (
              templates.map((t) => (
                <tr key={t._id} className={["hover:bg-muted/30 transition-colors", editingId === t._id ? "bg-primary/5" : ""].join(" ")}>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div>
                        <div className="font-medium">{t.name}</div>
                        {t.description && (
                          <div className="text-xs text-foreground/50 truncate max-w-xs">{t.description}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    {t.category ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted border border-border">
                        {t.category}
                      </span>
                    ) : (
                      <span className="text-foreground/40 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-foreground/60">{t.usageCount}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1">
                      <span className={["text-xs px-2 py-0.5 rounded-full border", t.isActive ? "border-success/30 bg-success/10 text-success" : "border-border bg-muted text-foreground/50"].join(" ")}>
                        {t.isActive ? "Active" : "Inactive"}
                      </span>
                      {t.isDefault && (
                        <span className="text-xs px-2 py-0.5 rounded-full border border-primary/30 bg-primary/10 text-primary">
                          Default
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {confirmDelete === t._id ? (
                      <div className="flex justify-end items-center gap-2">
                        <span className="text-xs text-destructive">Delete?</span>
                        <button
                          onClick={() => void handleDelete(t._id)}
                          className="text-xs px-2 py-1 bg-destructive text-destructive-foreground rounded hover:bg-destructive/90 transition-colors"
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="text-xs px-2 py-1 border border-border rounded hover:bg-muted transition-colors"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => startEdit(t)}
                          aria-label={`Edit ${t.name}`}
                          className="p-1 rounded hover:bg-muted transition-colors text-foreground/60 hover:text-foreground"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setConfirmDelete(t._id)}
                          aria-label={`Delete ${t.name}`}
                          className="p-1 rounded hover:bg-destructive/10 text-foreground/60 hover:text-destructive transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
