/**
 * Journal · dashboard.returns — the member's return requests as
 * rule-separated rows: return number, small-caps order · date line, status
 * pill, a small-caps step line for progress, the details, admin notes and
 * the link to the return. Load-more as a ghost pill.
 */
import { Link } from "@tanstack/react-router";

import { formatMoney } from "@/lib/commerce/format";
import type { DashboardReturnsSurfaceData } from "@/templates/packs/core/surfaces/dashboard.returns";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Button, EmptyState, SmallCaps } from "../parts";
import { Notice } from "../parts/extra-commerce";
import { PageHeading, Row, RowList, RowSkeleton, StatusPill, StepLine, dashDate, textActionClasses } from "../parts/extra-dashboard";

const STATUS_LABEL: Record<string, string> = {
  requested: "Requested",
  approved: "Approved",
  rejected: "Rejected",
  received: "Received",
  refund_pending: "Refund pending",
  refunded: "Refunded",
  completed: "Completed",
};

const STATUS_STEPS = [
  { key: "requested", label: "Requested" },
  { key: "approved", label: "Approved" },
  { key: "received", label: "Received" },
  { key: "refund_pending", label: "Refund pending" },
  { key: "refunded", label: "Refunded" },
  { key: "completed", label: "Completed" },
];

export default function JournalDashboardReturns({ data }: SurfaceProps<DashboardReturnsSurfaceData>) {
  const { returns, status, hrefs, actions } = data;

  return (
    <div data-slot="dashboard-returns" className="flex flex-col gap-10">
      <PageHeading eyebrow="Purchases" title="My returns" lede="Track your return requests and refund status." />

      {status === "LoadingFirstPage" ? (
        <RowSkeleton rows={3} />
      ) : returns.length === 0 ? (
        <EmptyState eyebrow="Returns" title="You don't have any return requests yet." />
      ) : (
        <div className="flex flex-col gap-8">
          <RowList aria-label="Return requests">
            {returns.map((ret: any) => (
              <Row key={ret._id} className="gap-4 py-7">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <p className="font-display text-xl leading-snug text-foreground">{ret.returnNumber}</p>
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <SmallCaps>Order {ret.orderNumber ?? "N/A"}</SmallCaps>
                      <Dot />
                      <SmallCaps>Submitted {dashDate(ret.createdAt)}</SmallCaps>
                    </p>
                  </div>
                  <StatusPill status={ret.status} label={STATUS_LABEL[ret.status] ?? ret.status} />
                </div>

                <StepLine steps={STATUS_STEPS} current={ret.status} failed={ret.status === "rejected" ? "Return was rejected" : undefined} />

                <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
                  <div className="flex items-baseline gap-2">
                    <dt className="text-muted-foreground">Items</dt>
                    <dd className="tabular-nums text-foreground">{ret.itemCount ?? ret.returnItems?.length ?? ret.items?.length ?? 0}</dd>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <dt className="text-muted-foreground">Reason</dt>
                    <dd className="capitalize text-foreground">{String(ret.reason ?? "").replace(/_/g, " ")}</dd>
                  </div>
                  {ret.refundAmount ? (
                    <div className="flex items-baseline gap-2">
                      <dt className="text-muted-foreground">Refund</dt>
                      <dd className="tabular-nums text-foreground">{formatMoney(ret.refundAmount)}</dd>
                    </div>
                  ) : null}
                </dl>

                {ret.reasonDetails ? <p className="text-sm leading-6 text-muted-foreground">{ret.reasonDetails}</p> : null}
                {ret.notes ? <Notice title="Admin notes">{ret.notes}</Notice> : null}
                {ret.trackingNumber ? <SmallCaps>Tracking {ret.trackingNumber}</SmallCaps> : null}

                <div>
                  <Link to={hrefs.returnDetail(ret._id) as any} className={textActionClasses("primary")}>
                    View return details
                  </Link>
                </div>
              </Row>
            ))}
          </RowList>

          {status === "CanLoadMore" || status === "LoadingMore" ? (
            <div className="flex justify-center">
              <Button variant="ghost" onClick={actions.loadMore} disabled={status === "LoadingMore"}>
                {status === "LoadingMore" ? "Loading more..." : "Load more returns"}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function Dot() {
  return (
    <span className="text-muted-foreground/60" aria-hidden="true">
      ·
    </span>
  );
}
