import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { usePaginatedQuery, useQuery } from "convex-helpers/react/cache";
import {
  InboxIcon,
  LoaderIcon,
  MailOpenIcon,
  SearchIcon,
  StarIcon,
  TrashIcon,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { useAuth } from "@/lib/auth-context";
import { useCan } from "@/hooks/useCan";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";

type EntryStatus = "partial" | "complete" | "spam" | "deleted";
type EntryTab = "all" | "unread" | "starred" | EntryStatus;

interface FormRow {
  _id: Id<"forms">;
  title: string;
  slug: string;
}

interface SubmissionRow {
  _id: Id<"form_submissions">;
  formId: Id<"forms">;
  status: EntryStatus;
  submittedAt?: number;
  completedAt?: number;
  referrer?: string;
  userId?: Id<"users">;
  resumeToken?: string;
  currentStep?: number;
  read?: boolean;
  starred?: boolean;
  createdAt: number;
  updatedAt: number;
}

const TABS: Array<{ id: EntryTab; label: string }> = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "starred", label: "Starred" },
  { id: "complete", label: "Complete" },
  { id: "partial", label: "Partial" },
  { id: "spam", label: "Spam" },
  { id: "deleted", label: "Trash" },
];

function statusForTab(tab: EntryTab): EntryStatus | undefined {
  return tab === "complete" ||
    tab === "partial" ||
    tab === "spam" ||
    tab === "deleted"
    ? tab
    : undefined;
}

function triageForTab(tab: EntryTab): { read?: boolean; starred?: boolean } {
  if (tab === "unread") return { read: false };
  if (tab === "starred") return { starred: true };
  return {};
}

function formatDate(value?: number): string {
  if (!value) return "Not completed";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function applyLocalTab(row: SubmissionRow, tab: EntryTab): boolean {
  if (tab === "unread") return row.read !== true;
  if (tab === "starred") return row.starred === true;
  return true;
}

export function FormEntriesPage({ formId }: { formId: Id<"forms"> }) {
  const navigate = useNavigate();
  const { isLoading: authLoading } = useAuth();
  const canView = useCan("form.view_entries");
  const canEdit = useCan("form.edit_entry");
  const canDelete = useCan("form.delete_entry");
  const [tab, setTab] = useState<EntryTab>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [isBulkWorking, setIsBulkWorking] = useState(false);
  const [pendingBulkConfirm, setPendingBulkConfirm] = useState<
    "spam" | "trash" | null
  >(null);

  const form = useQuery(api.extensions.forms.queries.getForm, {
    id: formId,
  }) as FormRow | null | undefined;

  const status = statusForTab(tab);
  const searchTerm = search.trim();
  const triage = triageForTab(tab);
  const submissions = usePaginatedQuery(
    api.extensions.forms.queries.listSubmissions,
    status
      ? { formId, status, search: searchTerm || undefined, ...triage }
      : { formId, search: searchTerm || undefined, ...triage },
    { initialNumItems: 25 },
  ) as {
    results?: SubmissionRow[];
    status: string;
    loadMore: (numItems: number) => void;
    isLoading: boolean;
  };

  const updateEntry = useMutation(api.extensions.forms.mutations.updateEntry);
  const updateEntryBulk = useMutation(
    api.extensions.forms.mutations.updateEntryBulk,
  );
  const deleteEntryBulk = useMutation(
    api.extensions.forms.mutations.deleteEntryBulk,
  );

  const visibleRows = useMemo(() => {
    return (submissions.results ?? []).filter(
      (row) => applyLocalTab(row, tab),
    );
  }, [submissions.results, tab]);

  const selectedRows = visibleRows.filter((row) => selected.has(row._id));
  const allVisibleSelected =
    visibleRows.length > 0 && visibleRows.every((row) => selected.has(row._id));
  const someVisibleSelected =
    visibleRows.some((row) => selected.has(row._id)) && !allVisibleSelected;

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const row of visibleRows) next.delete(row._id);
      } else {
        for (const row of visibleRows) next.add(row._id);
      }
      return next;
    });
  };

  const runBulk = async (
    label: string,
    action: () => Promise<{ ok?: unknown[]; failed?: unknown[] }>,
  ) => {
    if (selectedRows.length === 0) return;
    setIsBulkWorking(true);
    try {
      const result = await action();
      const failed = result.failed?.length ?? 0;
      setSelected(new Set());
      if (failed > 0) {
        toast.warning(`${label} finished with ${failed} skipped entries.`);
      } else {
        toast.success(`${label} finished.`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `${label} failed.`);
    } finally {
      setIsBulkWorking(false);
    }
  };

  const selectedIds = selectedRows.map((row) => row._id);
  const hasReadSelected = selectedRows.some((row) => row.read === true);
  const hasUnreadSelected = selectedRows.some((row) => row.read !== true);
  const hasStarredSelected = selectedRows.some((row) => row.starred === true);
  const hasUnstarredSelected = selectedRows.some(
    (row) => row.starred !== true,
  );
  const hasSpamSelected = selectedRows.some((row) => row.status === "spam");
  const hasDeletedSelected = selectedRows.some(
    (row) => row.status === "deleted",
  );

  if (authLoading || form === undefined) {
    return <EntriesSkeleton />;
  }

  if (!canView) {
    return <EntriesAccessDenied />;
  }

  if (form === null) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <div className="rounded-lg border border-border bg-card p-8">
          <h1 className="text-xl font-semibold text-foreground">
            Form not found
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The requested form could not be loaded.
          </p>
          <Link to="/forms" className="mt-4 inline-block">
            <Button variant="outline">Back to Forms</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link to="/forms" className="hover:text-foreground">
              Forms
            </Link>
            <span>/</span>
            <Link
              to="/forms/$formId/edit"
              params={{ formId }}
              className="hover:text-foreground"
            >
              {form.title}
            </Link>
          </div>
          <h1 className="mt-2 text-2xl font-semibold text-foreground">
            Entries
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review submissions, triage status, and add internal notes.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/forms/$formId/edit" params={{ formId }}>
            <Button variant="outline">Builder</Button>
          </Link>
          <Link to="/forms/$formId/analytics" params={{ formId }}>
            <Button variant="outline">Analytics</Button>
          </Link>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setTab(item.id);
                  setSelected(new Set());
                }}
                className={
                  item.id === tab
                    ? "rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                    : "rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
                }
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="relative min-w-0 lg:w-72">
            <SearchIcon className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search entries"
              className="pl-8"
            />
          </div>
        </div>

        {selectedRows.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 p-3 text-sm">
            <span className="font-medium text-foreground">
              {selectedRows.length} selected
            </span>
            {hasUnreadSelected ? (
              <Button
                size="sm"
                variant="outline"
                disabled={!canEdit || isBulkWorking}
                onClick={() =>
                  void runBulk("Mark read", () =>
                    updateEntryBulk({ formId, ids: selectedIds, read: true }),
                  )
                }
              >
                <MailOpenIcon className="size-4" data-icon="inline-start" />
                Mark read
              </Button>
            ) : null}
            {hasReadSelected ? (
              <Button
                size="sm"
                variant="outline"
                disabled={!canEdit || isBulkWorking}
                onClick={() =>
                  void runBulk("Mark unread", () =>
                    updateEntryBulk({ formId, ids: selectedIds, read: false }),
                  )
                }
              >
                <MailOpenIcon className="size-4" data-icon="inline-start" />
                Mark unread
              </Button>
            ) : null}
            {hasUnstarredSelected ? (
              <Button
                size="sm"
                variant="outline"
                disabled={!canEdit || isBulkWorking}
                onClick={() =>
                  void runBulk("Star", () =>
                    updateEntryBulk({
                      formId,
                      ids: selectedIds,
                      starred: true,
                    }),
                  )
                }
              >
                <StarIcon className="size-4" data-icon="inline-start" />
                Star
              </Button>
            ) : null}
            {hasStarredSelected ? (
              <Button
                size="sm"
                variant="outline"
                disabled={!canEdit || isBulkWorking}
                onClick={() =>
                  void runBulk("Unstar", () =>
                    updateEntryBulk({
                      formId,
                      ids: selectedIds,
                      starred: false,
                    }),
                  )
                }
              >
                <StarIcon className="size-4" data-icon="inline-start" />
                Unstar
              </Button>
            ) : null}
            {hasSpamSelected ? (
              <Button
                size="sm"
                variant="outline"
                disabled={!canEdit || isBulkWorking}
                onClick={() =>
                  void runBulk("Mark not spam", () =>
                    updateEntryBulk({
                      formId,
                      ids: selectedIds,
                      status: "complete",
                    }),
                  )
                }
              >
                Not spam
              </Button>
            ) : null}
            {hasDeletedSelected ? (
              <Button
                size="sm"
                variant="outline"
                disabled={!canEdit || isBulkWorking}
                onClick={() =>
                  void runBulk("Restore", () =>
                    updateEntryBulk({
                      formId,
                      ids: selectedIds,
                      status: "complete",
                    }),
                  )
                }
              >
                Restore
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              disabled={!canEdit || isBulkWorking}
              onClick={() => setPendingBulkConfirm("spam")}
            >
              Mark spam
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!canDelete || isBulkWorking}
              onClick={() => setPendingBulkConfirm("trash")}
            >
              <TrashIcon className="size-4" data-icon="inline-start" />
              Trash
            </Button>
          </div>
        ) : null}

        {submissions.status === "LoadingFirstPage" ? (
          <EntriesTableSkeleton />
        ) : visibleRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <InboxIcon className="mb-3 size-9 text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">
              No entries found
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Try a different filter or wait for new submissions.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="w-10 px-3 py-3">
                    <Checkbox
                      checked={allVisibleSelected}
                      indeterminate={someVisibleSelected}
                      onCheckedChange={toggleAllVisible}
                      aria-label="Select all visible entries"
                    />
                  </th>
                  <th className="px-3 py-3 font-medium">Entry</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 font-medium">Submitted</th>
                  <th className="px-3 py-3 font-medium">Source</th>
                  <th className="px-3 py-3 font-medium" aria-label="actions" />
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr
                    key={row._id}
                    className="border-t border-border hover:bg-muted/30"
                  >
                    <td className="px-3 py-3">
                      <Checkbox
                        checked={selected.has(row._id)}
                        onCheckedChange={() => toggleSelected(row._id)}
                        aria-label="Select entry"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={() =>
                          navigate({
                            to: "/forms/$formId/entries/$entryId",
                            params: { formId, entryId: row._id },
                          })
                        }
                        className={
                          row.read === true
                            ? "text-left text-foreground hover:underline"
                            : "text-left font-semibold text-foreground hover:underline"
                        }
                      >
                        {String(row._id)}
                      </button>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        {row.starred === true ? (
                          <StarIcon className="size-3.5 fill-current text-primary" />
                        ) : null}
                        {row.read === true ? "Read" : "Unread"}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <EntryStatusBadge status={row.status} />
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {formatDate(row.completedAt ?? row.submittedAt)}
                    </td>
                    <td className="max-w-[220px] truncate px-3 py-3 text-muted-foreground">
                      {row.referrer || "Direct"}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={!canEdit}
                          onClick={() =>
                            updateEntry({
                              id: row._id,
                              formId,
                              starred: row.starred !== true,
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
                              row.starred === true
                                ? "size-4 fill-current text-primary"
                                : "size-4"
                            }
                          />
                          <span className="sr-only">Toggle star</span>
                        </Button>
                        <Link
                          to="/forms/$formId/entries/$entryId"
                          params={{ formId, entryId: row._id }}
                        >
                          <Button size="sm" variant="outline">
                            Open
                          </Button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {submissions.status === "CanLoadMore" ? (
          <div className="border-t border-border p-4 text-center">
            <Button
              variant="outline"
              onClick={() => submissions.loadMore(25)}
              disabled={submissions.isLoading}
            >
              {submissions.isLoading ? (
                <LoaderIcon className="size-4 animate-spin" data-icon="inline-start" />
              ) : null}
              Load more
            </Button>
          </div>
        ) : null}
      </div>

      <ConfirmDialog
        open={pendingBulkConfirm !== null}
        onClose={() => {
          if (!isBulkWorking) setPendingBulkConfirm(null);
        }}
        onConfirm={() => {
          const action = pendingBulkConfirm;
          setPendingBulkConfirm(null);
          if (action === "spam") {
            void runBulk("Mark spam", () =>
              updateEntryBulk({ formId, ids: selectedIds, status: "spam" }),
            );
          }
          if (action === "trash") {
            void runBulk("Move to trash", () =>
              deleteEntryBulk({ formId, ids: selectedIds }),
            );
          }
        }}
        title={
          pendingBulkConfirm === "trash"
            ? "Move selected entries to trash?"
            : "Mark selected entries as spam?"
        }
        message={
          pendingBulkConfirm === "trash"
            ? "These entries will move to the Trash tab and can be restored later."
            : "These entries will move to the Spam tab and can be marked not spam later."
        }
        confirmLabel={
          pendingBulkConfirm === "trash" ? "Move to Trash" : "Mark Spam"
        }
        destructive
        isExecuting={isBulkWorking}
      />
    </div>
  );
}

function EntriesAccessDenied() {
  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="rounded-lg border border-border bg-card p-8">
        <h1 className="text-xl font-semibold text-foreground">
          Entries unavailable
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your current role cannot view form entries.
        </p>
        <Link to="/forms" className="mt-4 inline-block">
          <Button variant="outline">Back to Forms</Button>
        </Link>
      </div>
    </div>
  );
}

export function EntryStatusBadge({ status }: { status: EntryStatus }) {
  const label = status === "deleted" ? "trash" : status;
  const tone =
    status === "complete"
      ? "bg-primary/10 text-primary"
      : status === "partial"
        ? "bg-muted text-foreground"
        : status === "spam"
          ? "bg-destructive/10 text-destructive"
          : "bg-muted/70 text-muted-foreground";
  return (
    <Badge className={tone} variant="secondary">
      {label}
    </Badge>
  );
}

function EntriesSkeleton() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}

function EntriesTableSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 5 }).map((_, index) => (
        <Skeleton key={index} className="h-12 w-full" />
      ))}
    </div>
  );
}
