import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";

export const Route = createFileRoute("/dashboard/returns/$returnId")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex" }],
  }),
  component: DashboardReturnDetailPage,
});

function formatDate(ts: number | undefined) {
  if (!ts) return "--";
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatMoney(amount: number, currencyCode = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
  }).format(amount / 100);
}

function formatLabel(value: string) {
  return value.replace(/_/g, " ");
}

function DashboardReturnDetailPage() {
  const { returnId } = Route.useParams();
  const settings = useQuery(api.settings.queries.getPublic) as any;
  const returnsEnabled =
    settings !== undefined &&
    settings?.plugins?.commerceReturnsEnabled === true;
  const ret = useQuery(
    (api as any).commerceReturns.queries.getMineById,
    returnsEnabled ? { returnId: returnId as any } : "skip",
  ) as any;

  return (
    <PublicPluginGate pluginId="commerceReturns">
      <div className="space-y-6">
        <div className="space-y-2">
          <Link to="/dashboard/returns" className="text-sm text-primary hover:underline">
            Back to returns
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">Return Detail</h1>
        </div>

        {ret === undefined ? (
          <div className="h-48 animate-pulse rounded-[2rem] bg-muted" />
        ) : !ret ? (
          <div className="rounded-[2rem] border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            Return {returnId} was not found.
          </div>
        ) : (
          <div className="space-y-6">
            <section className="rounded-[2rem] border border-border bg-card p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="font-mono text-lg font-semibold text-foreground">
                    {ret.returnNumber}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Order {ret.order?.orderNumber ?? "--"} • Submitted{" "}
                    {formatDate(ret.createdAt)}
                  </p>
                </div>
                <div className="text-right text-sm">
                  <p className="font-medium capitalize text-foreground">
                    {String(ret.status).replace(/_/g, " ")}
                  </p>
                  {ret.refundAmount ? (
                    <p className="text-muted-foreground">
                      Refund {formatMoney(ret.refundAmount, ret.order?.currencyCode)}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl bg-muted px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Reason
                  </p>
                  <p className="mt-1 text-sm font-medium text-foreground capitalize">
                    {String(ret.reason ?? "").replace(/_/g, " ")}
                  </p>
                </div>
                <div className="rounded-2xl bg-muted px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Refund Method
                  </p>
                  <p className="mt-1 text-sm font-medium text-foreground capitalize">
                    {ret.refundMethod ? String(ret.refundMethod).replace(/_/g, " ") : "--"}
                  </p>
                </div>
                <div className="rounded-2xl bg-muted px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Tracking Number
                  </p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {ret.trackingNumber ?? "--"}
                  </p>
                </div>
                <div className="rounded-2xl bg-muted px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Item Count
                  </p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {ret.itemCount ?? ret.returnItems?.length ?? 0}
                  </p>
                </div>
              </div>

              {ret.reasonDetails ? (
                <div className="mt-4 rounded-2xl border border-border px-4 py-3 text-sm text-muted-foreground">
                  {ret.reasonDetails}
                </div>
              ) : null}

              {ret.refundFailureReason ? (
                <div className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  Refund failure: {ret.refundFailureReason}
                </div>
              ) : null}

              {ret.returnShippingLabel ? (
                <a
                  href={ret.returnShippingLabel}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex text-sm font-medium text-primary hover:underline"
                >
                  Open return shipping label
                </a>
              ) : null}
            </section>

            <section className="rounded-[2rem] border border-border bg-card p-6 shadow-sm">
              <h2 className="text-xl font-semibold">Items</h2>
              <div className="mt-4 space-y-3">
                {(ret.orderItems ?? []).map((item: any) => (
                  <div
                    key={item.orderItemId}
                    className="rounded-2xl border border-border px-4 py-4 text-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-foreground">
                          {item.orderItem?.productTitle ?? String(item.orderItemId).slice(-8)}
                        </p>
                        <p className="text-muted-foreground">
                          Requested {item.quantityRequested}
                          {item.quantityApproved !== undefined
                            ? ` • Approved ${item.quantityApproved}`
                            : ""}
                          {item.quantityReceived !== undefined
                            ? ` • Received ${item.quantityReceived}`
                            : ""}
                          {item.quantityRestocked !== undefined
                            ? ` • Restocked ${item.quantityRestocked}`
                            : ""}
                        </p>
                      </div>
                      {item.orderItem?.lineTotalAmount ? (
                        <p className="font-medium text-foreground">
                          {formatMoney(
                            item.orderItem.lineTotalAmount,
                            ret.order?.currencyCode,
                          )}
                        </p>
                      ) : null}
                    </div>
                    {item.reason ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Reason: {item.reason}
                      </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      {item.conditionCode ? (
                        <span>Condition: {formatLabel(String(item.conditionCode))}</span>
                      ) : null}
                      {item.resolutionType ? (
                        <span>Disposition: {formatLabel(String(item.resolutionType))}</span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[2rem] border border-border bg-card p-6 shadow-sm">
              <h2 className="text-xl font-semibold">Timeline</h2>
              <div className="mt-4 space-y-3">
                {(ret.history ?? []).length ? (
                  ret.history.map((entry: any) => (
                    <div
                      key={entry._id}
                      className="rounded-2xl border border-border px-4 py-4 text-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="font-medium capitalize text-foreground">
                          {String(entry.eventType).replace(/_/g, " ")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(entry.createdAt)}
                        </p>
                      </div>
                      {entry.fromStatus || entry.toStatus ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {entry.fromStatus ?? "--"} → {entry.toStatus ?? "--"}
                        </p>
                      ) : null}
                      {entry.note ? (
                        <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
                          {entry.note}
                        </p>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No return history is available yet.
                  </p>
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </PublicPluginGate>
  );
}
