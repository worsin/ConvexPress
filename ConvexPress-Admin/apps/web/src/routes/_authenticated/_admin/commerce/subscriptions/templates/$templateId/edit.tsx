/**
 * Edit a subscription template. `adminCatalog.getTemplateEditor` supplies the
 * template with its retry policy and offers; `TemplateEditor` holds the form.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache";
import { ArrowLeft } from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import { useBreadcrumbTitle } from "@/lib/admin-shell/breadcrumb-titles";
import { asId } from "@/lib/utils";
import { TemplateEditor } from "@/components/subscriptions/catalog/TemplateEditor";

export const Route = createFileRoute("/_authenticated/_admin/commerce/subscriptions/templates/$templateId/edit")({
  component: EditTemplatePage,
});

function EditTemplatePage() {
  const { templateId } = Route.useParams();
  const editor = useQuery(api.commerceSubscriptions.adminCatalog.getTemplateEditor, {
    templateId: asId<"commerce_subscription_templates">(templateId),
  });
  useBreadcrumbTitle(templateId, editor?.template.title);

  return (
    <div className="space-y-6">
      <div>
        <Link to="/commerce/subscriptions/templates" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to templates
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{editor ? editor.template.title : "Template"}</h1>
        {editor ? <p className="mt-1 text-xs text-muted-foreground">Version {editor.template.version}</p> : null}
      </div>
      {editor === undefined ? (
        <div className="h-96 animate-pulse rounded-2xl bg-muted" />
      ) : editor === null ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">This template was not found.</div>
      ) : (
        <TemplateEditor key={editor.template._id} existing={editor} />
      )}
    </div>
  );
}
