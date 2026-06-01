import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import {
  DndContext,
  closestCenter,
  useSensors,
  useSensor,
  PointerSensor,
  KeyboardSensor,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVerticalIcon,
  LoaderIcon,
  PencilIcon,
  PlusIcon,
  RotateCcwIcon,
  ShieldOff,
  TrashIcon,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import type { Capability } from "@backend/convex/types/capabilities";
import { ConditionalLogicBuilder } from "@/components/custom-fields/ConditionalLogicBuilder";
import { PluginGuard } from "@/components/plugins/PluginGuard";
import { useCan } from "@/hooks/useCan";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";

/**
 * Form Actions & Feeds — admin editor.
 *
 * Full-page (no modal editors; confirm dialog only for delete). Mirrors the
 * notifications screen conventions: PluginGuard, useCan, cache useQuery, Base
 * UI components, CSS-variable colors, dnd-kit reorder. Each action type renders
 * its own config editor driven by the type key. Includes a run-history panel
 * with status chips and a replay button on failed rows.
 */

/** Local wrapper for Forms capability strings. */
const formCap = (cap: string): Capability => cap as Capability;

type RunStatus = "pending" | "completed" | "failed" | "awaiting_payment";

interface ActionRow {
  _id: Id<"form_actions">;
  formId: Id<"forms">;
  type: string;
  label: string;
  config: string;
  conditionalLogic?: string;
  enabled: boolean;
  order: number;
}

interface RunRow {
  _id: Id<"form_action_runs">;
  submissionId: Id<"form_submissions">;
  formActionId: Id<"form_actions">;
  type: string;
  status: RunStatus;
  attempts: number;
  error?: string;
  result?: string;
  createdAt: number;
  updatedAt: number;
}

interface SiblingField {
  _id: string;
  label: string;
  name: string;
  key: string;
  type: string;
}

export const Route = createFileRoute(
  "/_authenticated/_admin/forms/$formId/actions",
)({
  component: ActionsPage,
});

function ActionsPage() {
  const { formId } = Route.useParams();
  return (
    <PluginGuard pluginId="forms">
      <ActionsContent formId={formId as Id<"forms">} />
    </PluginGuard>
  );
}

function ActionsContent({ formId }: { formId: Id<"forms"> }) {
  const canManage = useCan(formCap("form.manage_actions"));

  const form = useQuery(api.extensions.forms.queries.getForm, { id: formId });
  const fieldGroupId = form?.fieldGroupId;
  const fields = useQuery(
    api.customFields.queries.getFieldsByGroup,
    fieldGroupId ? { groupId: fieldGroupId } : "skip",
  );
  const rows = useQuery(
    api.extensions.forms.actions.listActions,
    canManage ? { formId } : "skip",
  ) as ActionRow[] | undefined;
  const actionTypes = useQuery(
    api.extensions.forms.actions.availableActionTypes,
    canManage ? {} : "skip",
  ) as Array<{ type: string; label: string }> | undefined;
  const recentRuns = useQuery(
    api.extensions.forms.actions.listRecentRuns,
    canManage ? { formId } : "skip",
  ) as RunRow[] | undefined;

  const createAction = useMutation(api.extensions.forms.actions.createAction);
  const updateAction = useMutation(api.extensions.forms.actions.updateAction);
  const reorderActions = useMutation(api.extensions.forms.actions.reorderActions);
  const deleteAction = useMutation(api.extensions.forms.actions.deleteAction);
  const replayRun = useMutation(api.extensions.forms.actions.replayRun);

  const [editingId, setEditingId] = useState<Id<"form_actions"> | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ActionRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const siblingFields: SiblingField[] = useMemo(
    () =>
      (fields ?? []).map((f: any) => ({
        _id: f._id,
        label: f.label,
        name: f.name,
        key: f.key,
        type: f.type,
      })),
    [fields],
  );

  const typeLabels = useMemo(() => {
    const m: Record<string, string> = {};
    for (const t of actionTypes ?? []) m[t.type] = t.label;
    return m;
  }, [actionTypes]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  if (!canManage) return <PermissionDenied />;

  if (form === undefined || rows === undefined) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (form === null) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <div className="rounded-lg border border-border bg-card p-8">
          <h1 className="text-xl font-semibold text-foreground">
            Form not found
          </h1>
          <Link to="/forms" className="mt-4 inline-block">
            <Button variant="outline">Back to Forms</Button>
          </Link>
        </div>
      </div>
    );
  }

  const sortedIds = rows.map((r) => r._id);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = rows.findIndex((r) => r._id === active.id);
    const newIndex = rows.findIndex((r) => r._id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(rows, oldIndex, newIndex);
    void reorderActions({
      formId,
      orderedIds: reordered.map((r) => r._id),
    }).catch(() => toast.error("Failed to reorder actions."));
  };

  const toggleEnabled = (row: ActionRow, enabled: boolean) => {
    void updateAction({ actionId: row._id, enabled })
      .then(() => toast.success(enabled ? "Action enabled." : "Action disabled."))
      .catch(() => toast.error("Failed to update action."));
  };

  const handleDelete = (row: ActionRow) => {
    setPendingDelete(row);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      await deleteAction({ actionId: pendingDelete._id });
      toast.success("Action deleted.");
      if (editingId === pendingDelete._id) setEditingId(null);
      setPendingDelete(null);
    } catch {
      toast.error("Failed to delete action.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Actions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Run automated actions when &ldquo;{form.title}&rdquo; is submitted.
            Each action evaluates its conditional logic, runs in order, and is
            retried on transient failures.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/forms/$formId/edit" params={{ formId }}>
            <Button variant="outline">Back to Form</Button>
          </Link>
          <Button
            onClick={() => {
              setIsCreating(true);
              setEditingId(null);
            }}
          >
            <PlusIcon className="size-4" data-icon="inline-start" />
            Add Action
          </Button>
        </div>
      </div>

      {isCreating ? (
        <ActionEditor
          availableTypes={actionTypes ?? []}
          siblingFields={siblingFields}
          onCancel={() => setIsCreating(false)}
          onSave={async (values) => {
            try {
              await createAction({ formId, ...values });
              toast.success("Action created.");
              setIsCreating(false);
            } catch (error) {
              toast.error(
                error instanceof Error ? error.message : "Failed to create action.",
              );
            }
          }}
        />
      ) : null}

      {rows.length === 0 && !isCreating ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            No actions yet. Click &ldquo;Add Action&rdquo; to create one.
          </p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={sortedIds} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-3">
              {rows.map((row) =>
                editingId === row._id ? (
                  <ActionEditor
                    key={row._id}
                    availableTypes={actionTypes ?? []}
                    siblingFields={siblingFields}
                    initial={row}
                    onCancel={() => setEditingId(null)}
                    onSave={async (values) => {
                      try {
                        await updateAction({
                          actionId: row._id,
                          label: values.label,
                          config: values.config,
                          conditionalLogic: values.conditionalLogic,
                          enabled: values.enabled,
                        });
                        toast.success("Action saved.");
                        setEditingId(null);
                      } catch (error) {
                        toast.error(
                          error instanceof Error
                            ? error.message
                            : "Failed to save action.",
                        );
                      }
                    }}
                  />
                ) : (
                  <SortableActionRow
                    key={row._id}
                    row={row}
                    typeLabel={typeLabels[row.type] ?? row.type}
                    onEdit={() => {
                      setEditingId(row._id);
                      setIsCreating(false);
                    }}
                    onDelete={() => handleDelete(row)}
                    onToggleEnabled={(enabled) => toggleEnabled(row, enabled)}
                  />
                ),
              )}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <RunHistoryPanel
        runs={recentRuns}
        typeLabels={typeLabels}
        onReplay={(runId) =>
          void replayRun({ runId })
            .then((r) =>
              r?.replayed
                ? toast.success("Run re-queued.")
                : toast.info("Completed runs are not replayed."),
            )
            .catch(() => toast.error("Failed to replay run."))
        }
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => {
          if (!isDeleting) setPendingDelete(null);
        }}
        onConfirm={() => void confirmDelete()}
        title="Delete this action?"
        message={`Delete "${pendingDelete?.label ?? "this action"}"? Run history is retained.`}
        confirmLabel="Delete"
        destructive
        isExecuting={isDeleting}
      />
    </div>
  );
}

function SortableActionRow({
  row,
  typeLabel,
  onEdit,
  onDelete,
  onToggleEnabled,
}: {
  row: ActionRow;
  typeLabel: string;
  onEdit: () => void;
  onDelete: () => void;
  onToggleEnabled: (enabled: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: row._id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3"
    >
      <button
        type="button"
        className="shrink-0 cursor-grab text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing"
        aria-label={`Reorder ${row.label}`}
        {...attributes}
        {...listeners}
      >
        <GripVerticalIcon className="size-4" />
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">
            {row.label}
          </span>
          <Badge variant="secondary">{typeLabel}</Badge>
        </div>
        <span className="text-xs text-muted-foreground">
          Order {row.order + 1}
          {row.conditionalLogic ? " · conditional" : ""}
        </span>
      </div>

      <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
        <Checkbox
          checked={row.enabled}
          onCheckedChange={(checked) => onToggleEnabled(checked === true)}
        />
        {row.enabled ? "Enabled" : "Disabled"}
      </label>

      <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label="Edit action">
        <PencilIcon className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onDelete}
        aria-label="Delete action"
        className="text-muted-foreground hover:text-destructive"
      >
        <TrashIcon className="size-3.5" />
      </Button>
    </div>
  );
}

interface EditorValues {
  type: string;
  label: string;
  config: string;
  conditionalLogic?: string;
  enabled?: boolean;
}

function ActionEditor({
  availableTypes,
  siblingFields,
  initial,
  onCancel,
  onSave,
}: {
  availableTypes: Array<{ type: string; label: string }>;
  siblingFields: SiblingField[];
  initial?: ActionRow;
  onCancel: () => void;
  onSave: (values: EditorValues) => Promise<void>;
}) {
  const [type, setType] = useState(
    initial?.type ?? availableTypes[0]?.type ?? "webhook",
  );
  const [label, setLabel] = useState(initial?.label ?? "");
  const [config, setConfig] = useState<Record<string, unknown>>(() => {
    if (initial?.config) {
      try {
        return JSON.parse(initial.config) as Record<string, unknown>;
      } catch {
        return {};
      }
    }
    return {};
  });
  const [conditionalLogic, setConditionalLogic] = useState<string | undefined>(
    initial?.conditionalLogic,
  );
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!label.trim()) {
      toast.error("Action label is required.");
      return;
    }
    setIsSaving(true);
    try {
      await onSave({
        type,
        label: label.trim(),
        config: JSON.stringify(config),
        conditionalLogic,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="rounded-lg border border-primary/40 bg-card p-5">
      <h2 className="text-lg font-medium text-foreground">
        {initial ? "Edit action" : "New action"}
      </h2>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="grid gap-2">
          <label className="text-sm font-medium" htmlFor="action-label">
            Label
          </label>
          <Input
            id="action-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Send to CRM"
          />
        </div>

        <div className="grid gap-2">
          <span className="text-sm font-medium">Type</span>
          <Select
            value={type}
            onValueChange={(v) => {
              setType(v ?? "");
              // Reset config when switching types so a stale shape isn't saved.
              if (!initial) setConfig({});
            }}
            disabled={!!initial}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableTypes.map((t) => (
                <SelectItem key={t.type} value={t.type}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-5 border-t border-border pt-4">
        <ActionConfigEditor
          type={type}
          config={config}
          onChange={setConfig}
          siblingFields={siblingFields}
        />
      </div>

      <div className="mt-5 border-t border-border pt-4">
        <h3 className="text-sm font-medium text-foreground">Conditional logic</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Only run this action when the submitted answers match these rules.
          Leave empty to always run.
        </p>
        <ConditionalLogicBuilder
          value={conditionalLogic}
          onChange={setConditionalLogic}
          siblingFields={siblingFields}
        />
      </div>

      <div className="mt-5 flex items-center justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
        <Button onClick={() => void handleSave()} disabled={isSaving}>
          {isSaving ? (
            <>
              <LoaderIcon className="size-4 animate-spin" data-icon="inline-start" />
              Saving
            </>
          ) : (
            "Save"
          )}
        </Button>
      </div>
    </section>
  );
}

// ─── Per-type config editors ─────────────────────────────────────────────────

function ActionConfigEditor({
  type,
  config,
  onChange,
  siblingFields,
}: {
  type: string;
  config: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
  siblingFields: SiblingField[];
}) {
  const set = (patch: Record<string, unknown>) => onChange({ ...config, ...patch });

  if (type === "webhook") {
    return (
      <div className="grid gap-4">
        <h3 className="text-sm font-medium text-foreground">Webhook config</h3>
        <Field label="URL (https)">
          <Input
            value={(config.url as string) ?? ""}
            onChange={(e) => set({ url: e.target.value })}
            placeholder="https://example.com/hook"
          />
        </Field>
        <Field label="Secret (optional — signs body as x-convexpress-signature)">
          <Input
            value={(config.secret as string) ?? ""}
            onChange={(e) => set({ secret: e.target.value || undefined })}
            placeholder="shared secret"
          />
        </Field>
        <Field label="Body template (optional — {field_key} tokens; default = all values JSON)">
          <Textarea
            rows={4}
            value={(config.bodyTemplate as string) ?? ""}
            onChange={(e) => set({ bodyTemplate: e.target.value || undefined })}
            placeholder={'{"email":"{email}","name":"{name}"}'}
          />
        </Field>
        <FieldKeyHint siblingFields={siblingFields} />
      </div>
    );
  }

  if (type === "lead_capture") {
    return (
      <div className="grid gap-4">
        <h3 className="text-sm font-medium text-foreground">Lead capture config</h3>
        <Field label="CRM endpoint (optional)">
          <Input
            value={(config.endpoint as string) ?? ""}
            onChange={(e) => set({ endpoint: e.target.value || undefined })}
            placeholder="https://crm.example.com/api/contacts"
          />
        </Field>
        <Field label="API key (optional)">
          <Input
            value={(config.apiKey as string) ?? ""}
            onChange={(e) => set({ apiKey: e.target.value || undefined })}
          />
        </Field>
        <FieldMapEditor
          label="Field → CRM property map"
          value={(config.fieldMap as Record<string, string>) ?? {}}
          onChange={(m) => set({ fieldMap: m })}
          siblingFields={siblingFields}
        />
      </div>
    );
  }

  if (type === "email_marketing") {
    return (
      <div className="grid gap-4">
        <h3 className="text-sm font-medium text-foreground">
          Email marketing config
        </h3>
        <Field label="Provider endpoint (optional)">
          <Input
            value={(config.endpoint as string) ?? ""}
            onChange={(e) => set({ endpoint: e.target.value || undefined })}
            placeholder="https://provider.example.com/api/subscribe"
          />
        </Field>
        <Field label="API key (optional)">
          <Input
            value={(config.apiKey as string) ?? ""}
            onChange={(e) => set({ apiKey: e.target.value || undefined })}
          />
        </Field>
        <Field label="List / audience id">
          <Input
            value={(config.listId as string) ?? ""}
            onChange={(e) => set({ listId: e.target.value })}
          />
        </Field>
        <FieldSelect
          label="Email field"
          value={(config.emailFieldKey as string) ?? ""}
          onChange={(k) => set({ emailFieldKey: k })}
          siblingFields={siblingFields}
        />
        <FieldMapEditor
          label="Merge fields (field → provider merge tag)"
          value={(config.mergeFields as Record<string, string>) ?? {}}
          onChange={(m) => set({ mergeFields: m })}
          siblingFields={siblingFields}
        />
      </div>
    );
  }

  if (type === "subscription" || type === "payment") {
    return (
      <SubscriptionConfigEditor
        config={config}
        onChange={onChange}
        siblingFields={siblingFields}
      />
    );
  }

  return (
    <p className="text-sm text-muted-foreground">
      No editor available for type &ldquo;{type}&rdquo;.
    </p>
  );
}

function SubscriptionConfigEditor({
  config,
  onChange,
  siblingFields,
}: {
  config: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
  siblingFields: SiblingField[];
}) {
  const set = (patch: Record<string, unknown>) => onChange({ ...config, ...patch });
  const offerMode = (config.offerMode as string) ?? "fixed";
  const couponMode = (config.couponMode as string) ?? "none";

  return (
    <div className="grid gap-4">
      <h3 className="text-sm font-medium text-foreground">Subscription config</h3>

      <Field label="Offer mode">
        <Select value={offerMode} onValueChange={(v) => set({ offerMode: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fixed">Fixed offer</SelectItem>
            <SelectItem value="fromField">From a field value</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      {offerMode === "fixed" ? (
        <Field label="Offer id">
          <Input
            value={(config.offerId as string) ?? ""}
            onChange={(e) => set({ offerId: e.target.value })}
            placeholder="commerce_subscription_offers id"
          />
        </Field>
      ) : (
        <FieldSelect
          label="Offer field (its value is the offer id, or remapped below)"
          value={(config.offerFieldName as string) ?? ""}
          onChange={(k) => set({ offerFieldName: k })}
          siblingFields={siblingFields}
        />
      )}

      <FieldSelect
        label="Email field"
        value={(config.emailFieldName as string) ?? ""}
        onChange={(k) => set({ emailFieldName: k })}
        siblingFields={siblingFields}
      />

      <Field label="Coupon mode">
        <Select value={couponMode} onValueChange={(v) => set({ couponMode: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            <SelectItem value="fixed">Fixed code</SelectItem>
            <SelectItem value="fromField">From a field</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      {couponMode === "fixed" ? (
        <Field label="Coupon code">
          <Input
            value={(config.couponCode as string) ?? ""}
            onChange={(e) => set({ couponCode: e.target.value })}
          />
        </Field>
      ) : null}
      {couponMode === "fromField" ? (
        <FieldSelect
          label="Coupon field"
          value={(config.couponFieldName as string) ?? ""}
          onChange={(k) => set({ couponFieldName: k })}
          siblingFields={siblingFields}
        />
      ) : null}

      <Field label="Account policy">
        <Select
          value={(config.accountPolicy as string) ?? "require_existing"}
          onValueChange={(v) => set({ accountPolicy: v })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="require_existing">
              Require existing account
            </SelectItem>
            <SelectItem value="create_on_website">
              Create account on website
            </SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Field label="Return URL (optional)">
        <Input
          value={(config.returnUrl as string) ?? ""}
          onChange={(e) => set({ returnUrl: e.target.value || undefined })}
          placeholder="https://site.example.com/welcome"
        />
      </Field>

      <Field label="Max initial amount in cents (optional cap)">
        <Input
          type="number"
          value={
            config.maxInitialAmount === undefined
              ? ""
              : String(config.maxInitialAmount)
          }
          onChange={(e) =>
            set({
              maxInitialAmount:
                e.target.value === ""
                  ? undefined
                  : Math.max(0, Math.floor(Number(e.target.value))),
            })
          }
          placeholder="e.g. 5000"
        />
      </Field>
    </div>
  );
}

// ─── Small editor primitives ─────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
    </div>
  );
}

function FieldSelect({
  label,
  value,
  onChange,
  siblingFields,
}: {
  label: string;
  value: string;
  onChange: (key: string) => void;
  siblingFields: SiblingField[];
}) {
  return (
    <Field label={label}>
      <Select value={value || undefined} onValueChange={(v) => onChange(v ?? "")}>
        <SelectTrigger>
          <SelectValue placeholder="Select a field" />
        </SelectTrigger>
        <SelectContent>
          {siblingFields.map((f) => (
            <SelectItem key={f.key} value={f.key}>
              {f.label} ({f.key})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

function FieldMapEditor({
  label,
  value,
  onChange,
  siblingFields,
}: {
  label: string;
  value: Record<string, string>;
  onChange: (m: Record<string, string>) => void;
  siblingFields: SiblingField[];
}) {
  const entries = Object.entries(value);
  const addRow = () => {
    const firstUnused = siblingFields.find((f) => !(f.key in value));
    if (!firstUnused) return;
    onChange({ ...value, [firstUnused.key]: "" });
  };
  const setProp = (key: string, prop: string) =>
    onChange({ ...value, [key]: prop });
  const removeRow = (key: string) => {
    const next = { ...value };
    delete next[key];
    onChange(next);
  };

  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">No mappings yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map(([key, prop]) => (
            <div key={key} className="flex items-center gap-2">
              <code className="rounded-md bg-muted px-1.5 py-1 text-[11px] text-foreground">
                {key}
              </code>
              <span className="text-muted-foreground">→</span>
              <Input
                value={prop}
                onChange={(e) => setProp(key, e.target.value)}
                placeholder="property name"
              />
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => removeRow(key)}
                aria-label="Remove mapping"
                className="text-muted-foreground hover:text-destructive"
              >
                <TrashIcon className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={addRow}
        disabled={siblingFields.every((f) => f.key in value)}
      >
        <PlusIcon className="size-3.5" data-icon="inline-start" />
        Add mapping
      </Button>
    </div>
  );
}

function FieldKeyHint({ siblingFields }: { siblingFields: SiblingField[] }) {
  if (siblingFields.length === 0) return null;
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/10 px-3 py-2">
      <p className="text-[11px] font-medium text-foreground">Field keys</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {siblingFields.map((f) => (
          <code
            key={f.key}
            className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-foreground"
          >
            {f.key}
          </code>
        ))}
      </div>
    </div>
  );
}

// ─── Run history panel ───────────────────────────────────────────────────────

const STATUS_VARIANTS: Record<
  string,
  "secondary" | "outline" | "destructive" | "default"
> = {
  pending: "outline",
  completed: "secondary",
  failed: "destructive",
  awaiting_payment: "default",
};

function isSkipped(run: RunRow): boolean {
  if (!run.result) return false;
  try {
    return (JSON.parse(run.result) as { skipped?: boolean }).skipped === true;
  } catch {
    return false;
  }
}

function RunHistoryPanel({
  runs,
  typeLabels,
  onReplay,
}: {
  runs: RunRow[] | undefined;
  typeLabels: Record<string, string>;
  onReplay: (runId: Id<"form_action_runs">) => void;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <h2 className="text-lg font-medium text-foreground">Recent runs</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        The latest action runs for this form. Failed runs can be replayed.
      </p>
      {runs === undefined ? (
        <div className="mt-4 flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : runs.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No runs yet.</p>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          {runs.map((run) => {
            const skipped = isSkipped(run);
            return (
              <div
                key={run._id}
                className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2"
              >
                <Badge variant="secondary">{typeLabels[run.type] ?? run.type}</Badge>
                <Badge variant={STATUS_VARIANTS[run.status] ?? "outline"}>
                  {skipped ? "skipped" : run.status}
                </Badge>
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {run.error
                    ? run.error
                    : `attempts: ${run.attempts} · ${new Date(
                        run.updatedAt,
                      ).toLocaleString()}`}
                </span>
                {run.status === "failed" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onReplay(run._id)}
                  >
                    <RotateCcwIcon className="size-3.5" data-icon="inline-start" />
                    Replay
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function PermissionDenied() {
  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <ShieldOff className="mx-auto mb-3 size-8 text-muted-foreground/40" />
        <h1 className="text-lg font-semibold text-foreground">
          Insufficient permissions
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You don&apos;t have permission to manage form actions.
        </p>
        <Link to="/forms" className="mt-4 inline-block">
          <Button variant="outline">Back to Forms</Button>
        </Link>
      </div>
    </div>
  );
}
