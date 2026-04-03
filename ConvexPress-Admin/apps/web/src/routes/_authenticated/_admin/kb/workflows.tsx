/**
 * KB Workflows Route - /admin/kb/workflows
 *
 * Workflow management: list, create, update, delete.
 * Wired to api.kb.workflows.*
 */

import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { RoutePermissionGuard } from "@/lib/route-permission-guard";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, X, Check, GitBranch, PlusCircle, MinusCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_admin/kb/workflows")({
  component: KBWorkflowsPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────

type WorkflowStep = {
  name: string;
  requiredApprovals: number;
  assigneeId?: string;
};

type FormState = {
  name: string;
  description: string;
  isDefault: boolean;
  steps: WorkflowStep[];
};

const DEFAULT_STEP: WorkflowStep = { name: "", requiredApprovals: 1 };

const EMPTY_FORM: FormState = {
  name: "",
  description: "",
  isDefault: false,
  steps: [{ ...DEFAULT_STEP }],
};

// ─── Page ─────────────────────────────────────────────────────────────────────

function KBWorkflowsPage() {
  return (
    <RoutePermissionGuard requiredAccess="/admin/kb">
      <KBWorkflowsContent />
    </RoutePermissionGuard>
  );
}

function KBWorkflowsContent() {
  const workflows = useQuery(api.kb.workflows.list) ?? [];
  const createWorkflow = useMutation(api.kb.workflows.create);
  const updateWorkflow = useMutation(api.kb.workflows.update);
  const removeWorkflow = useMutation(api.kb.workflows.remove);

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function startEdit(w: (typeof workflows)[0]) {
    setEditingId(w._id);
    setForm({
      name: w.name,
      description: w.description ?? "",
      isDefault: w.isDefault,
      steps: w.steps.length > 0
        ? w.steps.map((s) => ({
            name: s.name,
            requiredApprovals: s.requiredApprovals,
            assigneeId: s.assigneeId,
          }))
        : [{ ...DEFAULT_STEP }],
    });
    setShowCreate(false);
  }

  function addStep() {
    setForm((p) => ({ ...p, steps: [...p.steps, { ...DEFAULT_STEP }] }));
  }

  function removeStep(idx: number) {
    setForm((p) => ({
      ...p,
      steps: p.steps.filter((_, i) => i !== idx),
    }));
  }

  function updateStep(idx: number, field: keyof WorkflowStep, value: string | number) {
    setForm((p) => ({
      ...p,
      steps: p.steps.map((s, i) =>
        i === idx ? { ...s, [field]: value } : s,
      ),
    }));
  }

  async function handleCreate() {
    if (!form.name.trim()) { toast.error("Workflow name is required"); return; }
    if (form.steps.length === 0) { toast.error("Add at least one step"); return; }
    if (form.steps.some((s) => !s.name.trim())) { toast.error("All steps need a name"); return; }
    setIsSaving(true);
    try {
      await createWorkflow({
        name: form.name.trim(),
        description: form.description || undefined,
        isDefault: form.isDefault,
        steps: form.steps.map((s) => ({
          name: s.name.trim(),
          requiredApprovals: s.requiredApprovals,
          assigneeId: s.assigneeId as any,
        })),
      });
      toast.success("Workflow created");
      setForm(EMPTY_FORM);
      setShowCreate(false);
    } catch (err: any) {
      toast.error(err?.data?.message ?? "Failed to create workflow");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleUpdate() {
    if (!editingId) return;
    if (!form.name.trim()) { toast.error("Workflow name is required"); return; }
    if (form.steps.length === 0) { toast.error("Add at least one step"); return; }
    if (form.steps.some((s) => !s.name.trim())) { toast.error("All steps need a name"); return; }
    setIsSaving(true);
    try {
      await updateWorkflow({
        workflowId: editingId as any,
        name: form.name.trim(),
        description: form.description || undefined,
        isDefault: form.isDefault,
        steps: form.steps.map((s) => ({
          name: s.name.trim(),
          requiredApprovals: s.requiredApprovals,
          assigneeId: s.assigneeId as any,
        })),
      });
      toast.success("Workflow updated");
      setEditingId(null);
      setForm(EMPTY_FORM);
    } catch (err: any) {
      toast.error(err?.data?.message ?? "Failed to update workflow");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(workflowId: string) {
    try {
      await removeWorkflow({ workflowId: workflowId as any });
      toast.success("Workflow deleted");
      setConfirmDelete(null);
    } catch (err: any) {
      toast.error(err?.data?.message ?? "Failed to delete workflow");
    }
  }

  const isFormOpen = showCreate || !!editingId;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">KB Workflows</h1>
        <button
          onClick={() => { setShowCreate(true); setEditingId(null); setForm(EMPTY_FORM); }}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Workflow
        </button>
      </div>

      {/* Create / Edit Form */}
      {isFormOpen && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-4">
          <h2 className="text-sm font-semibold">{editingId ? "Edit Workflow" : "New Workflow"}</h2>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground/70 mb-1">Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Workflow name"
                className="w-full px-3 py-1.5 text-sm border border-border rounded-md bg-background"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground/70 mb-1">Description</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Optional description"
                className="w-full px-3 py-1.5 text-sm border border-border rounded-md bg-background"
              />
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <input
                type="checkbox"
                id="wf-isDefault"
                checked={form.isDefault}
                onChange={(e) => setForm((p) => ({ ...p, isDefault: e.target.checked }))}
                className="h-4 w-4 rounded border-border"
              />
              <label htmlFor="wf-isDefault" className="text-sm text-foreground/70">
                Set as default workflow
              </label>
            </div>
          </div>

          {/* Steps Builder */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-foreground/70">Steps</label>
              <button
                onClick={addStep}
                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
              >
                <PlusCircle className="h-3.5 w-3.5" />
                Add Step
              </button>
            </div>
            <div className="space-y-2">
              {form.steps.map((step, idx) => (
                <div key={idx} className="flex items-center gap-2 rounded-md border border-border bg-background p-2">
                  <span className="text-xs font-medium text-foreground/40 w-5 text-center">{idx + 1}</span>
                  <input
                    type="text"
                    value={step.name}
                    onChange={(e) => updateStep(idx, "name", e.target.value)}
                    placeholder="Step name"
                    className="flex-1 px-2 py-1 text-sm border border-border rounded bg-card"
                  />
                  <div className="flex items-center gap-1">
                    <label className="text-xs text-foreground/50 whitespace-nowrap">Min approvals:</label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={step.requiredApprovals}
                      onChange={(e) => updateStep(idx, "requiredApprovals", Number(e.target.value))}
                      className="w-16 px-2 py-1 text-sm border border-border rounded bg-card"
                    />
                  </div>
                  {form.steps.length > 1 && (
                    <button
                      onClick={() => removeStep(idx)}
                      className="text-foreground/40 hover:text-destructive transition-colors"
                    >
                      <MinusCircle className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
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

      {/* Workflow List */}
      <div className="space-y-3">
        {workflows.length === 0 ? (
          <div className="rounded-lg border border-border p-8 text-center text-muted-foreground">
            No workflows yet. Create one above.
          </div>
        ) : (
          workflows.map((w) => (
            <div key={w._id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <GitBranch className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{w.name}</span>
                      <div className="flex gap-1">
                        {w.isDefault && (
                          <span className="text-xs px-1.5 py-0.5 rounded-full border border-primary/30 bg-primary/10 text-primary">
                            Default
                          </span>
                        )}
                        <span className={["text-xs px-1.5 py-0.5 rounded-full border", w.isActive ? "border-success/30 bg-success/10 text-success" : "border-border bg-muted text-foreground/50"].join(" ")}>
                          {w.isActive ? "Active" : "Inactive"}
                        </span>
                      </div>
                    </div>
                    {w.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{w.description}</p>
                    )}
                    {/* Steps preview */}
                    <div className="flex items-center gap-1 mt-2">
                      {w.steps.map((step, idx) => (
                        <span key={idx} className="flex items-center gap-1">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-muted border border-border text-foreground/70">
                            {step.name || `Step ${idx + 1}`}
                            {step.requiredApprovals > 1 && (
                              <span className="ml-1 text-foreground/40">×{step.requiredApprovals}</span>
                            )}
                          </span>
                          {idx < w.steps.length - 1 && (
                            <span className="text-foreground/30 text-xs">→</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {confirmDelete === w._id ? (
                    <>
                      <span className="text-xs text-destructive mr-1">Delete?</span>
                      <button
                        onClick={() => void handleDelete(w._id)}
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
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => startEdit(w)}
                        className="p-1.5 rounded hover:bg-muted transition-colors text-foreground/60 hover:text-foreground"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(w._id)}
                        className="p-1.5 rounded hover:bg-destructive/10 text-foreground/60 hover:text-destructive transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
