import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache";
import { Plus, FileText } from "lucide-react";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/subscriptions/order-forms/",
)({
  component: OrderFormsIndex,
});

type FormRow = {
  _id: Id<"commerce_subscription_order_forms">;
  title: string;
  slug: string;
  status: "draft" | "active" | "archived";
  createdAt: number;
};

function OrderFormsIndex() {
  const rows = useQuery(
    (api as any).commerceSubscriptions.queries.listOrderForms,
    {},
  ) as FormRow[] | null | undefined;

  const pluginDisabled = rows === null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Order Forms</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Direct-signup forms customers can complete to start a subscription.
          </p>
        </div>
        <Link
          to="/commerce/subscriptions/order-forms/new"
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> New form
        </Link>
      </div>

      {pluginDisabled && (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center">
          <FileText className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-2 text-sm text-muted-foreground">
            The commerce subscriptions plugin is disabled.
          </p>
        </div>
      )}

      {!pluginDisabled && (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="grid grid-cols-[2fr_1fr_1fr_150px] gap-4 border-b border-border px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            <div>Title</div>
            <div>Slug</div>
            <div>Status</div>
            <div>Created</div>
          </div>
          {rows === undefined ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center">
              <FileText className="mx-auto h-10 w-10 text-muted-foreground/40" />
              <p className="mt-3 text-sm text-muted-foreground">No order forms yet.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((row) => (
                <li key={row._id}>
                  <Link
                    to="/commerce/subscriptions/order-forms/$formId"
                    params={{ formId: String(row._id) }}
                    className="grid grid-cols-[2fr_1fr_1fr_150px] items-center gap-4 px-5 py-4 text-sm transition-colors hover:bg-muted/30"
                  >
                    <div className="truncate font-medium text-foreground">{row.title}</div>
                    <div className="truncate font-mono text-xs text-muted-foreground">{row.slug}</div>
                    <div>
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
                          row.status === "active"
                            ? "bg-primary/15 text-primary"
                            : row.status === "archived"
                              ? "bg-muted text-muted-foreground"
                              : "bg-accent/20 text-accent-foreground",
                        )}
                      >
                        {row.status}
                      </span>
                    </div>
                    <div className="text-muted-foreground">
                      {new Date(row.createdAt).toLocaleDateString()}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
