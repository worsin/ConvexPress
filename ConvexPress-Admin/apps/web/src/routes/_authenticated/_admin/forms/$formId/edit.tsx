import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { LoaderIcon } from "lucide-react";
import { toast } from "sonner";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { FieldGroupBuilder } from "@/components/custom-fields/FieldGroupBuilder";
import { PluginGuard } from "@/components/plugins/PluginGuard";
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

type FormStatus = "draft" | "published" | "archived";

export const Route = createFileRoute(
  "/_authenticated/_admin/forms/$formId/edit",
)({
  component: EditFormPage,
});

function EditFormPage() {
  const { formId } = Route.useParams();
  return (
    <PluginGuard pluginId="forms">
      <EditFormContent formId={formId as Id<"forms">} />
    </PluginGuard>
  );
}

function EditFormContent({ formId }: { formId: Id<"forms"> }) {
  const form = useQuery(api.extensions.forms.queries.getForm, { id: formId });
  const updateForm = useMutation(api.extensions.forms.mutations.update);

  // Forms reuse the customFields engine via a backing field group. Load that
  // group + its fields so the canonical FieldGroupBuilder can edit them.
  // `fieldGroupId` is Id<"fieldGroups"> | undefined on the form doc; skip the
  // queries until it (and the form itself) are available.
  const fieldGroupId = form?.fieldGroupId;
  const group = useQuery(
    api.customFields.queries.getGroup,
    fieldGroupId ? { groupId: fieldGroupId } : "skip",
  );
  const fields = useQuery(
    api.customFields.queries.getFieldsByGroup,
    fieldGroupId ? { groupId: fieldGroupId } : "skip",
  );

  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<FormStatus>("draft");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!form) return;
    setTitle(form.title);
    setStatus(form.status as FormStatus);
  }, [form]);

  if (form === undefined) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <LoaderIcon className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
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

  const handleSave = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      toast.error("Form title is required.");
      return;
    }

    setIsSaving(true);
    try {
      await updateForm({ id: formId, title: trimmed, status });
      toast.success("Form saved.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save form.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            {form.title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Edit form details and status above, then build the form&apos;s
            fields in the canvas below.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/forms">
            <Button variant="outline">Back to Forms</Button>
          </Link>
          <Link to="/forms/$formId/notifications" params={{ formId }}>
            <Button variant="outline">Notifications</Button>
          </Link>
          <Link to="/forms/$formId/settings" params={{ formId }}>
            <Button variant="outline">Settings</Button>
          </Link>
          <Link to="/forms/$formId/confirmations" params={{ formId }}>
            <Button variant="outline">Confirmations</Button>
          </Link>
          <Link to="/forms/$formId/entries" params={{ formId }}>
            <Button variant="outline">Entries</Button>
          </Link>
          <Link to="/forms/$formId/actions" params={{ formId }}>
            <Button variant="outline">Actions</Button>
          </Link>
          <Link to="/forms/$formId/analytics" params={{ formId }}>
            <Button variant="outline">Analytics</Button>
          </Link>
          <Button onClick={() => void handleSave()} disabled={isSaving}>
            {isSaving ? (
              <>
                <LoaderIcon
                  className="size-4 animate-spin"
                  data-icon="inline-start"
                />
                Saving
              </>
            ) : (
              "Save"
            )}
          </Button>
        </div>
      </div>

      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-lg font-medium text-foreground">Form Details</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="grid gap-2">
            <label htmlFor="form-title" className="text-sm font-medium">
              Title
            </label>
            <Input
              id="form-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Contact Us"
            />
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium">Status</label>
            <Select
              value={status}
              onValueChange={(value) => setStatus(value as FormStatus)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <span className="text-sm font-medium">Slug</span>
            <code className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-foreground">
              {form.slug}
            </code>
          </div>
        </div>
      </section>

      {/*
        Form fields — reuses the canonical customFields FieldGroupBuilder.
        Rendered inline (same direct-pass pattern as
        custom-fields/$groupId/edit.lazy.tsx) so the loosely-typed query
        results flow straight into the builder without re-naming their types.

        Note: FieldGroupBuilder is itself a full-page editor with its own save
        for the *fields*; embedded below the form-details header here, the page
        carries two save concerns: form meta (above) and fields (within).
      */}
      {!fieldGroupId ? (
        // Defensive: every form created via mutations.create has a backing
        // group, but guard against a form that somehow lacks one.
        <section className="rounded-lg border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">
            This form has no field group yet.
          </p>
        </section>
      ) : group === undefined || fields === undefined ? (
        // Loading state (mirrors custom-fields/$groupId/edit.lazy.tsx).
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-8 w-32" />
          </div>
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-[400px] w-full" />
          <Skeleton className="h-[200px] w-full" />
        </div>
      ) : group === null ? (
        // Not found: the backing group is missing.
        <section className="rounded-lg border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">
            The field group backing this form could not be loaded.
          </p>
        </section>
      ) : (
        <FieldGroupBuilder group={group} fields={fields} />
      )}
    </div>
  );
}
