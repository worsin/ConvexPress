/**
 * Journal · dashboard.return — one return request: the summary as a receipt
 * list, the items and the timeline as rule-separated rows.
 */
import { formatMoney } from "@/lib/commerce/format";
import type { DashboardReturnSurfaceData } from "@/templates/packs/core/surfaces/dashboard.return";
import type { SurfaceProps } from "@/templates/sdk/types";

import { EmptyState, SmallCaps } from "../parts";
import { Notice, ReceiptList, ReceiptRow } from "../parts/extra-commerce";
import { BackLink, PageHeading, PageSkeleton, Row, RowList, Section, StatusPill, dashDateTime, textActionClasses } from "../parts/extra-dashboard";

function formatLabel(value: unknown) {
  return String(value ?? "").replace(/_/g, " ");
}

export default function JournalDashboardReturn({ data }: SurfaceProps<DashboardReturnSurfaceData>) {
  const { returnId, ret, hrefs } = data;

  if (ret === undefined) return <PageSkeleton rows={4} />;

  return (
    <div data-slot="dashboard-return" className="flex flex-col gap-10">
      <div className="flex flex-col gap-6">
        <BackLink to={hrefs.returns}>Back to returns</BackLink>
        <PageHeading
          eyebrow="Return"
          title={ret ? ret.returnNumber : "Return detail"}
          lede={
            ret ? (
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <SmallCaps>Order {ret.order?.orderNumber ?? "—"}</SmallCaps>
                <span className="text-muted-foreground/60" aria-hidden="true">
                  ·
                </span>
                <SmallCaps>Submitted {dashDateTime(ret.createdAt)}</SmallCaps>
              </span>
            ) : undefined
          }
          action={ret ? <StatusPill status={ret.status} /> : undefined}
        />
      </div>

      {!ret ? (
        <EmptyState eyebrow="Not found" title={`Return ${returnId} was not found.`} />
      ) : (
        <div className="flex flex-col gap-10">
          <ReceiptList>
            <ReceiptRow label="Reason" value={<span className="capitalize">{formatLabel(ret.reason)}</span>} />
            <ReceiptRow label="Refund method" value={ret.refundMethod ? <span className="capitalize">{formatLabel(ret.refundMethod)}</span> : "—"} />
            <ReceiptRow label="Tracking number" value={ret.trackingNumber ?? "—"} />
            <ReceiptRow label="Item count" value={ret.itemCount ?? ret.returnItems?.length ?? 0} />
            {ret.refundAmount ? <ReceiptRow label="Refund" value={formatMoney(ret.refundAmount, ret.order?.currencyCode)} /> : null}
          </ReceiptList>

          {ret.reasonDetails ? <p className="text-base leading-8 text-muted-foreground">{ret.reasonDetails}</p> : null}
          {ret.refundFailureReason ? <Notice tone="destructive" title="Refund failure">{ret.refundFailureReason}</Notice> : null}
          {ret.returnShippingLabel ? (
            <div>
              <a href={ret.returnShippingLabel} target="_blank" rel="noreferrer" className={textActionClasses("primary")}>
                Open return shipping label
              </a>
            </div>
          ) : null}

          <Section title="Items">
            <RowList>
              {(ret.orderItems ?? []).map((item: any) => (
                <Row key={item.orderItemId} className="gap-2">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex min-w-0 flex-col gap-1">
                      <p className="text-base font-medium text-foreground">{item.orderItem?.productTitle ?? String(item.orderItemId).slice(-8)}</p>
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <SmallCaps className="tabular-nums">Requested {item.quantityRequested}</SmallCaps>
                        {item.quantityApproved !== undefined ? (
                          <>
                            <Dot />
                            <SmallCaps className="tabular-nums">Approved {item.quantityApproved}</SmallCaps>
                          </>
                        ) : null}
                        {item.quantityReceived !== undefined ? (
                          <>
                            <Dot />
                            <SmallCaps className="tabular-nums">Received {item.quantityReceived}</SmallCaps>
                          </>
                        ) : null}
                        {item.quantityRestocked !== undefined ? (
                          <>
                            <Dot />
                            <SmallCaps className="tabular-nums">Restocked {item.quantityRestocked}</SmallCaps>
                          </>
                        ) : null}
                      </p>
                    </div>
                    {item.orderItem?.lineTotalAmount ? <p className="font-display text-lg tabular-nums text-foreground">{formatMoney(item.orderItem.lineTotalAmount, ret.order?.currencyCode)}</p> : null}
                  </div>
                  {item.reason ? <p className="text-sm text-muted-foreground">Reason: {item.reason}</p> : null}
                  {item.conditionCode || item.resolutionType ? (
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      {item.conditionCode ? <SmallCaps>Condition {formatLabel(item.conditionCode)}</SmallCaps> : null}
                      {item.conditionCode && item.resolutionType ? <Dot /> : null}
                      {item.resolutionType ? <SmallCaps>Disposition {formatLabel(item.resolutionType)}</SmallCaps> : null}
                    </p>
                  ) : null}
                </Row>
              ))}
            </RowList>
          </Section>

          <Section title="Timeline">
            {(ret.history ?? []).length ? (
              <RowList>
                {ret.history.map((entry: any) => (
                  <Row key={entry._id} className="gap-1.5 py-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-3">
                      <p className="text-base capitalize text-foreground">{formatLabel(entry.eventType)}</p>
                      <SmallCaps className="tabular-nums">{dashDateTime(entry.createdAt)}</SmallCaps>
                    </div>
                    {entry.fromStatus || entry.toStatus ? (
                      <p className="text-xs capitalize text-muted-foreground">
                        {formatLabel(entry.fromStatus) || "—"} → {formatLabel(entry.toStatus) || "—"}
                      </p>
                    ) : null}
                    {entry.note ? <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{entry.note}</p> : null}
                  </Row>
                ))}
              </RowList>
            ) : (
              <p className="text-sm leading-6 text-muted-foreground">No return history is available yet.</p>
            )}
          </Section>
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
