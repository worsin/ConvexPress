import { Link, Outlet, createFileRoute, useLocation } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache";
import { ExternalLink, LoaderIcon } from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { PluginGuard } from "@/components/plugins/PluginGuard";
import { ManagedRecordNotice } from "@/components/shared/ManagedRecord";
import { useManagedRecord } from "@/components/shared/useManagedRecord";
import { Button } from "@/components/ui/button";
import { useControlShell } from "@/control/ControlShellContext";
import { useBreadcrumbTitle } from "@/lib/admin-shell/breadcrumb-titles";
import { asId, cn } from "@/lib/utils";

/**
 * One form, every screen: the form's name and status, a link to it on the
 * site, and tabs for its fields, settings, notifications, confirmations,
 * actions, entries and analytics. Each tab's screen renders below.
 */
export const Route = createFileRoute("/_authenticated/_admin/forms/$formId")({
  component: FormLayout,
});

const TABS = [
  { segment: "edit", label: "Fields", to: "/forms/$formId/edit" },
  { segment: "settings", label: "Settings", to: "/forms/$formId/settings" },
  { segment: "notifications", label: "Notifications", to: "/forms/$formId/notifications" },
  { segment: "confirmations", label: "Confirmations", to: "/forms/$formId/confirmations" },
  { segment: "actions", label: "Actions", to: "/forms/$formId/actions" },
  { segment: "entries", label: "Entries", to: "/forms/$formId/entries" },
  { segment: "analytics", label: "Analytics", to: "/forms/$formId/analytics" },
] as const;

/** What the site's code owns on a managed form; notifications and entries stay the admin's. */
const MANAGED_TABS: ReadonlySet<string> = new Set(["edit", "settings", "confirmations", "actions"]);

const STATUS_LABEL: Record<string, string> = { draft: "Draft", published: "Published", archived: "Archived" };

function FormLayout() {
  const { formId } = Route.useParams();
  return (
    <PluginGuard pluginId="forms">
      <FormShell formId={asId<"forms">(formId)} />
    </PluginGuard>
  );
}

function FormShell({ formId }: { formId: Id<"forms"> }) {
  const form = useQuery(api.extensions.forms.queries.getForm, { id: formId });
  const general = useQuery(api.settings.queries.getBySection, { section: "general" });
  const shell = useControlShell();
  const managed = useManagedRecord("form", formId);
  const { pathname } = useLocation();
  useBreadcrumbTitle(formId, form?.title);

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
          <h1 className="text-xl font-semibold text-foreground">Form not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">It may have been deleted.</p>
          <Link to="/forms" className="mt-4 inline-block">
            <Button variant="outline">Back to Forms</Button>
          </Link>
        </div>
      </div>
    );
  }

  const configuredUrl = general && typeof general === "object" && "siteUrl" in general && typeof general.siteUrl === "string" ? general.siteUrl : "";
  const siteOrigin = (shell?.selectedEnvironment?.siteOrigin ?? configuredUrl).replace(/\/+$/, "");
  const publicUrl = siteOrigin ? `${siteOrigin}/forms/${form.slug}` : null;
  const segment = pathname.split("/")[3] ?? "edit";
  const locked = managed && MANAGED_TABS.has(segment) ? managed : null;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-4 border-b border-border pb-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="truncate text-2xl font-semibold text-foreground">{form.title}</h1>
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-medium",
                form.status === "published" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
              )}
            >
              {STATUS_LABEL[form.status] ?? form.status}
            </span>
          </div>
          {publicUrl && form.status === "published" ? (
            <a
              href={publicUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              View on site
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          ) : null}
        </div>
        <nav aria-label="Form sections" className="-mb-px flex gap-1 overflow-x-auto">
          {TABS.map((tab) => {
            const active = segment === tab.segment;
            return (
              <Link
                key={tab.segment}
                to={tab.to}
                params={{ formId }}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                  active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </header>
      {locked ? (
        <>
          <ManagedRecordNotice managed={locked} what="This form" />
          <fieldset disabled className="min-w-0">
            <Outlet />
          </fieldset>
        </>
      ) : (
        <Outlet />
      )}
    </div>
  );
}
