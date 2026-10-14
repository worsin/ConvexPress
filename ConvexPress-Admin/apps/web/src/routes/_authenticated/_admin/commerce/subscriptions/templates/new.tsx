/**
 * New subscription template. The editor (`TemplateEditor`) holds the form.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { TemplateEditor } from "@/components/subscriptions/catalog/TemplateEditor";

export const Route = createFileRoute("/_authenticated/_admin/commerce/subscriptions/templates/new")({
  component: NewTemplatePage,
});

function NewTemplatePage() {
  return (
    <div className="space-y-6">
      <div>
        <Link to="/commerce/subscriptions/templates" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to templates
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">New template</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          A template is the billing behind offers: how often they charge, the trial, and what happens when a payment fails.
        </p>
      </div>
      <TemplateEditor />
    </div>
  );
}
