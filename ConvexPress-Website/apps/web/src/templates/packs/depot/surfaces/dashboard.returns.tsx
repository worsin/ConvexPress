/**
 * Depot · dashboard.returns — the member's return requests as a dense
 * `DataTable`: return number (with tracking), order, submitted date, item
 * count, reason (with details and admin notes), tabular refund, status badge
 * with the step strip, and the detail link. Same load-more as Core.
 */
import { Link } from "@tanstack/react-router";

import { formatMoney } from "@/lib/commerce/format";
import type { DashboardReturnsSurfaceData } from "@/templates/packs/core/surfaces/dashboard.returns";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Button, DataTable, EmptyState, Td, Th } from "../parts";
import { DashboardPageHeader, StatusBadge, Steps, TableSkeleton, dateOrDash, formatStatus } from "../parts/extra-dashboard";

const STATUS_STEPS = ["requested", "approved", "received", "refund_pending", "refunded", "completed"] as const;

export default function DepotDashboardReturns({ data }: SurfaceProps<DashboardReturnsSurfaceData>) {
  const { returns, status, hrefs, actions } = data;

  return (
    <div data-slot="dashboard-returns" data-pack="depot" className="flex flex-col gap-4">
      <DashboardPageHeader eyebrow="Shop" title="My returns" description="Track your return requests and refund status." meta={status !== "LoadingFirstPage" ? `${returns.length} ${returns.length === 1 ? "return" : "returns"}` : undefined} />

      {status === "LoadingFirstPage" ? (
        <TableSkeleton rows={3} />
      ) : returns.length === 0 ? (
        <EmptyState title="You don't have any return requests yet." description="Start a return from an eligible order's detail page." />
      ) : (
        <>
          <DataTable caption="Your returns">
            <thead>
              <tr>
                <Th>Return</Th>
                <Th>Order</Th>
                <Th>Submitted</Th>
                <Th className="text-right">Items</Th>
                <Th>Reason</Th>
                <Th className="text-right">Refund</Th>
                <Th>Status</Th>
                <Th>
                  <span className="sr-only">Details</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {returns.map((ret: any) => {
                const rejected = ret.status === "rejected";
                const stepIndex = STATUS_STEPS.indexOf(ret.status);
                return (
                  <tr key={ret._id} className="border-t border-border align-top">
                    <Td className="whitespace-nowrap">
                      <Link to={hrefs.returnDetail(ret._id)} className="font-mono font-semibold tabular-nums text-foreground hover:text-primary">
                        {ret.returnNumber}
                      </Link>
                      {ret.trackingNumber ? <span className="block text-xs tabular-nums text-muted-foreground">Tracking {ret.trackingNumber}</span> : null}
                    </Td>
                    <Td className="whitespace-nowrap tabular-nums text-muted-foreground">{ret.orderNumber ?? "N/A"}</Td>
                    <Td className="whitespace-nowrap text-muted-foreground">{dateOrDash(ret.createdAt)}</Td>
                    <Td align="right" className="text-muted-foreground">
                      {ret.itemCount ?? ret.returnItems?.length ?? ret.items?.length ?? 0}
                    </Td>
                    <Td className="min-w-48">
                      <span className="text-foreground">{formatStatus(ret.reason)}</span>
                      {ret.reasonDetails ? <span className="block text-xs text-muted-foreground">{ret.reasonDetails}</span> : null}
                      {ret.notes ? (
                        <span className="mt-1 block rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                          <span className="font-semibold">Admin notes:</span> {ret.notes}
                        </span>
                      ) : null}
                    </Td>
                    <Td align="right" className="whitespace-nowrap font-semibold text-foreground">
                      {ret.refundAmount ? formatMoney(ret.refundAmount) : "—"}
                    </Td>
                    <Td className="min-w-36">
                      <div className="flex flex-col gap-1.5">
                        <StatusBadge status={ret.status} label={rejected ? "Rejected" : ret.status === "refund_pending" ? "Refund pending" : undefined} />
                        <Steps steps={STATUS_STEPS} current={stepIndex} failed={rejected} />
                        <span className="text-[10px] text-muted-foreground">{rejected ? "Return was rejected" : `Step ${Math.max(stepIndex, 0) + 1} of ${STATUS_STEPS.length}`}</span>
                      </div>
                    </Td>
                    <Td align="right" className="whitespace-nowrap">
                      <Link to={hrefs.returnDetail(ret._id)} className="font-medium text-primary hover:underline">
                        View
                      </Link>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>

          {status === "CanLoadMore" || status === "LoadingMore" ? (
            <div className="flex justify-center">
              <Button variant="secondary" size="sm" onClick={actions.loadMore} disabled={status === "LoadingMore"}>
                {status === "LoadingMore" ? "Loading more..." : "Load more returns"}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
