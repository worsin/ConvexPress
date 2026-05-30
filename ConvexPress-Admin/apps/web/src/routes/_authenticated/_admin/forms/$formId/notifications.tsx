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

/**
 * Cast a `form.*` capability string to `Capability`. Mirrors the backend
 * helper — the form capabilities are surfaced here but registered by the
 * Role/Capability expert, so they aren't in the closed `Capability` union yet.
 */
const formCap = (cap: string): Capability => cap as Capability;

type Channel = "email" | "site";
type RecipientType = "admin" | "customer";
type TriggerEventCode =
  | "form.submitted"
  | "form.progress_saved"
  | "form.action_failed";

interface NotificationRow {
  _id: Id<"form_notifications">;
  formId: Id<"forms">;
  name: string;
  channel: Channel;
  recipientType: RecipientType;
  toExpression?: string;
  subjectTemplate?: string;
  messageTemplate?: string;
  triggerEventCode: string;
  conditionalLogic?: string;
  enabled: boolean;
  order: number;
}

interface SiblingField {
  _id: string;
  label: string;
  name: string;
  key: string;
  type: string;
}

const TRIGGER_LABELS: Record<string, string> = {
  "form.submitted": "On submission",
  "form.progress_saved": "On progress saved",
  "form.action_failed": "On action failed",
};

const MERGE_TAG_HINTS = [
  "{field:<name>}",
  "{form:title}",
  "{form:resume_url}",
  "{settings:admin_notification_email}",
  "{all_fields}",
  "{action:error}",
];

export const Route = createFileRoute(
  "/_authenticated/_admin/forms/$formId/notifications",
)({
  component: NotificationsPage,
});

function NotificationsPage() {
  const { formId } = Route.useParams();
  return (
    <PluginGuard pluginId="forms">
      <NotificationsContent formId={formId as Id<"forms">} />
    </PluginGuard>
  );
}

function NotificationsContent({ formId }: { formId: Id<"forms"> }) {
  const canManage = useCan(formCap("form.manage_notifications"));

  const form = useQuery(api.extensions.forms.queries.getForm, { id: formId });
  const fieldGroupId = form?.fieldGroupId;
  const fields = useQuery(
    api.customFields.queries.getFieldsByGroup,
    fieldGroupId ? { groupId: fieldGroupId } : "skip",
  );
  const rows = useQuery(
    api.extensions.forms.notifications.listForForm,
    canManage ? { formId } : "skip",
  ) as NotificationRow[] | undefined;

  const createRow = useMutation(api.extensions.forms.notifications.create);
  const updateRow = useMutation(api.extensions.forms.notifications.update);
  const reorderRows = useMutation(api.extensions.forms.notifications.reorder);
  const removeRow = useMutation(api.extensions.forms.notifications.remove);

  const [editingId, setEditingId] = useState<Id<"form_notifications"> | null>(
    null,
  );
  const [isCreating, setIsCreating] = useState(false);

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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  if (!canManage) {
    return <PermissionDenied />;
  }

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
        <div className="rounded-3xl border border-border bg-card p-8">
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
    void reorderRows({
      formId,
      orderedIds: reordered.map((r) => r._id),
    }).catch(() => toast.error("Failed to reorder notifications."));
  };

  const toggleEnabled = (row: NotificationRow, enabled: boolean) => {
    void updateRow({ notificationId: row._id, patch: { enabled } })
      .then(() => toast.success(enabled ? "Notification enabled." : "Notification disabled."))
      .catch(() => toast.error("Failed to update notification."));
  };

  const handleDelete = (row: NotificationRow) => {
    void removeRow({ notificationId: row._id })
      .then(() => toast.success("Notification deleted."))
      .catch(() => toast.error("Failed to delete notification."));
    if (editingId === row._id) setEditingId(null);
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Notifications
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure who gets notified when &ldquo;{form.title}&rdquo; is
            submitted. Each row resolves merge tags and conditional logic before
            sending.
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
            Add Notification
          </Button>
        </div>
      </div>

      {isCreating ? (
        <NotificationEditor
          formId={formId}
          siblingFields={siblingFields}
          onCancel={() => setIsCreating(false)}
          onSave={async (values) => {
            try {
              await createRow({ formId, ...values });
              toast.success("Notification created.");
              setIsCreating(false);
            } catch (error) {
              toast.error(
                error instanceof Error
                  ? error.message
                  : "Failed to create notification.",
              );
            }
          }}
        />
      ) : null}

      {rows.length === 0 && !isCreating ? (
        <div className="rounded-3xl border border-dashed border-border bg-muted/20 px-4 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            No notifications yet. Click &ldquo;Add Notification&rdquo; to create
            one.
          </p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={sortedIds}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-3">
              {rows.map((row) =>
                editingId === row._id ? (
                  <NotificationEditor
                    key={row._id}
                    formId={formId}
                    siblingFields={siblingFields}
                    initial={row}
                    onCancel={() => setEditingId(null)}
                    onSave={async (values) => {
                      try {
                        await updateRow({
                          notificationId: row._id,
                          patch: values,
                        });
                        toast.success("Notification saved.");
                        setEditingId(null);
                      } catch (error) {
                        toast.error(
                          error instanceof Error
                            ? error.message
                            : "Failed to save notification.",
                        );
                      }
                    }}
                  />
                ) : (
                  <SortableNotificationRow
                    key={row._id}
                    row={row}
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

      <MergeTagHint />
    </div>
  );
}

function SortableNotificationRow({
  row,
  onEdit,
  onDelete,
  onToggleEnabled,
}: {
  row: NotificationRow;
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
      className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3"
    >
      <button
        type="button"
        className="shrink-0 cursor-grab text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing"
        aria-label={`Reorder ${row.name}`}
        {...attributes}
        {...listeners}
      >
        <GripVerticalIcon className="size-4" />
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">
            {row.name}
          </span>
          <Badge variant={row.channel === "email" ? "secondary" : "outline"}>
            {row.channel}
          </Badge>
          <Badge variant="outline">{row.recipientType}</Badge>
        </div>
        <span className="text-xs text-muted-foreground">
          {TRIGGER_LABELS[row.triggerEventCode] ?? row.triggerEventCode}
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

      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onEdit}
        aria-label="Edit notification"
      >
        <PencilIcon className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onDelete}
        aria-label="Delete notification"
        className="text-muted-foreground hover:text-destructive"
      >
        <TrashIcon className="size-3.5" />
      </Button>
    </div>
  );
}

interface EditorValues {
  name: string;
  channel: Channel;
  recipientType: RecipientType;
  toExpression?: string;
  subjectTemplate?: string;
  messageTemplate?: string;
  triggerEventCode: TriggerEventCode;
  conditionalLogic?: string;
  enabled?: boolean;
}

function NotificationEditor({
  formId: _formId,
  siblingFields,
  initial,
  onCancel,
  onSave,
}: {
  formId: Id<"forms">;
  siblingFields: SiblingField[];
  initial?: NotificationRow;
  onCancel: () => void;
  onSave: (values: EditorValues) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [channel, setChannel] = useState<Channel>(initial?.channel ?? "email");
  const [recipientType, setRecipientType] = useState<RecipientType>(
    initial?.recipientType ?? "admin",
  );
  const [toExpression, setToExpression] = useState(initial?.toExpression ?? "");
  const [subjectTemplate, setSubjectTemplate] = useState(
    initial?.subjectTemplate ?? "",
  );
  const [messageTemplate, setMessageTemplate] = useState(
    initial?.messageTemplate ?? "",
  );
  const [triggerEventCode, setTriggerEventCode] = useState<TriggerEventCode>(
    (initial?.triggerEventCode as TriggerEventCode) ?? "form.submitted",
  );
  const [conditionalLogic, setConditionalLogic] = useState<string | undefined>(
    initial?.conditionalLogic,
  );
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Notification name is required.");
      return;
    }
    setIsSaving(true);
    try {
      await onSave({
        name: name.trim(),
        channel,
        recipientType,
        toExpression: toExpression.trim() || undefined,
        subjectTemplate: subjectTemplate.trim() || undefined,
        messageTemplate: messageTemplate.trim() || undefined,
        triggerEventCode,
        conditionalLogic,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="rounded-3xl border border-primary/40 bg-card p-5">
      <h2 className="text-lg font-medium text-foreground">
        {initial ? "Edit notification" : "New notification"}
      </h2>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="grid gap-2">
          <label className="text-sm font-medium" htmlFor="notif-name">
            Name
          </label>
          <Input
            id="notif-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New Form Submission (Admin)"
          />
        </div>

        <div className="grid gap-2">
          <span className="text-sm font-medium">Trigger</span>
          <Select
            value={triggerEventCode}
            onValueChange={(v) => setTriggerEventCode(v as TriggerEventCode)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="form.submitted">On submission</SelectItem>
              <SelectItem value="form.progress_saved">
                On progress saved
              </SelectItem>
              <SelectItem value="form.action_failed">
                On action failed
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2">
          <span className="text-sm font-medium">Channel</span>
          <Select value={channel} onValueChange={(v) => setChannel(v as Channel)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="site">Site (in-app)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2">
          <span className="text-sm font-medium">Recipient</span>
          <Select
            value={recipientType}
            onValueChange={(v) => setRecipientType(v as RecipientType)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="customer">Customer (respondent)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {channel === "email" ? (
          <>
            <div className="grid gap-2 md:col-span-2">
              <label className="text-sm font-medium" htmlFor="notif-to">
                To (merge tag)
              </label>
              <Input
                id="notif-to"
                value={toExpression}
                onChange={(e) => setToExpression(e.target.value)}
                placeholder="{settings:admin_notification_email} or {field:email}"
              />
            </div>
            <div className="grid gap-2 md:col-span-2">
              <label className="text-sm font-medium" htmlFor="notif-subject">
                Subject
              </label>
              <Input
                id="notif-subject"
                value={subjectTemplate}
                onChange={(e) => setSubjectTemplate(e.target.value)}
                placeholder="New {form:title} submission"
              />
            </div>
          </>
        ) : null}

        <div className="grid gap-2 md:col-span-2">
          <label className="text-sm font-medium" htmlFor="notif-message">
            Message
          </label>
          <Textarea
            id="notif-message"
            value={messageTemplate}
            onChange={(e) => setMessageTemplate(e.target.value)}
            rows={5}
            placeholder="<p>A new submission was received.</p>{all_fields}"
          />
        </div>
      </div>

      <div className="mt-5 border-t border-border pt-4">
        <h3 className="text-sm font-medium text-foreground">
          Conditional logic
        </h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Only fire this notification when the submitted answers match these
          rules. Leave empty to always fire.
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

function MergeTagHint() {
  return (
    <section className="rounded-2xl border border-dashed border-border bg-muted/10 px-4 py-3">
      <p className="text-xs font-medium text-foreground">Available merge tags</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {MERGE_TAG_HINTS.map((tag) => (
          <code
            key={tag}
            className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-foreground"
          >
            {tag}
          </code>
        ))}
      </div>
    </section>
  );
}

function PermissionDenied() {
  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="rounded-3xl border border-border bg-card p-8 text-center">
        <ShieldOff className="mx-auto mb-3 size-8 text-muted-foreground/40" />
        <h1 className="text-lg font-semibold text-foreground">
          Insufficient permissions
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You don&apos;t have permission to manage form notifications.
        </p>
        <Link to="/forms" className="mt-4 inline-block">
          <Button variant="outline">Back to Forms</Button>
        </Link>
      </div>
    </div>
  );
}
