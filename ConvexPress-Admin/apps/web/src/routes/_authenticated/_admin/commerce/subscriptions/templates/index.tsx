/**
 * Subscription Templates list.
 *
 * Templates hold the default cadence (interval × count), trial & grace
 * defaults, and dunning policy code. Offers reference a template via
 * `templateId`. Archiving a template does NOT cascade to offers.
 */

import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import {
  Archive,
  ChevronDown,
  ChevronUp,
  Layers,
  Pencil,
  Plus,
} from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/subscriptions/templates/",
)({
  component: SubscriptionTemplatesIndex,
});

type TemplateStatus = "draft" | "active" | "archived";

type Template = {
  _id: Id<"commerce_subscription_templates">;
  title: string;
  slug: string;
  status: TemplateStatus;
  version: number;
  billingInterval: "week" | "month" | "year";
  billingIntervalCount: number;
  trialDays?: number;
  gracePeriodDays?: number;
  pausable: boolean;
  cancelAtPeriodEndDefault: boolean;
  dunningPolicyCode?: string;
  createdAt: number;
  updatedAt: number;
};

function StatusBadge({ status }: { status: TemplateStatus }) {
  const styles: Record<TemplateStatus, string> = {
    active: "bg-primary/15 text-primary",
    draft: "bg-muted text-muted-foreground",
    archived: "bg-destructive/10 text-destructive",
  };
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
        styles[status],
      )}
    >
      {status}
    </span>
  );
}

function ArchiveConfirm({
  template,
  onConfirm,
  onCancel,
  busy,
}: {
  template: Template;
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <div className="border-t border-destructive/30 bg-destructive/5 px-5 py-4">
      <p className="text-sm text-destructive">
        Archive template <strong>{template.title}</strong>? Existing offers and
        contracts referencing it remain intact.
      </p>
      <div className="mt-3 flex gap-3">
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="inline-flex rounded-xl bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-60"
        >
          Archive
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function SubscriptionTemplatesIndex() {
  const navigate = useNavigate();
  const templates = useQuery(
    (api as any).commerceSubscriptions.queries.listTemplates,
    {},
  ) as Template[] | null | undefined;

  const archiveTemplate = useMutation(
    (api as any).commerceSubscriptions.templates.archiveTemplate,
  );

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pluginDisabled = templates === null;

  async function handleArchive(id: Id<"commerce_subscription_templates">) {
    setBusy(true);
    try {
      await archiveTemplate({ templateId: id });
      toast.success("Template archived");
      setArchivingId(null);
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to archive template",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">
            Subscription Templates
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Templates define the default billing cadence and policy defaults
            (trial, grace, pausable, dunning). Offers inherit from a template.
          </p>
        </div>
        <Link
          to="/commerce/subscriptions/templates/new"
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          New template
        </Link>
      </div>

      {pluginDisabled && (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center">
          <Layers className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-2 text-sm text-muted-foreground">
            The commerce subscriptions plugin is disabled.
          </p>
        </div>
      )}

      {!pluginDisabled && (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="grid grid-cols-[1fr_100px_140px_90px_110px_110px_130px] gap-4 border-b border-border px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            <div>Template</div>
            <div>Status</div>
            <div>Cadence</div>
            <div>Version</div>
            <div>Trial</div>
            <div>Grace</div>
            <div className="text-right">Actions</div>
          </div>

          {templates === undefined ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-16 animate-pulse rounded-xl bg-muted"
                />
              ))}
            </div>
          ) : templates.length === 0 ? (
            <div className="p-10 text-center">
              <Layers className="mx-auto h-10 w-10 text-muted-foreground/40" />
              <p className="mt-3 text-sm text-muted-foreground">
                No templates yet. Click "New template" to create one.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {templates.map((tpl) => (
                <div key={tpl._id}>
                  <div className="grid grid-cols-[1fr_100px_140px_90px_110px_110px_130px] items-center gap-4 px-5 py-4">
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedId(
                            expandedId === tpl._id ? null : tpl._id,
                          )
                        }
                        className="flex items-center gap-2 text-left"
                      >
                        {expandedId === tpl._id ? (
                          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {tpl.title}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            /{tpl.slug}
                          </p>
                        </div>
                      </button>
                    </div>
                    <div>
                      <StatusBadge status={tpl.status} />
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Every {tpl.billingIntervalCount}{" "}
                      {tpl.billingInterval}
                      {tpl.billingIntervalCount !== 1 ? "s" : ""}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      v{tpl.version}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {tpl.trialDays ? `${tpl.trialDays}d` : "--"}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {tpl.gracePeriodDays ? `${tpl.gracePeriodDays}d` : "--"}
                    </div>
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          navigate({
                            to: "/commerce/subscriptions/templates/$templateId/edit",
                            params: { templateId: tpl._id },
                          })
                        }
                        title="Edit template"
                        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      {tpl.status !== "archived" && (
                        <button
                          type="button"
                          onClick={() => setArchivingId(tpl._id)}
                          title="Archive template"
                          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Archive className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {expandedId === tpl._id && (
                    <div className="border-t border-border/50 bg-muted/20 px-5 py-4">
                      <div className="grid gap-4 text-sm sm:grid-cols-3">
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">
                            Pausable
                          </p>
                          <p className="mt-1 text-foreground">
                            {tpl.pausable ? "Yes" : "No"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">
                            Cancel at period end (default)
                          </p>
                          <p className="mt-1 text-foreground">
                            {tpl.cancelAtPeriodEndDefault ? "Yes" : "No"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">
                            Dunning policy
                          </p>
                          <p className="mt-1 font-mono text-xs text-foreground">
                            {tpl.dunningPolicyCode ?? "default"}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {archivingId === tpl._id && (
                    <ArchiveConfirm
                      template={tpl}
                      busy={busy}
                      onConfirm={() => void handleArchive(tpl._id)}
                      onCancel={() => setArchivingId(null)}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
