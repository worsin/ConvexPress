import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import type { FunctionReturnType } from "convex/server";
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
import { ConditionalLogicBuilder } from "@/components/custom-fields/ConditionalLogicBuilder";
import {
  parseConfig,
  readSubscriptionConfig,
  stringMapOf,
  subscriptionConfigProblems,
  textOf,
  withConfig,
  writeSubscriptionConfig,
  type ConfigBag,
  type SubscriptionConfig,
} from "@/components/forms/actions/actionConfig";
import {
  SubscriptionActionEditor,
  offerSummary,
  type ActionEditorSetup,
} from "@/components/forms/actions/SubscriptionActionEditor";
import { PluginGuard } from "@/components/plugins/PluginGuard";
import { Field, inputClass } from "@/components/subscriptions/catalog/fields";
import { useCan } from "@/hooks/useCan";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { asId, cn, getErrorMessage } from "@/lib/utils";

/**
 * Form Actions & Feeds — admin editor.
 *
 * Full-page (no modal editors; confirm dialog only for delete): PluginGuard,
 * useCan, cache useQuery, dnd-kit reorder. Each action type has its own config
 * editor; the subscription/payment editor picks plans by name and price, maps
 * a choice field to plans, and reads the form's account setting. Configs are
 * read and written with their types (`actionConfig.ts`). A run-history panel
 * shows recent runs and replays failed ones.
 */

type ActionRow = FunctionReturnType<typeof api.extensions.forms.actions.listActions>[number];
type RunRow = FunctionReturnType<typeof api.extensions.forms.actions.listRecentRuns>[number];
type SetupField = ActionEditorSetup["fields"][number];

const CHECKOUT_TYPES = new Set(["subscription", "payment"]);
const DEFAULT_LABELS: Record<string, string> = {
  subscription: "Start subscription",
  payment: "Take payment",
  webhook: "Send to webhook",
  lead_capture: "Send lead to CRM",
  email_marketing: "Add to mailing list",
};

export const Route = createFileRoute(
  "/_authenticated/_admin/forms/$formId/actions",
)({
  component: ActionsPage,
});

function ActionsPage() {
  const { formId } = Route.useParams();
  return (
    <PluginGuard pluginId="forms">
      <ActionsContent formId={asId<"forms">(formId)} />
    </PluginGuard>
  );
}

function ActionsContent({ formId }: { formId: Id<"forms"> }) {
  const canManage = useCan("form.manage_actions");

  const form = useQuery(api.extensions.forms.queries.getForm, { id: formId });
  const setup = useQuery(api.extensions.forms.actions.actionEditorSetup, canManage ? { formId } : "skip");
  const rows = useQuery(api.extensions.forms.actions.listActions, canManage ? { formId } : "skip");
  const actionTypes = useQuery(api.extensions.forms.actions.availableActionTypes, canManage ? {} : "skip");
  const recentRuns = useQuery(api.extensions.forms.actions.listRecentRuns, canManage ? { formId } : "skip");

  const createAction = useMutation(api.extensions.forms.actions.createAction);
  const updateAction = useMutation(api.extensions.forms.actions.updateAction);
  const reorderActions = useMutation(api.extensions.forms.actions.reorderActions);
  const deleteAction = useMutation(api.extensions.forms.actions.deleteAction);
  const replayRun = useMutation(api.extensions.forms.actions.replayRun);

  const [editingId, setEditingId] = useState<Id<"form_actions"> | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ActionRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const typeLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    for (const t of actionTypes ?? []) labels[t.type] = t.label;
    return labels;
  }, [actionTypes]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  if (!canManage) return <PermissionDenied />;

  if (form === undefined || rows === undefined || setup === undefined) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (form === null || setup === null) return null; // the form layout shows not-found

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = rows.findIndex((r) => r._id === active.id);
    const newIndex = rows.findIndex((r) => r._id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(rows, oldIndex, newIndex);
    void reorderActions({ formId, orderedIds: reordered.map((r) => r._id) }).catch(() =>
      toast.error("Couldn't reorder the actions."),
    );
  };

  const toggleEnabled = (row: ActionRow, enabled: boolean) => {
    void updateAction({ actionId: row._id, enabled })
      .then(() => toast.success(enabled ? "Action turned on." : "Action turned off."))
      .catch((error: unknown) => toast.error(getErrorMessage(error, "Couldn't update the action.")));
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      await deleteAction({ actionId: pendingDelete._id });
      toast.success("Action deleted.");
      if (editingId === pendingDelete._id) setEditingId(null);
      setPendingDelete(null);
    } catch (error) {
      toast.error(getErrorMessage(error, "Couldn't delete the action."));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Actions</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            What happens when &ldquo;{form.title}&rdquo; is submitted: start a subscription, take a payment, or send the answers
            on. Actions run in order; each can have conditions, and failures are retried.
          </p>
        </div>
        <div className="flex items-center gap-2">
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
          formId={formId}
          availableTypes={actionTypes ?? []}
          setup={setup}
          onCancel={() => setIsCreating(false)}
          onSave={async (values) => {
            await createAction({
              formId,
              type: values.type,
              label: values.label,
              config: values.config,
              conditionalLogic: values.conditionalLogic ?? undefined,
            });
            toast.success("Action created.");
            setIsCreating(false);
          }}
        />
      ) : null}

      {rows.length === 0 && !isCreating ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-10 text-center">
          <p className="text-sm text-muted-foreground">No actions yet. Choose &ldquo;Add Action&rdquo; to create one.</p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={rows.map((r) => r._id)} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-3">
              {rows.map((row) =>
                editingId === row._id ? (
                  <ActionEditor
                    key={row._id}
                    formId={formId}
                    availableTypes={actionTypes ?? []}
                    setup={setup}
                    initial={row}
                    onCancel={() => setEditingId(null)}
                    onSave={async (values) => {
                      await updateAction({
                        actionId: row._id,
                        label: values.label,
                        config: values.config,
                        conditionalLogic: values.conditionalLogic,
                      });
                      toast.success("Action saved.");
                      setEditingId(null);
                    }}
                  />
                ) : (
                  <SortableActionRow
                    key={row._id}
                    row={row}
                    setup={setup}
                    typeLabel={typeLabels[row.type] ?? row.type}
                    onEdit={() => {
                      setEditingId(row._id);
                      setIsCreating(false);
                    }}
                    onDelete={() => setPendingDelete(row)}
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
            .then((r) => (r?.replayed ? toast.success("Run queued again.") : toast.info("Completed runs aren't replayed.")))
            .catch((error: unknown) => toast.error(getErrorMessage(error, "Couldn't replay the run.")))
        }
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => {
          if (!isDeleting) setPendingDelete(null);
        }}
        onConfirm={() => void confirmDelete()}
        title="Delete this action?"
        message={`Delete "${pendingDelete?.label ?? "this action"}"? Its run history is kept.`}
        confirmLabel="Delete"
        destructive
        isExecuting={isDeleting}
      />
    </div>
  );
}

/** One line under an action's name saying what it does. */
function actionSummary(row: ActionRow, setup: ActionEditorSetup): string {
  const config = parseConfig(row.config);
  if (CHECKOUT_TYPES.has(row.type)) {
    const subscription = readSubscriptionConfig(config);
    if (subscription.offerMode === "fixed") {
      const offer = setup.offers.find((o) => o._id === subscription.offerId);
      return offer ? offerSummary(offer) : "Plan missing: edit to choose one";
    }
    const field = setup.fields.find((f) => f.key === subscription.offerFieldName);
    return field ? `The plan picked in "${field.label || field.name}"` : "Plan field missing: edit to choose one";
  }
  if (row.type === "webhook") return textOf(config, "url") || "No URL yet";
  if (row.type === "email_marketing") return textOf(config, "listId") ? `List ${textOf(config, "listId")}` : "No list yet";
  if (row.type === "lead_capture") return textOf(config, "endpoint") || "Stored as a lead";
  return "";
}

function SortableActionRow({
  row,
  setup,
  typeLabel,
  onEdit,
  onDelete,
  onToggleEnabled,
}: {
  row: ActionRow;
  setup: ActionEditorSetup;
  typeLabel: string;
  onEdit: () => void;
  onDelete: () => void;
  onToggleEnabled: (enabled: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row._id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };
  const enabledId = `action-enabled-${row._id}`;

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
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
          <span className="truncate text-sm font-medium text-foreground">{row.label}</span>
          <Badge variant="secondary">{typeLabel}</Badge>
          {row.conditionalLogic ? <Badge variant="outline">Conditional</Badge> : null}
        </div>
        <span className="truncate text-xs text-muted-foreground">{actionSummary(row, setup)}</span>
      </div>

      <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
        <Checkbox
          id={enabledId}
          checked={row.enabled}
          onCheckedChange={(checked) => onToggleEnabled(checked === true)}
          aria-labelledby={`${enabledId}-label`}
        />
        <span id={`${enabledId}-label`}>{row.enabled ? "On" : "Off"}</span>
      </div>

      <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label={`Edit ${row.label}`}>
        <PencilIcon className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onDelete}
        aria-label={`Delete ${row.label}`}
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
  /** null removes the conditions (always run). */
  conditionalLogic: string | null;
}

function ActionEditor({
  formId,
  availableTypes,
  setup,
  initial,
  onCancel,
  onSave,
}: {
  formId: Id<"forms">;
  availableTypes: Array<{ type: string; label: string }>;
  setup: ActionEditorSetup;
  initial?: ActionRow;
  onCancel: () => void;
  onSave: (values: EditorValues) => Promise<void>;
}) {
  const [type, setType] = useState(initial?.type ?? availableTypes[0]?.type ?? "subscription");
  const [label, setLabel] = useState(initial?.label ?? "");
  const [config, setConfig] = useState<ConfigBag>(() => parseConfig(initial?.config));
  const [subscription, setSubscription] = useState<SubscriptionConfig>(() =>
    readSubscriptionConfig(parseConfig(initial?.config)),
  );
  const [conditionalLogic, setConditionalLogic] = useState<string | undefined>(initial?.conditionalLogic);
  const [showProblems, setShowProblems] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const isCheckout = CHECKOUT_TYPES.has(type);
  const planField = setup.fields.find((field) => field.key === subscription.offerFieldName);
  const problems = isCheckout ? subscriptionConfigProblems(subscription, planField?.choices.length ?? 0) : {};
  const hasProblems = Object.keys(problems).length > 0;

  const handleSave = async () => {
    const name = label.trim() || DEFAULT_LABELS[type] || "";
    if (!name) {
      setError("Give the action a name.");
      return;
    }
    if (hasProblems) {
      setShowProblems(true);
      setError("Some settings need attention before this action can be saved.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await onSave({
        type,
        label: name,
        config: JSON.stringify(isCheckout ? writeSubscriptionConfig(subscription) : config),
        conditionalLogic: conditionalLogic ?? null,
      });
    } catch (saveError) {
      setError(getErrorMessage(saveError, "Couldn't save the action."));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="rounded-lg border border-primary/40 bg-card p-5">
      <h2 className="text-lg font-medium text-foreground">{initial ? "Edit action" : "New action"}</h2>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label="Name" htmlFor="action-label" helper="Shown in this list and in the run history.">
          <input
            id="action-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={DEFAULT_LABELS[type] ?? "Name this action"}
            className={inputClass}
          />
        </Field>

        <Field label="Type" htmlFor="action-type" locked={initial ? "The type is fixed once the action exists." : undefined}>
          <select
            id="action-type"
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              // A new action starts its config over, so a stale shape isn't saved.
              setConfig({});
              setSubscription(readSubscriptionConfig({}));
              setShowProblems(false);
            }}
            disabled={Boolean(initial)}
            className={inputClass}
          >
            {availableTypes.map((t) => (
              <option key={t.type} value={t.type}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="mt-5 border-t border-border pt-4">
        {isCheckout ? (
          <SubscriptionActionEditor
            formId={formId}
            setup={setup}
            config={subscription}
            problems={showProblems ? problems : {}}
            onChange={setSubscription}
          />
        ) : (
          <FeedConfigEditor type={type} config={config} onChange={setConfig} fields={setup.fields} />
        )}
      </div>

      <div className="mt-5 border-t border-border pt-4">
        <h3 className="text-sm font-medium text-foreground">Conditions</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Run this action only when the answers match these rules. With no rules it always runs.
        </p>
        <ConditionalLogicBuilder
          value={conditionalLogic}
          onChange={setConditionalLogic}
          siblingFields={setup.fields}
          subject="this action"
          verbs={{ show: "Run", hide: "Skip" }}
        />
      </div>

      {error ? (
        <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

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

// ─── Feed config editors (webhook, CRM, mailing list) ─────────────────────────

function FeedConfigEditor({
  type,
  config,
  onChange,
  fields,
}: {
  type: string;
  config: ConfigBag;
  onChange: (next: ConfigBag) => void;
  fields: SetupField[];
}) {
  const set = (patch: Record<string, string | Record<string, string> | undefined>) => onChange(withConfig(config, patch));
  const text = (key: string, label: string, options: { placeholder?: string; helper?: string; secret?: boolean } = {}) => (
    <Field label={label} htmlFor={`action-${key}`} helper={options.helper}>
      <input
        id={`action-${key}`}
        type={options.secret ? "password" : "text"}
        autoComplete="off"
        value={textOf(config, key)}
        onChange={(e) => set({ [key]: e.target.value })}
        placeholder={options.placeholder}
        className={inputClass}
      />
    </Field>
  );

  if (type === "webhook") {
    return (
      <div className="grid gap-4">
        {text("url", "URL", { placeholder: "https://example.com/hook", helper: "An https address that receives the answers as JSON." })}
        {text("secret", "Signing secret", {
          secret: true,
          helper: "Optional. Signs each request in the x-convexpress-signature header.",
        })}
        <Field label="Body" htmlFor="action-bodyTemplate" helper="Optional. {field_key} tokens are replaced by answers; empty sends every answer.">
          <textarea
            id="action-bodyTemplate"
            rows={4}
            value={textOf(config, "bodyTemplate")}
            onChange={(e) => set({ bodyTemplate: e.target.value })}
            placeholder={'{"email":"{email}","name":"{name}"}'}
            className={cn(inputClass, "font-mono text-xs")}
          />
        </Field>
        <FieldKeyHint fields={fields} />
      </div>
    );
  }

  if (type === "lead_capture") {
    return (
      <div className="grid gap-4">
        {text("endpoint", "CRM endpoint", { placeholder: "https://crm.example.com/api/contacts", helper: "Optional. Empty stores the lead here only." })}
        {text("apiKey", "API key", { secret: true, helper: "Optional. Sent as a bearer token." })}
        <FieldMapEditor
          label="Answers to CRM properties"
          value={stringMapOf(config, "fieldMap")}
          onChange={(fieldMap) => set({ fieldMap })}
          fields={fields}
        />
      </div>
    );
  }

  if (type === "email_marketing") {
    return (
      <div className="grid gap-4">
        {text("endpoint", "Provider endpoint", { placeholder: "https://provider.example.com/api/subscribe" })}
        {text("apiKey", "API key", { secret: true })}
        {text("listId", "List or audience id")}
        <Field label="Email field" htmlFor="action-emailFieldKey">
          <select
            id="action-emailFieldKey"
            value={textOf(config, "emailFieldKey")}
            onChange={(e) => set({ emailFieldKey: e.target.value })}
            className={inputClass}
          >
            <option value="">Choose a field</option>
            {fields.map((field) => (
              <option key={field.key} value={field.key}>
                {field.label || field.name}
              </option>
            ))}
          </select>
        </Field>
        <FieldMapEditor
          label="Answers to merge tags"
          value={stringMapOf(config, "mergeFields")}
          onChange={(mergeFields) => set({ mergeFields })}
          fields={fields}
        />
      </div>
    );
  }

  return <p className="text-sm text-muted-foreground">There is no editor for &ldquo;{type}&rdquo; actions.</p>;
}

function FieldMapEditor({
  label,
  value,
  onChange,
  fields,
}: {
  label: string;
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  fields: SetupField[];
}) {
  const fieldLabel = (key: string) => {
    const field = fields.find((f) => f.key === key);
    return field ? field.label || field.name : key;
  };
  const unused = fields.filter((f) => !(f.key in value));
  return (
    <div className="grid gap-2">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {Object.keys(value).length === 0 ? (
        <p className="text-xs text-muted-foreground">Nothing mapped yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {Object.entries(value).map(([key, prop]) => (
            <div key={key} className="flex items-center gap-2">
              <span className="w-40 shrink-0 truncate text-sm text-foreground">{fieldLabel(key)}</span>
              <span className="text-muted-foreground" aria-hidden>
                →
              </span>
              <input
                aria-label={`${fieldLabel(key)} maps to`}
                value={prop}
                onChange={(e) => onChange({ ...value, [key]: e.target.value })}
                placeholder="property name"
                className={inputClass}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  const next = { ...value };
                  delete next[key];
                  onChange(next);
                }}
                aria-label={`Remove ${fieldLabel(key)}`}
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
        onClick={() => {
          const first = unused[0];
          if (first) onChange({ ...value, [first.key]: "" });
        }}
        disabled={unused.length === 0}
      >
        <PlusIcon className="size-3.5" data-icon="inline-start" />
        Add mapping
      </Button>
    </div>
  );
}

function FieldKeyHint({ fields }: { fields: SetupField[] }) {
  if (fields.length === 0) return null;
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/10 px-3 py-2">
      <p className="text-[11px] font-medium text-foreground">Tokens for this form's fields</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {fields.map((f) => (
          <code key={f.key} title={f.label} className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-foreground">
            {`{${f.key}}`}
          </code>
        ))}
      </div>
    </div>
  );
}

// ─── Run history panel ───────────────────────────────────────────────────────

type BadgeVariant = "secondary" | "outline" | "destructive" | "default";

const RUN_STATUS: Record<RunRow["status"], { label: string; variant: BadgeVariant }> = {
  pending: { label: "Pending", variant: "outline" },
  completed: { label: "Done", variant: "secondary" },
  failed: { label: "Failed", variant: "destructive" },
  awaiting_payment: { label: "Awaiting payment", variant: "default" },
};

const SKIPPED_STATUS: { label: string; variant: BadgeVariant } = { label: "Skipped (conditions)", variant: "outline" };

function isSkipped(run: RunRow): boolean {
  return parseConfig(run.result).skipped === true;
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
      <p className="mt-1 text-xs text-muted-foreground">The latest runs for this form. A failed run can be replayed.</p>
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
            const status = isSkipped(run) ? SKIPPED_STATUS : RUN_STATUS[run.status];
            return (
              <div key={run._id} className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2">
                <Badge variant="secondary">{typeLabels[run.type] ?? run.type}</Badge>
                <Badge variant={status.variant}>{status.label}</Badge>
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {run.error ?? `${run.attempts} ${run.attempts === 1 ? "attempt" : "attempts"} · ${new Date(run.updatedAt).toLocaleString()}`}
                </span>
                {run.status === "failed" ? (
                  <Button variant="outline" size="sm" onClick={() => onReplay(run._id)}>
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
        <h1 className="text-lg font-semibold text-foreground">Insufficient permissions</h1>
        <p className="mt-2 text-sm text-muted-foreground">You don&apos;t have permission to manage form actions.</p>
        <Link to="/forms" className="mt-4 inline-block">
          <Button variant="outline">Back to Forms</Button>
        </Link>
      </div>
    </div>
  );
}
