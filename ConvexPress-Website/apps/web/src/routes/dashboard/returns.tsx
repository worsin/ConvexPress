import { createFileRoute, Link } from "@tanstack/react-router";
import { usePaginatedQuery, useQuery } from "convex/react";
import {
  RotateCcw,
  Clock,
  CheckCircle2,
  XCircle,
  PackageCheck,
  DollarSign,
  Package,
} from "lucide-react";
import { api } from "@convexpress-website/backend/generated/api";
import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";

export const Route = createFileRoute("/dashboard/returns")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex" }],
  }),
  component: DashboardReturnsPage,
});

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatDate(ts: number | undefined) {
  if (!ts) return "--";
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatMoney(amount: number, currencyCode = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
  }).format(amount / 100);
}

const STATUS_CONFIG: Record<
  string,
  { label: string; style: string; icon: React.ElementType }
> = {
  requested: {
    label: "Requested",
    style: "bg-secondary text-secondary-foreground",
    icon: Clock,
  },
  approved: {
    label: "Approved",
    style: "bg-primary/10 text-primary",
    icon: CheckCircle2,
  },
  rejected: {
    label: "Rejected",
    style: "bg-destructive/10 text-destructive",
    icon: XCircle,
  },
  received: {
    label: "Received",
    style: "bg-secondary text-secondary-foreground",
    icon: PackageCheck,
  },
  refund_pending: {
    label: "Refund Pending",
    style: "bg-primary/10 text-primary",
    icon: Clock,
  },
  refunded: {
    label: "Refunded",
    style: "bg-secondary text-secondary-foreground",
    icon: DollarSign,
  },
  completed: {
    label: "Completed",
    style: "bg-primary/10 text-primary",
    icon: CheckCircle2,
  },
};

const STATUS_STEPS = [
  "requested",
  "approved",
  "received",
  "refund_pending",
  "refunded",
  "completed",
];

/* ------------------------------------------------------------------ */
/*  Status Badge                                                       */
/* ------------------------------------------------------------------ */

function ReturnStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    style: "bg-muted text-muted-foreground",
    icon: Package,
  };
  const Icon = config.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${config.style}`}
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Status Progress                                                    */
/* ------------------------------------------------------------------ */

function StatusProgress({ status }: { status: string }) {
  if (status === "rejected") {
    return (
      <div className="flex items-center gap-1">
        <div className="h-1.5 flex-1 rounded-full bg-destructive" />
        <span className="text-[10px] text-destructive">Rejected</span>
      </div>
    );
  }

  const currentIndex = STATUS_STEPS.indexOf(status);

  return (
    <div className="flex items-center gap-1">
      {STATUS_STEPS.map((step, i) => (
        <div key={step} className="flex flex-1 items-center gap-1">
          <div
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i <= currentIndex ? "bg-primary" : "bg-muted"
            }`}
          />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Return Card                                                        */
/* ------------------------------------------------------------------ */

function ReturnCard({ ret }: { ret: any }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h3 className="font-mono text-sm font-semibold text-foreground">
            {ret.returnNumber}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Order: {ret.orderNumber ?? "N/A"} -- Submitted{" "}
            {formatDate(ret.createdAt)}
          </p>
        </div>
        <ReturnStatusBadge status={ret.status} />
      </div>

      {/* Progress */}
      <div className="px-5 py-3">
        <StatusProgress status={ret.status} />
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
          {ret.status === "rejected" ? (
            <span>Return was rejected</span>
          ) : (
            STATUS_STEPS.map((step) => (
              <span key={step} className="capitalize">
                {step}
              </span>
            ))
          )}
        </div>
      </div>

      {/* Details */}
      <div className="border-t border-border px-5 py-4">
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <div>
            <span className="text-muted-foreground">Items: </span>
            <span className="font-medium text-foreground">
              {ret.itemCount ?? ret.returnItems?.length ?? ret.items?.length ?? 0}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Reason: </span>
            <span className="font-medium text-foreground capitalize">
              {(ret.reason ?? "").replace(/_/g, " ")}
            </span>
          </div>
          {ret.refundAmount ? (
            <div>
              <span className="text-muted-foreground">Refund: </span>
              <span className="font-medium text-foreground">
                {formatMoney(ret.refundAmount)}
              </span>
            </div>
          ) : null}
        </div>

        {ret.reasonDetails && (
          <p className="mt-2 text-xs text-muted-foreground">
            {ret.reasonDetails}
          </p>
        )}

        {ret.notes && (
          <div className="mt-3 rounded-xl bg-muted px-3 py-2">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium">Admin notes:</span> {ret.notes}
            </p>
          </div>
        )}

        {ret.trackingNumber && (
          <p className="mt-2 text-xs text-muted-foreground">
            Tracking: {ret.trackingNumber}
          </p>
        )}

        <div className="mt-4">
          <Link
            to={"/dashboard/returns/$returnId" as any}
            params={{ returnId: ret._id } as any}
            className="text-xs font-medium text-primary hover:underline"
          >
            View return details
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

function DashboardReturnsPage() {
  const settings = useQuery(api.settings.queries.getPublic) as any;
  const returnsEnabled =
    settings !== undefined &&
    settings?.plugins?.commerceReturnsEnabled === true;
  const result = usePaginatedQuery(
    (api as any).commerceReturns.queries.getMyReturns,
    returnsEnabled ? {} : "skip",
    { initialNumItems: 10 },
  ) as any;

  const returns = result.results ?? [];

  return (
    <PublicPluginGate pluginId="commerceReturns">
      <div className="space-y-6">
        <div>
          <h1 className="text-sm font-medium text-foreground">My Returns</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Track your return requests and refund status.
          </p>
        </div>

        {result.status === "LoadingFirstPage" ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-40 animate-pulse rounded-2xl bg-muted"
              />
            ))}
          </div>
        ) : returns.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center">
            <RotateCcw className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">
              You don't have any return requests yet.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {returns.map((ret: any) => (
              <ReturnCard key={ret._id} ret={ret} />
            ))}
            {result.status === "CanLoadMore" ||
            result.status === "LoadingMore" ? (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => result.loadMore(10)}
                  disabled={result.status === "LoadingMore"}
                  className="rounded-xl border border-border px-4 py-2 text-xs font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {result.status === "LoadingMore"
                    ? "Loading more..."
                    : "Load more returns"}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </PublicPluginGate>
  );
}
