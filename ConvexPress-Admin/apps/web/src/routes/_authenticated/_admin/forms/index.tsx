import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { Archive, Copy, FileText, Plus } from "lucide-react";
import { toast } from "sonner";

import { api } from "@backend/convex/_generated/api";
import type { Capability } from "@backend/convex/types/capabilities";
import { PluginGuard } from "@/components/plugins/PluginGuard";
import { useCan } from "@/hooks/useCan";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Local wrapper for Forms capability strings. Mirrors the backend helper and
 * keeps the list authorization surface explicit.
 */
const formCap = (cap: string): Capability => cap as Capability;
type FormStatus = "draft" | "published" | "archived";
type StatusFilter = "active" | FormStatus;
type PendingAction =
  | { kind: "duplicate"; form: FormListRow }
  | { kind: "archive"; form: FormListRow }
  | null;

interface FormListRow {
  _id: string;
  title: string;
  slug: string;
  status: FormStatus;
  fieldCount?: number;
}

export const Route = createFileRoute("/_authenticated/_admin/forms/")({
  component: FormsListPage,
});

function FormsListPage() {
  // PluginGuard is non-negotiable for toggleable extensions. When the "forms"
  // plugin is disabled in /plugins, this fails closed and renders the kit's
  // standard "extension disabled" state.
  return (
    <PluginGuard pluginId="forms">
      <FormsListContent />
    </PluginGuard>
  );
}

function FormsListContent() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [isActing, setIsActing] = useState(false);
  const canCreate = useCan(formCap("form.create"));
  const canDuplicate = useCan(formCap("form.duplicate"));
  const canDelete = useCan(formCap("form.delete"));
  const canViewEntries = useCan(formCap("form.view_entries"));
  const duplicateForm = useMutation(api.extensions.forms.mutations.duplicate);
  const archiveForm = useMutation(api.extensions.forms.mutations.remove);

  // Cached, paginated query. convex-helpers cache keeps the data stable across
  // route transitions.
  const result = useQuery(api.extensions.forms.queries.list, {
    paginationOpts: { numItems: 20, cursor: null },
    status: statusFilter === "active" ? undefined : statusFilter,
  });

  if (result === undefined) return <ListSkeleton />;

  const forms = result.page;

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
            <FileText className="size-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Forms</h1>
            <p className="text-sm text-muted-foreground">
              Build contact, signup, and multi-step forms.
            </p>
          </div>
        </div>

        {/* Add New is full-page navigation. Per the kit standard, no
            modal-based content creation. */}
        {canCreate ? (
          <Button onClick={() => navigate({ to: "/forms/new" })}>
            <Plus className="size-4" data-icon="inline-start" />
            Add New
          </Button>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3">
        <Select
          value={statusFilter}
          onValueChange={(value) => setStatusFilter(value as StatusFilter)}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active forms</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {forms.length === 0 ? (
        <EmptyState
          canCreate={canCreate}
          onCreate={() => navigate({ to: "/forms/new" })}
        />
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Title</th>
                <th className="px-3 py-2 font-medium">Slug</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Fields</th>
                <th className="px-3 py-2 font-medium" aria-label="actions" />
              </tr>
            </thead>
            <tbody>
              {forms.map((form: FormListRow) => (
                <tr key={form._id} className="border-t border-border">
                  <td className="px-3 py-2 font-medium text-foreground">
                    <Link
                      to="/forms/$formId/edit"
                      params={{ formId: form._id }}
                      className="hover:underline"
                    >
                      {form.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {form.slug}
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={form.status} />
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {form.fieldCount ?? 0}
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground">
                    <div className="flex flex-wrap justify-end gap-2">
                      {canViewEntries ? (
                        <Link
                          to="/forms/$formId/entries"
                          params={{ formId: form._id }}
                          className="text-xs hover:underline"
                        >
                          Entries
                        </Link>
                      ) : null}
                      <Link
                        to="/forms/$formId/edit"
                        params={{ formId: form._id }}
                        className="text-xs hover:underline"
                      >
                        Edit
                      </Link>
                      <Link
                        to="/forms/$formId/settings"
                        params={{ formId: form._id }}
                        className="text-xs hover:underline"
                      >
                        Settings
                      </Link>
                      {canDuplicate ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => setPendingAction({ kind: "duplicate", form })}
                        >
                          <Copy className="size-3.5" data-icon="inline-start" />
                          Duplicate
                        </Button>
                      ) : null}
                      {canDelete && form.status !== "archived" ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                          onClick={() => setPendingAction({ kind: "archive", form })}
                        >
                          <Archive className="size-3.5" data-icon="inline-start" />
                          Archive
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={pendingAction !== null}
        onClose={() => (isActing ? undefined : setPendingAction(null))}
        onConfirm={() => void runPendingAction()}
        title={
          pendingAction?.kind === "archive"
            ? "Archive this form?"
            : "Duplicate this form?"
        }
        message={
          pendingAction?.kind === "archive"
            ? `Archive "${pendingAction.form.title}"? Existing entries are preserved.`
            : `Create a draft copy of "${pendingAction?.form.title ?? "this form"}"?`
        }
        confirmLabel={pendingAction?.kind === "archive" ? "Archive" : "Duplicate"}
        destructive={pendingAction?.kind === "archive"}
        isExecuting={isActing}
      />
    </div>
  );

  async function runPendingAction() {
    if (!pendingAction) return;
    setIsActing(true);
    try {
      if (pendingAction.kind === "duplicate") {
        const copy = await duplicateForm({ id: pendingAction.form._id as any });
        toast.success("Form duplicated.");
        setPendingAction(null);
        if (copy?._id) {
          await navigate({
            to: "/forms/$formId/edit",
            params: { formId: copy._id },
          });
        }
      } else {
        await archiveForm({ id: pendingAction.form._id as any });
        toast.success("Form archived.");
        setPendingAction(null);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Form action failed.",
      );
    } finally {
      setIsActing(false);
    }
  }
}

function StatusBadge({ status }: { status: string }) {
  // Status-driven color via CSS variables — never hardcoded color names.
  const tone =
    status === "published"
      ? "bg-primary/10 text-primary"
      : status === "draft"
        ? "bg-muted text-foreground"
        : status === "archived"
          ? "bg-muted/50 text-muted-foreground"
          : "bg-muted text-muted-foreground";

  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}
    >
      {status}
    </span>
  );
}

function EmptyState({
  canCreate,
  onCreate,
}: {
  canCreate: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/30 px-6 py-16 text-center">
      <FileText className="mx-auto mb-3 size-8 text-muted-foreground/40" />
      <p className="text-sm font-medium text-foreground">No forms yet.</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Create your first form to get started.
      </p>
      {canCreate ? (
        <Button variant="outline" size="sm" onClick={onCreate} className="mt-4">
          <Plus className="size-3.5" data-icon="inline-start" />
          Create Form
        </Button>
      ) : null}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="rounded-lg border border-border overflow-hidden">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="border-t border-border p-3 first:border-t-0"
          >
            <Skeleton className="h-4 w-3/4" />
          </div>
        ))}
      </div>
    </div>
  );
}
