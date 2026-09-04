/**
 * Depot · dashboard.return — one return request: facts as a label table
 * (order, submitted, reason, refund method, tracking, items, refund), the
 * details and refund-failure notices, the shipping label link, then the
 * items and the timeline as `DataTable`s. Same data and links as Core.
 */
import { formatMoney } from "@/lib/commerce/format";
import type { DashboardReturnSurfaceData } from "@/templates/packs/core/surfaces/dashboard.return";
import type { SurfaceProps } from "@/templates/sdk/types";

import { DataTable, EmptyState, Skeleton, Td, Th } from "../parts";
import { Notice } from "../parts/extra-commerce";
import { DashboardPageHeader, DashboardSection, StatusBadge, formatDateTime, formatStatus } from "../parts/extra-dashboard";

export default function DepotDashboardReturn({ data }: SurfaceProps<DashboardReturnSurfaceData>) {
  const { returnId, ret, hrefs } = data;
  const currency = ret?.order?.currencyCode;

  return (
    <div data-slot="dashboard-return" data-pack="depot" className="flex flex-col gap-4">
      <DashboardPageHeader
        eyebrow="Shop"
        title={ret ? <span className="font-mono">{ret.returnNumber}</span> : "Return detail"}
        description={ret ? `Order ${ret.order?.orderNumber ?? "—"} · Submitted ${formatDateTime(ret.createdAt)}` : undefined}
        back={{ label: "Back to returns", to: hrefs.returns }}
        aside={ret ? <StatusBadge status={ret.status} /> : undefined}
      />

      {ret === undefined ? (
        <div className="flex flex-col gap-3" aria-hidden="true">
          <Skeleton className="h-40" />
          <Skeleton className="h-32" />
        </div>
      ) : !ret ? (
        <EmptyState title={`Return ${returnId} was not found.`} description="Check the return number, or open your returns list to find it." />
      ) : (
        <>
          <DataTable
            caption="Return summary"
            firstColumnLabel
            rows={[
              { key: "order", cells: ["Order", <span className="tabular-nums">{ret.order?.orderNumber ?? "—"}</span>] },
              { key: "submitted", cells: ["Submitted", formatDateTime(ret.createdAt)] },
              { key: "reason", cells: ["Reason", formatStatus(ret.reason)] },
              { key: "method", cells: ["Refund method", ret.refundMethod ? formatStatus(String(ret.refundMethod)) : "—"] },
              { key: "tracking", cells: ["Tracking number", <span className="tabular-nums">{ret.trackingNumber ?? "—"}</span>] },
              { key: "count", cells: ["Item count", <span className="tabular-nums">{ret.itemCount ?? ret.returnItems?.length ?? 0}</span>] },
              ...(ret.refundAmount ? [{ key: "refund", cells: [<span className="font-semibold text-foreground">Refund</span>, <span className="text-lg font-semibold tabular-nums text-foreground">{formatMoney(ret.refundAmount, currency)}</span>] }] : []),
            ]}
          />

          {ret.reasonDetails ? <Notice title="Details">{ret.reasonDetails}</Notice> : null}
          {ret.refundFailureReason ? <Notice tone="danger" title="Refund failure">{ret.refundFailureReason}</Notice> : null}
          {ret.returnShippingLabel ? (
            <a href={ret.returnShippingLabel} target="_blank" rel="noreferrer" className="self-start text-[13px] font-medium text-primary hover:underline">
              Open return shipping label
            </a>
          ) : null}

          <DashboardSection title="Items" count={(ret.orderItems ?? []).length || undefined}>
            <DataTable caption="Returned items">
              <thead>
                <tr>
                  <Th>Item</Th>
                  <Th className="text-right">Requested</Th>
                  <Th className="text-right">Approved</Th>
                  <Th className="text-right">Received</Th>
                  <Th className="text-right">Restocked</Th>
                  <Th>Condition</Th>
                  <Th>Disposition</Th>
                  <Th className="text-right">Amount</Th>
                </tr>
              </thead>
              <tbody>
                {(ret.orderItems ?? []).map((item: any) => (
                  <tr key={item.orderItemId} className="border-t border-border align-top">
                    <Td className="min-w-48">
                      <p className="font-semibold text-foreground">{item.orderItem?.productTitle ?? String(item.orderItemId).slice(-8)}</p>
                      {item.reason ? <p className="text-xs text-muted-foreground">Reason: {item.reason}</p> : null}
                    </Td>
                    <Td align="right">{item.quantityRequested}</Td>
                    <Td align="right" className="text-muted-foreground">
                      {item.quantityApproved ?? "—"}
                    </Td>
                    <Td align="right" className="text-muted-foreground">
                      {item.quantityReceived ?? "—"}
                    </Td>
                    <Td align="right" className="text-muted-foreground">
                      {item.quantityRestocked ?? "—"}
                    </Td>
                    <Td className="text-muted-foreground">{item.conditionCode ? formatStatus(String(item.conditionCode)) : "—"}</Td>
                    <Td className="text-muted-foreground">{item.resolutionType ? formatStatus(String(item.resolutionType)) : "—"}</Td>
                    <Td align="right" className="whitespace-nowrap font-semibold text-foreground">
                      {item.orderItem?.lineTotalAmount ? formatMoney(item.orderItem.lineTotalAmount, currency) : "—"}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </DashboardSection>

          <DashboardSection title="Timeline">
            {(ret.history ?? []).length ? (
              <DataTable caption="Return history">
                <thead>
                  <tr>
                    <Th>Event</Th>
                    <Th>Status change</Th>
                    <Th>Note</Th>
                    <Th className="text-right">When</Th>
                  </tr>
                </thead>
                <tbody>
                  {ret.history.map((entry: any) => (
                    <tr key={entry._id} className="border-t border-border align-top">
                      <Td className="whitespace-nowrap font-medium text-foreground">{formatStatus(String(entry.eventType))}</Td>
                      <Td className="whitespace-nowrap text-muted-foreground">{entry.fromStatus || entry.toStatus ? `${entry.fromStatus ?? "—"} → ${entry.toStatus ?? "—"}` : "—"}</Td>
                      <Td className="min-w-48 whitespace-pre-wrap text-muted-foreground">{entry.note || "—"}</Td>
                      <Td align="right" className="whitespace-nowrap text-muted-foreground">
                        {formatDateTime(entry.createdAt)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            ) : (
              <div className="rounded-md border border-border bg-card px-3 py-2 text-[13px] text-muted-foreground">No return history is available yet.</div>
            )}
          </DashboardSection>
        </>
      )}
    </div>
  );
}
