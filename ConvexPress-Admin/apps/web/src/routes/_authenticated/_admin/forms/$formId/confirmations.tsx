import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  LoaderIcon,
  PencilIcon,
  PlusIcon,
  ShieldOff,
  StarIcon,
  TrashIcon,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import type { Capability } from "@backend/convex/types/capabilities";
import { ConditionalLogicBuilder } from "@/components/custom-fields/ConditionalLogicBuilder";
import { PluginGuard } from "@/components/plugins/PluginGuard";
import { useCan } from "@/hooks/useCan";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

const formCap = (cap: string): Capability => cap as Capability;

type ConfirmationType = "message" | "redirect" | "page";

interface ConfirmationRow {
  _id: Id<"form_confirmations">;
  formId: Id<"forms">;
  name: string;
  type: ConfirmationType;
  content?: string;
  redirectUrl?: string;
  pageId?: string;
  conditionalLogic?: string;
  isDefault: boolean;
  order: number;
}

interface SiblingField {
  _id: string;
  label: string;
  name: string;
  key: string;
  type: string;
}

const TYPE_LABELS: Record<ConfirmationType, string> = {
  message: "Message",
  redirect: "Redirect",
  page: "Page",
};

const MERGE_TAG_HINTS = [
  "{field:<name>}",
  "{form:title}",
  "{form:slug}",
  "{entry:id}",
  "{entry:date}",
];

export const Route = createFileRoute(
  "/_authenticated/_admin/forms/$formId/confirmations",
)({
  component: ConfirmationsPage,
});

function ConfirmationsPage() {
  const { formId } = Route.useParams();
  return (
    <PluginGuard pluginId="forms">
      <ConfirmationsContent formId={formId as Id<"forms">} />
    </PluginGuard>
  );
}

function ConfirmationsContent({ formId }: { formId: Id<"forms"> }) {
  const canManage = useCan(formCap("form.manage_confirmations"));

  const form = useQuery(api.extensions.forms.queries.getForm, { id: formId });
  const fieldGroupId = form?.fieldGroupId;
  const fields = useQuery(
    api.customFields.queries.getFieldsByGroup,
    fieldGroupId ? { groupId: fieldGroupId } : "skip",
  );
  const rows = useQuery(
    api.extensions.forms.confirmations.listConfirmations,
    canManage ? { formId } : "skip",
  ) as ConfirmationRow[] | undefined;

  const ensureDefault = useMutation(
    api.extensions.forms.confirmations.ensureDefaultConfirmation,
  );
  const createRow = useMutation(
    api.extensions.forms.confirmations.createConfirmation,
  );
  const updateRow = useMutation(
    api.extensions.forms.confirmations.updateConfirmation,
  );
  const reorderRows = useMutation(
    api.extensions.forms.confirmations.reorderConfirmations,
  );
  const setDefault = useMutation(
    api.extensions.forms.confirmations.setDefaultConfirmation,
  );
  const deleteRow = useMutation(
    api.extensions.forms.confirmations.deleteConfirmation,
  );

  const [editingId, setEditingId] = useState<Id<"form_confirmations"> | null>(
    null,
  );
  const [isCreating, setIsCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ConfirmationRow | null>(null);
  const ensureDefaultInFlight = useRef<Id<"forms"> | null>(null);

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

  useEffect(() => {
    if (!canManage || rows === undefined) return;
    if (rows.some((row) => row.isDefault)) {
      ensureDefaultInFlight.current = null;
      return;
    }
    if (ensureDefaultInFlight.current === formId) return;

    ensureDefaultInFlight.current = formId;
    void ensureDefault({ formId }).catch(() => {
      ensureDefaultInFlight.current = null;
      toast.error("Failed to prepare the default confirmation.");
    });
  }, [canManage, ensureDefault, formId, rows]);

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

  // Reorder controls operate over the non-default rows (default always last).
  const reorderable = rows.filter((r) => !r.isDefault);

  const moveRow = (row: ConfirmationRow, direction: -1 | 1) => {
    const index = reorderable.findIndex((r) => r._id === row._id);
    const target = index + direction;
    if (index === -1 || target < 0 || target >= reorderable.length) return;
    const next = [...reorderable];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    void reorderRows({ formId, order: next.map((r) => r._id) }).catch(() =>
      toast.error("Failed to reorder confirmations."),
    );
  };

  const handleSetDefault = (row: ConfirmationRow) => {
    void setDefault({ formId, confirmationId: row._id })
      .then(() => toast.success("Default confirmation updated."))
      .catch(() => toast.error("Failed to set default."));
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    void deleteRow({ confirmationId: target._id })
      .then(() => {
        toast.success("Confirmation deleted.");
        if (editingId === target._id) setEditingId(null);
      })
      .catch((error) =>
        toast.error(
          error instanceof Error ? error.message : "Failed to delete confirmation.",
        ),
      );
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Confirmations
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            What the respondent sees after submitting &ldquo;{form.title}&rdquo;.
            The first matching confirmation wins; the default is the fallback.
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
            Add Confirmation
          </Button>
        </div>
      </div>

      {isCreating ? (
        <ConfirmationEditor
          siblingFields={siblingFields}
          onCancel={() => setIsCreating(false)}
          onSave={async (values) => {
            try {
              await createRow({ formId, ...values });
              toast.success("Confirmation created.");
              setIsCreating(false);
            } catch (error) {
              toast.error(
                error instanceof Error
                  ? error.message
                  : "Failed to create confirmation.",
              );
            }
          }}
        />
      ) : null}

      <div className="flex flex-col gap-3">
        {rows.length === 0 ? (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
            <LoaderIcon className="size-4 animate-spin" data-icon="inline-start" />
            Preparing default confirmation...
          </div>
        ) : (
          rows.map((row) =>
          editingId === row._id ? (
            <ConfirmationEditor
              key={row._id}
              siblingFields={siblingFields}
              initial={row}
              onCancel={() => setEditingId(null)}
              onSave={async (values) => {
                try {
                  await updateRow({ confirmationId: row._id, patch: values });
                  toast.success("Confirmation saved.");
                  setEditingId(null);
                } catch (error) {
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Failed to save confirmation.",
                  );
                }
              }}
            />
          ) : (
            <ConfirmationRowItem
              key={row._id}
              row={row}
              canMoveUp={
                !row.isDefault &&
                reorderable.findIndex((r) => r._id === row._id) > 0
              }
              canMoveDown={
                !row.isDefault &&
                reorderable.findIndex((r) => r._id === row._id) <
                  reorderable.length - 1
              }
              onMoveUp={() => moveRow(row, -1)}
              onMoveDown={() => moveRow(row, 1)}
              onEdit={() => {
                setEditingId(row._id);
                setIsCreating(false);
              }}
              onSetDefault={() => handleSetDefault(row)}
              onDelete={() => setDeleteTarget(row)}
            />
          ),
          )
        )}
      </div>

      <MergeTagHint />

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete confirmation?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.isDefault
                ? "You can't delete the default confirmation. Set another confirmation as the default first."
                : `This permanently deletes "${deleteTarget?.name}". This cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {!deleteTarget?.isDefault ? (
              <AlertDialogAction onClick={confirmDelete}>
                Delete
              </AlertDialogAction>
            ) : null}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ConfirmationRowItem({
  row,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onEdit,
  onSetDefault,
  onDelete,
}: {
  row: ConfirmationRow;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onEdit: () => void;
  onSetDefault: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex shrink-0 flex-col">
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onMoveUp}
          disabled={!canMoveUp}
          aria-label="Move up"
        >
          <ChevronUpIcon className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onMoveDown}
          disabled={!canMoveDown}
          aria-label="Move down"
        >
          <ChevronDownIcon className="size-3.5" />
        </Button>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">
            {row.name}
          </span>
          <Badge variant="outline">{TYPE_LABELS[row.type]}</Badge>
          {row.isDefault ? <Badge variant="secondary">Default</Badge> : null}
        </div>
        <span className="truncate text-xs text-muted-foreground">
          {row.type === "redirect"
            ? row.redirectUrl || "No URL set"
            : row.type === "page"
              ? row.pageId || "No path set"
              : row.conditionalLogic
                ? "Conditional message"
                : "Message"}
        </span>
      </div>

      {!row.isDefault ? (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onSetDefault}
          aria-label="Set as default"
          title="Set as default"
        >
          <StarIcon className="size-3.5" />
        </Button>
      ) : null}
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onEdit}
        aria-label="Edit confirmation"
      >
        <PencilIcon className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onDelete}
        aria-label="Delete confirmation"
        className="text-muted-foreground hover:text-destructive"
      >
        <TrashIcon className="size-3.5" />
      </Button>
    </div>
  );
}

interface ConfirmationEditorValues {
  name: string;
  type: ConfirmationType;
  content?: string;
  redirectUrl?: string;
  pageId?: string;
  conditionalLogic?: string;
}

function ConfirmationEditor({
  siblingFields,
  initial,
  onCancel,
  onSave,
}: {
  siblingFields: SiblingField[];
  initial?: ConfirmationRow;
  onCancel: () => void;
  onSave: (values: ConfirmationEditorValues) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState<ConfirmationType>(initial?.type ?? "message");
  const [content, setContent] = useState(initial?.content ?? "");
  const [redirectUrl, setRedirectUrl] = useState(initial?.redirectUrl ?? "");
  const [pageId, setPageId] = useState(initial?.pageId ?? "");
  const [conditionalLogic, setConditionalLogic] = useState<string | undefined>(
    initial?.conditionalLogic,
  );
  const [isSaving, setIsSaving] = useState(false);

  // Same-origin / relative URL feedback for the redirect type (client hint;
  // the backend host allow-list is authoritative).
  const redirectAllowed = useMemo(() => {
    const trimmed = redirectUrl.trim();
    if (!trimmed) return true;
    if (/^(javascript|data|vbscript|blob):/i.test(trimmed)) return false;
    if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return true;
    try {
      const parsed = new URL(trimmed, "https://placeholder.invalid");
      return parsed.host === "placeholder.invalid";
    } catch {
      return false;
    }
  }, [redirectUrl]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Confirmation name is required.");
      return;
    }
    if (type === "redirect" && !redirectAllowed) {
      toast.error("Redirect URL host is not allowed. Use a relative path.");
      return;
    }
    setIsSaving(true);
    try {
      await onSave({
        name: name.trim(),
        type,
        content: type === "message" ? content : undefined,
        redirectUrl: type === "redirect" ? redirectUrl.trim() || undefined : undefined,
        pageId: type === "page" ? pageId.trim() || undefined : undefined,
        conditionalLogic,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="rounded-lg border border-primary/40 bg-card p-5">
      <h2 className="text-lg font-medium text-foreground">
        {initial ? "Edit confirmation" : "New confirmation"}
        {initial?.isDefault ? (
          <Badge variant="secondary" className="ml-2 align-middle">
            Default
          </Badge>
        ) : null}
      </h2>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="grid gap-2">
          <label className="text-sm font-medium" htmlFor="conf-name">
            Name
          </label>
          <Input
            id="conf-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Default Confirmation"
          />
        </div>

        <div className="grid gap-2">
          <span className="text-sm font-medium">Type</span>
          <Select
            value={type}
            onValueChange={(v) => setType(v as ConfirmationType)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="message">Message</SelectItem>
              <SelectItem value="redirect">Redirect</SelectItem>
              <SelectItem value="page">Page</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-4">
        {type === "message" ? (
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="conf-content">
              Message (HTML)
            </label>
            <Textarea
              id="conf-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
              className="font-mono"
              placeholder="<p>Thank you for your submission.</p>"
            />
          </div>
        ) : type === "redirect" ? (
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="conf-redirect">
              Redirect URL
            </label>
            <Input
              id="conf-redirect"
              value={redirectUrl}
              onChange={(e) => setRedirectUrl(e.target.value)}
              placeholder="/thank-you"
              aria-invalid={!redirectAllowed}
            />
            {!redirectAllowed ? (
              <p className="text-xs text-destructive">
                External hosts are not allowed. Use a relative path (e.g.
                /thank-you).
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Same-origin / relative paths only.
              </p>
            )}
          </div>
        ) : (
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="conf-page">
              Page path
            </label>
            <Input
              id="conf-page"
              value={pageId}
              onChange={(e) => setPageId(e.target.value)}
              placeholder="/about"
            />
            <p className="text-xs text-muted-foreground">
              The respondent is routed to this path after submitting.
            </p>
          </div>
        )}
      </div>

      <div className="mt-5 border-t border-border pt-4">
        <h3 className="text-sm font-medium text-foreground">
          Conditional logic
        </h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Show this confirmation only when the submitted answers match these
          rules. The default confirmation ignores logic and is always the
          fallback.
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
    <section className="rounded-lg border border-dashed border-border bg-muted/10 px-4 py-3">
      <p className="text-xs font-medium text-foreground">
        Available merge tags (message type)
      </p>
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
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <ShieldOff className="mx-auto mb-3 size-8 text-muted-foreground/40" />
        <h1 className="text-lg font-semibold text-foreground">
          Insufficient permissions
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You don&apos;t have permission to manage form confirmations.
        </p>
        <Link to="/forms" className="mt-4 inline-block">
          <Button variant="outline">Back to Forms</Button>
        </Link>
      </div>
    </div>
  );
}
