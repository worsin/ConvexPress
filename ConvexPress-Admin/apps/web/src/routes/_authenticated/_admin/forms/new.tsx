import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { LoaderIcon } from "lucide-react";
import { toast } from "sonner";

import { api } from "@backend/convex/_generated/api";
import { PluginGuard } from "@/components/plugins/PluginGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/_admin/forms/new")({
  component: NewFormPage,
});

function NewFormPage() {
  return (
    <PluginGuard pluginId="forms">
      <NewFormContent />
    </PluginGuard>
  );
}

function NewFormContent() {
  const navigate = useNavigate();
  const createForm = useMutation(api.extensions.forms.mutations.create);

  const [title, setTitle] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreate = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      toast.error("Form title is required.");
      return;
    }

    setIsSubmitting(true);
    try {
      const form = await createForm({ title: trimmed });
      if (!form) {
        toast.error("Failed to create form.");
        return;
      }
      toast.success("Form created.");
      // Full-page navigation to the builder. replace: so Back returns to list.
      await navigate({
        to: "/forms/$formId/edit",
        params: { formId: form._id },
        replace: true,
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create form.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Add New Form
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Name your form to create a draft, then build it in the editor.
          </p>
        </div>
        <Link to="/forms">
          <Button variant="outline">Back to Forms</Button>
        </Link>
      </div>

      <section className="rounded-3xl border border-border bg-card p-5">
        <div className="grid gap-4">
          <div className="grid gap-2">
            <label htmlFor="form-title" className="text-sm font-medium">
              Title
            </label>
            <Input
              id="form-title"
              value={title}
              autoFocus
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !isSubmitting) {
                  event.preventDefault();
                  void handleCreate();
                }
              }}
              placeholder="Contact Us"
            />
            <p className="text-xs text-muted-foreground">
              A URL-safe slug is generated from the title automatically.
            </p>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={() => void handleCreate()}
              disabled={isSubmitting || !title.trim()}
            >
              {isSubmitting ? (
                <>
                  <LoaderIcon
                    className="size-4 animate-spin"
                    data-icon="inline-start"
                  />
                  Creating
                </>
              ) : (
                "Create Form"
              )}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
