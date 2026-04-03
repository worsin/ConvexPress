/**
 * Canned Responses Route - /admin/tickets/canned-responses
 *
 * Admin management page for canned response templates.
 * List with shortcut, title, category, usage count.
 * CRUD form with /shortcut input, content textarea with {{variable}} support.
 */

import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { RoutePermissionGuard } from "@/lib/route-permission-guard";
import { toast } from "sonner";
import type { Id } from "@backend/convex/_generated/dataModel";
import { Plus, Pencil, Trash2, X, Save } from "lucide-react";

export const Route = createFileRoute(
  "/_authenticated/_admin/tickets/canned-responses",
)({
  component: CannedResponsesPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────

interface CannedResponse {
  _id: Id<"ticket_cannedResponses">;
  title: string;
  shortcut: string;
  content: string;
  category: string;
  usageCount: number;
}

interface FormState {
  title: string;
  shortcut: string;
  content: string;
  category: string;
}

const EMPTY_FORM: FormState = {
  title: "",
  shortcut: "",
  content: "",
  category: "",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

function CannedResponsesPage() {
  return (
    <RoutePermissionGuard requiredAccess="/admin/tickets">
      <CannedResponsesManager />
    </RoutePermissionGuard>
  );
}

// ─── Manager Component ────────────────────────────────────────────────────────

function CannedResponsesManager() {
  const [editingId, setEditingId] = useState<Id<"ticket_cannedResponses"> | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [deleteConfirmId, setDeleteConfirmId] = useState<Id<"ticket_cannedResponses"> | null>(null);

  const responses = useQuery(api.tickets.cannedResponses.list);
  const categories = useQuery(api.tickets.cannedResponses.getCategories);

  const createResponse = useMutation(api.tickets.cannedResponses.create);
  const updateResponse = useMutation(api.tickets.cannedResponses.update);
  const removeResponse = useMutation(api.tickets.cannedResponses.remove);

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setIsCreating(true);
  }

  function startEdit(r: CannedResponse) {
    setIsCreating(false);
    setEditingId(r._id);
    setForm({
      title: r.title,
      shortcut: r.shortcut,
      content: r.content,
      category: r.category,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setIsCreating(false);
    setForm(EMPTY_FORM);
  }

  async function handleSave() {
    if (!form.title.trim() || !form.shortcut.trim() || !form.content.trim()) {
      toast.error("Title, shortcut, and content are required");
      return;
    }

    try {
      if (isCreating) {
        await createResponse({
          title: form.title,
          shortcut: form.shortcut,
          content: form.content,
          category: form.category || "general",
        });
        toast.success("Canned response created");
      } else if (editingId) {
        await updateResponse({
          id: editingId,
          title: form.title,
          shortcut: form.shortcut,
          content: form.content,
          category: form.category,
        });
        toast.success("Canned response updated");
      }
      cancelEdit();
    } catch (error: any) {
      toast.error(error?.data?.message ?? "Failed to save canned response");
    }
  }

  async function handleDelete(id: Id<"ticket_cannedResponses">) {
    try {
      await removeResponse({ id });
      toast.success("Canned response deleted");
      setDeleteConfirmId(null);
    } catch (error: any) {
      toast.error(error?.data?.message ?? "Failed to delete canned response");
    }
  }

  if (!responses) {
    return (
      <div className="p-6 animate-pulse space-y-4">
        <div className="h-8 bg-muted rounded w-1/4" />
        <div className="h-48 bg-muted rounded" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Canned Responses</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Pre-written replies for common support scenarios. Use{" "}
            <code className="bg-muted px-1 rounded text-xs">
              {"{{variable}}"}
            </code>{" "}
            for dynamic values.
          </p>
        </div>
        {!isCreating && !editingId && (
          <button
            onClick={startCreate}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add New
          </button>
        )}
      </div>

      {/* Create / Edit Form */}
      {(isCreating || editingId) && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-foreground/70">
            {isCreating ? "New Canned Response" : "Edit Canned Response"}
          </h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Title <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Welcome to Support"
                className="w-full px-3 py-1.5 text-sm border border-border rounded-md bg-card focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Shortcut <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                value={form.shortcut}
                onChange={(e) =>
                  setForm({
                    ...form,
                    shortcut: e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9_-]/g, ""),
                  })
                }
                placeholder="e.g. /welcome"
                className="w-full px-3 py-1.5 text-sm border border-border rounded-md bg-card font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <p className="text-xs text-foreground/40 mt-0.5">
                Lowercase letters, numbers, hyphens, underscores only
              </p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Category
            </label>
            <input
              type="text"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder="e.g. billing, technical, onboarding"
              list="canned-categories"
              className="w-full max-w-xs px-3 py-1.5 text-sm border border-border rounded-md bg-card focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <datalist id="canned-categories">
              {(categories ?? []).map((cat: string) => (
                <option key={cat} value={cat} />
              ))}
            </datalist>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Content <span className="text-destructive">*</span>
            </label>
            <textarea
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              rows={6}
              placeholder="Hi {{userName}}, thank you for reaching out..."
              className="w-full px-3 py-2 text-sm border border-border rounded-md bg-card resize-y focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono"
            />
            <p className="text-xs text-foreground/40 mt-0.5">
              Available variables:{" "}
              <code className="bg-muted px-1 rounded">{"{{userName}}"}</code>{" "}
              <code className="bg-muted px-1 rounded">{"{{ticketNumber}}"}</code>{" "}
              <code className="bg-muted px-1 rounded">{"{{agentName}}"}</code>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => void handleSave()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 transition-colors"
            >
              <Save className="h-4 w-4" />
              {isCreating ? "Create" : "Save Changes"}
            </button>
            <button
              onClick={cancelEdit}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-muted-foreground border border-border rounded-md hover:bg-muted transition-colors"
            >
              <X className="h-4 w-4" />
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Responses List */}
      {responses.length === 0 ? (
        <div className="rounded-lg border border-border p-12 text-center text-sm text-foreground/40">
          No canned responses yet. Create one to speed up your support workflow.
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Title
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Shortcut
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Category
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Used
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-card divide-y divide-border">
              {(responses as CannedResponse[]).map((r) => (
                <tr key={r._id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-foreground">
                      {r.title}
                    </div>
                    <div className="text-xs text-foreground/40 truncate max-w-sm mt-0.5">
                      {r.content.slice(0, 80)}
                      {r.content.length > 80 && "…"}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <code className="text-xs bg-muted px-2 py-0.5 rounded font-mono">
                      {r.shortcut}
                    </code>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {r.category || (
                      <span className="italic text-foreground/30">None</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {r.usageCount}x
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => startEdit(r)}
                        className="p-1.5 rounded hover:bg-muted text-foreground/40 hover:text-foreground/70 transition-colors"
                        aria-label={`Edit ${r.title}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      {deleteConfirmId === r._id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => void handleDelete(r._id)}
                            className="px-2 py-1 text-xs font-medium text-primary-foreground bg-destructive rounded hover:bg-destructive/90 transition-colors"
                          >
                            Delete
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(null)}
                            className="px-2 py-1 text-xs font-medium text-muted-foreground border border-border rounded hover:bg-muted transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirmId(r._id)}
                          className="p-1.5 rounded hover:bg-destructive/10 text-foreground/40 hover:text-destructive transition-colors"
                          aria-label={`Delete ${r.title}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
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
