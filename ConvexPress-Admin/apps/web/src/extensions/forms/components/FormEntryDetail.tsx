import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import {
  ArrowLeftIcon,
  LoaderIcon,
  MailOpenIcon,
  PencilIcon,
  SaveIcon,
  StarIcon,
  TrashIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { useAuth } from "@/lib/auth-context";
import { useCan } from "@/hooks/useCan";
import { Button } from "@/components/ui/button";
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
import { EntryStatusBadge } from "./FormEntriesPage";

type EntryStatus = "partial" | "complete" | "spam" | "deleted";

interface SubmissionRow {
  _id: Id<"form_submissions">;
  formId: Id<"forms">;
  status: EntryStatus;
  submittedAt?: number;
  completedAt?: number;
  ip?: string;
  userAgent?: string;
  referrer?: string;
  userId?: Id<"users">;
  resumeToken?: string;
  currentStep?: number;
  read?: boolean;
  starred?: boolean;
  meta?: string;
  createdAt: number;
  updatedAt: number;
}

interface FieldValueRow {
  _id: Id<"fieldValues">;
  fieldKey: string;
  fieldName?: string;
  fieldLabel?: string;
  fieldType?: string;
  value: string;
  updatedAt?: number;
}

interface NoteRow {
  _id: Id<"form_submission_notes">;
  body: string;
  authorId: Id<"users">;
  authorName?: string;
  authorEmail?: string;
  createdAt: number;
}

interface SubmissionDetail {
  submission: SubmissionRow;
  values: FieldValueRow[];
  notes: NoteRow[];
  pricing?: unknown;
}

function formatDate(value?: number): string {
  if (!value) return "None";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function displayValue(value: string): string {
  if (!value) return "No answer";
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.join(", ");
    if (parsed && typeof parsed === "object") {
      return JSON.stringify(parsed, null, 2);
    }
  } catch {
    // Plain scalar, use as-is.
  }
  return value;
}

function parseMeta(meta: string | undefined): Record<string, unknown> | null {
  if (!meta) return null;
  try {
    const parsed = JSON.parse(meta);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function FormEntryDetail({
  formId,
  entryId,
}: {
  formId: Id<"forms">;
  entryId: Id<"form_submissions">;
}) {
  const navigate = useNavigate();
  const { isLoading: authLoading } = useAuth();
  const canView = useCan("form.view_entries");
  const canEdit = useCan("form.edit_entry");
  const canDelete = useCan("form.delete_entry");
  const autoMarkedRef = useRef(false);
  const [note, setNote] = useState("");
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const form = useQuery(api.extensions.forms.queries.getForm, { id: formId });
  const detail = useQuery(api.extensions.forms.queries.getSubmission, {
    id: entryId,
  }) as SubmissionDetail | null | undefined;

  const updateEntry = useMutation(api.extensions.forms.mutations.updateEntry);
  const deleteEntry = useMutation(api.extensions.forms.mutations.deleteEntry);
  const addNote = useMutation(api.extensions.forms.mutations.addNote);

  const submission = detail?.submission;
  const isWrongForm =
    detail !== undefined &&
    detail !== null &&
    submission?.formId !== formId;

  useEffect(() => {
    if (
      !submission ||
      autoMarkedRef.current ||
      !canEdit ||
      submission.read === true
    ) {
      return;
    }
    autoMarkedRef.current = true;
    updateEntry({ id: submission._id, formId, read: true }).catch(() => {
      autoMarkedRef.current = false;
    });
  }, [canEdit, formId, submission, updateEntry]);

  const meta = useMemo(() => parseMeta(submission?.meta), [submission?.meta]);

  const handleStatus = async (status: EntryStatus) => {
    if (!submission) return;
    try {
      await updateEntry({ id: submission._id, formId, status });
      toast.success("Entry status updated.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update entry.",
      );
    }
  };

  const handleDelete = async () => {
    if (!submission) return;
    setIsDeleting(true);
    try {
      await deleteEntry({ id: submission._id, formId });
      toast.success("Entry moved to trash.");
      setDeleteConfirmOpen(false);
      await navigate({ to: "/forms/$formId/entries", params: { formId } });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to trash entry.",
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const handleAddNote = async () => {
    const body = note.trim();
    if (!body) {
      toast.error("Note body is required.");
      return;
    }
    setIsSavingNote(true);
    try {
      await addNote({ submissionId: entryId, formId, body });
      setNote("");
      toast.success("Note added.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add note.");
    } finally {
      setIsSavingNote(false);
    }
  };

  const startValueEdit = (value: FieldValueRow) => {
    setEditingKey(value.fieldKey);
    setEditValue(value.value);
  };

  const handleSaveValue = async (fieldKey: string) => {
    if (!submission) return;
    setSavingKey(fieldKey);
    try {
      await updateEntry({
        id: submission._id,
        formId,
        values: [{ fieldKey, value: editValue }],
      });
      setEditingKey(null);
      setEditValue("");
      toast.success("Answer updated.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update answer.",
      );
    } finally {
      setSavingKey(null);
    }
  };

  if (authLoading || form === undefined || detail === undefined) {
    return <EntryDetailSkeleton />;
  }

  if (!canView) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <div className="rounded-lg border border-border bg-card p-8">
          <h1 className="text-xl font-semibold text-foreground">
            Entry unavailable
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your current role cannot view form entries.
          </p>
          <Link
            to="/forms/$formId/edit"
            params={{ formId }}
            className="mt-4 inline-block"
          >
            <Button variant="outline">Back to Builder</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (form === null || detail === null || isWrongForm || !submission) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <div className="rounded-lg border border-border bg-card p-8">
          <h1 className="text-xl font-semibold text-foreground">
            Entry not found
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The requested entry could not be loaded for this form.
          </p>
          <Link to="/forms/$formId/entries" params={{ formId }} className="mt-4 inline-block">
            <Button variant="outline">Back to Entries</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <Link
            to="/forms/$formId/entries"
            params={{ formId }}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeftIcon className="size-4" />
            Entries
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-foreground">
            Entry {String(submission._id)}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Submitted to {String((form as { title?: string }).title ?? "form")}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <EntryStatusBadge status={submission.status} />
          <Button
            variant="outline"
            disabled={!canEdit}
            onClick={() =>
              updateEntry({
                id: submission._id,
                formId,
                read: submission.read !== true,
              }).catch((error: unknown) =>
                toast.error(
                  error instanceof Error
                    ? error.message
                    : "Failed to update entry.",
                ),
              )
            }
          >
            <MailOpenIcon className="size-4" data-icon="inline-start" />
            {submission.read === true ? "Mark unread" : "Mark read"}
          </Button>
          <Button
            variant="outline"
            disabled={!canEdit}
            onClick={() =>
              updateEntry({
                id: submission._id,
                formId,
                starred: submission.starred !== true,
              }).catch((error: unknown) =>
                toast.error(
                  error instanceof Error
                    ? error.message
                    : "Failed to update entry.",
                ),
              )
            }
          >
            <StarIcon
              className={
                submission.starred === true
                  ? "size-4 fill-current text-primary"
                  : "size-4"
              }
              data-icon="inline-start"
            />
            {submission.starred === true ? "Unstar" : "Star"}
          </Button>
          <Button
            variant="outline"
            disabled={!canDelete}
            onClick={() => setDeleteConfirmOpen(true)}
          >
            <TrashIcon className="size-4" data-icon="inline-start" />
            Trash
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="rounded-lg border border-border bg-card">
          <div className="border-b border-border p-4">
            <h2 className="text-lg font-medium text-foreground">Answers</h2>
          </div>
          <div className="divide-y divide-border">
            {detail.values.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">
                No answers were stored for this entry.
              </div>
            ) : (
              detail.values.map((value) => (
                <div key={value._id} className="grid gap-1 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <dt className="min-w-0 text-xs font-medium uppercase text-muted-foreground">
                      <span className="block truncate">
                        {value.fieldLabel ?? value.fieldName ?? value.fieldKey}
                      </span>
                      <span className="mt-1 block normal-case text-muted-foreground/80">
                        {value.fieldKey}
                      </span>
                    </dt>
                    {canEdit && value.fieldType !== "calculation" ? (
                      editingKey === value.fieldKey ? (
                        <div className="flex shrink-0 gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            disabled={savingKey === value.fieldKey}
                            onClick={() => void handleSaveValue(value.fieldKey)}
                          >
                            {savingKey === value.fieldKey ? (
                              <LoaderIcon className="size-4 animate-spin" />
                            ) : (
                              <SaveIcon className="size-4" />
                            )}
                            <span className="sr-only">Save answer</span>
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            disabled={savingKey === value.fieldKey}
                            onClick={() => {
                              setEditingKey(null);
                              setEditValue("");
                            }}
                          >
                            <XIcon className="size-4" />
                            <span className="sr-only">Cancel answer edit</span>
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => startValueEdit(value)}
                        >
                          <PencilIcon className="size-4" />
                          <span className="sr-only">Edit answer</span>
                        </Button>
                      )
                    ) : null}
                  </div>
                  {editingKey === value.fieldKey ? (
                    <Textarea
                      value={editValue}
                      onChange={(event) => setEditValue(event.target.value)}
                      rows={5}
                      className="font-mono text-sm"
                    />
                  ) : (
                    <dd className="whitespace-pre-wrap break-words text-sm text-foreground">
                      {displayValue(value.value)}
                    </dd>
                  )}
                </div>
              ))
            )}
          </div>
        </section>

        <aside className="flex flex-col gap-6">
          <section className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-lg font-medium text-foreground">Status</h2>
            <div className="mt-4 grid gap-3">
              <label className="text-sm font-medium text-foreground">
                Entry status
              </label>
              <Select
                value={submission.status}
                onValueChange={(value) => void handleStatus(value as EntryStatus)}
                disabled={!canEdit}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="complete">Complete</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="spam">Spam</SelectItem>
                  <SelectItem value="deleted">Trash</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-lg font-medium text-foreground">Metadata</h2>
            <dl className="mt-4 grid gap-3 text-sm">
              <MetaRow label="Created" value={formatDate(submission.createdAt)} />
              <MetaRow label="Submitted" value={formatDate(submission.submittedAt)} />
              <MetaRow label="Completed" value={formatDate(submission.completedAt)} />
              <MetaRow label="Updated" value={formatDate(submission.updatedAt)} />
              <MetaRow label="Referrer" value={submission.referrer || "Direct"} />
              <MetaRow label="IP" value={submission.ip || "Not captured"} />
              <MetaRow label="User" value={submission.userId ? String(submission.userId) : "Guest"} />
              <MetaRow
                label="User agent"
                value={submission.userAgent || "Not captured"}
              />
              {meta?.pricing ? (
                <MetaRow
                  label="Pricing"
                  value={JSON.stringify(meta.pricing, null, 2)}
                />
              ) : null}
            </dl>
          </section>

          <section className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-lg font-medium text-foreground">Internal Notes</h2>
            <div className="mt-4 grid gap-3">
              {detail.notes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No notes yet.</p>
              ) : (
                detail.notes.map((item) => (
                  <div
                    key={item._id}
                    className="rounded-md border border-border bg-muted/30 p-3"
                  >
                    <p className="whitespace-pre-wrap text-sm text-foreground">
                      {item.body}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {formatDate(item.createdAt)} by{" "}
                      {item.authorName || item.authorEmail || String(item.authorId)}
                    </p>
                  </div>
                ))
              )}

              {canEdit ? (
                <div className="grid gap-2">
                  <Textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Add an internal note"
                    rows={4}
                  />
                  <Button
                    onClick={() => void handleAddNote()}
                    disabled={isSavingNote || !note.trim()}
                  >
                    {isSavingNote ? (
                      <LoaderIcon
                        className="size-4 animate-spin"
                        data-icon="inline-start"
                      />
                    ) : null}
                    Add note
                  </Button>
                </div>
              ) : null}
            </div>
          </section>
        </aside>
      </div>

      <ConfirmDialog
        open={deleteConfirmOpen}
        onClose={() => {
          if (!isDeleting) setDeleteConfirmOpen(false);
        }}
        onConfirm={() => void handleDelete()}
        title="Move this entry to trash?"
        message="This entry will move to the Trash tab and can be restored later."
        confirmLabel="Move to Trash"
        destructive
        isExecuting={isDeleting}
      />
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 whitespace-pre-wrap break-words text-foreground">
        {value}
      </dd>
    </div>
  );
}

function EntryDetailSkeleton() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <Skeleton className="h-16 w-full" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Skeleton className="h-96 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    </div>
  );
}
