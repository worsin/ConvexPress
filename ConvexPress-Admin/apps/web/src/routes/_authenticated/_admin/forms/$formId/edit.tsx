import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { LayoutTemplate, LoaderIcon } from "lucide-react";
import { toast } from "sonner";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
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
        <div className="rounded-3xl border border-border bg-card p-8">
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
            Edit form details and status. The drag-and-drop field builder is
            pending the Field Engine extraction.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/forms">
            <Button variant="outline">Back to Forms</Button>
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

      <div className="grid gap-6 lg:grid-cols-[1.6fr_0.9fr]">
        {/* Builder canvas placeholder — pending Field Engine extraction. */}
        <section className="rounded-3xl border border-dashed border-border bg-muted/20 p-5">
          <div className="flex min-h-[320px] flex-col items-center justify-center text-center">
            <LayoutTemplate className="mb-3 size-8 text-muted-foreground/40" />
            <h2 className="text-lg font-medium text-foreground">
              Form builder canvas — pending Field Engine extraction
            </h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              The drag-and-drop field builder will live here once the shared
              Field Engine is extracted. For now, manage the form&apos;s title
              and status from the panel beside this canvas.
            </p>
          </div>
        </section>

        <aside className="flex flex-col gap-6">
          <section className="rounded-3xl border border-border bg-card p-5">
            <h2 className="text-lg font-medium text-foreground">
              Form Details
            </h2>
            <div className="mt-4 grid gap-4">
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
                <code className="rounded-2xl bg-muted/50 px-3 py-2 text-xs text-foreground">
                  {form.slug}
                </code>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
