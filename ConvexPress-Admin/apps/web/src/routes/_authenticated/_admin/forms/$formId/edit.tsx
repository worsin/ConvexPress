import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { LoaderIcon } from "lucide-react";
import { toast } from "sonner";

import { api } from "@backend/convex/_generated/api";
import type { Doc, Id } from "@backend/convex/_generated/dataModel";
import { FieldListEditor } from "@/components/custom-fields/FieldListEditor";
import { PluginGuard } from "@/components/plugins/PluginGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { asId, getErrorMessage } from "@/lib/utils";

/**
 * A form's Fields tab: its title, and its fields. (Status and availability
 * are under Settings.)
 *
 * Forms keep their fields in a backing custom-fields group; only the fields
 * are shown here (that group's location rules and placement mean nothing for
 * a form). Each field saves from its own panel; the title saves with its
 * button, which is live only when the title changed.
 */
export const Route = createFileRoute("/_authenticated/_admin/forms/$formId/edit")({
  component: EditFormPage,
});

function EditFormPage() {
  const { formId } = Route.useParams();
  return (
    <PluginGuard pluginId="forms">
      <EditFormContent formId={asId<"forms">(formId)} />
    </PluginGuard>
  );
}

function EditFormContent({ formId }: { formId: Id<"forms"> }) {
  const form = useQuery(api.extensions.forms.queries.getForm, { id: formId });
  const fieldGroupId = form?.fieldGroupId;
  const fields = useQuery(api.customFields.queries.getFieldsByGroup, fieldGroupId ? { groupId: fieldGroupId } : "skip");

  if (!form) return null; // the form layout shows loading and not-found

  return (
    <div className="flex flex-col gap-6">
      <FormDetails key={form._id} form={form} />
      {!fieldGroupId ? (
        <p className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground">This form has no fields yet.</p>
      ) : fields === undefined ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-[320px] w-full" />
        </div>
      ) : (
        <FieldListEditor
          groupId={fieldGroupId}
          fields={fields ?? []}
          deleteWarning="Answers already submitted for this field are deleted with it."
          emptyText="This form has no fields yet. Choose “Add field” to start."
        />
      )}
    </div>
  );
}

function FormDetails({ form }: { form: Doc<"forms"> }) {
  const updateForm = useMutation(api.extensions.forms.mutations.update);
  const [title, setTitle] = useState(form.title);
  const [isSaving, setIsSaving] = useState(false);
  const changed = title.trim() !== form.title;

  const save = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      toast.error("Give the form a title.");
      return;
    }
    setIsSaving(true);
    try {
      await updateForm({ id: form._id, title: trimmed });
      toast.success("Form saved.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Couldn't save the form."));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="grid gap-2">
          <label htmlFor="form-title" className="text-sm font-medium">
            Title
          </label>
          <Input id="form-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Contact us" />
        </div>
        <div className="grid gap-2">
          <span className="text-sm font-medium">Address</span>
          <code className="truncate rounded-md bg-muted/50 px-3 py-2 text-xs text-foreground">/forms/{form.slug}</code>
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <Button onClick={() => void save()} disabled={!changed || isSaving}>
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
