/**
 * Journal · dashboard.orderReturn — start a return: pick eligible items with
 * quantities and per-item notes (rule-separated rows), choose a reason (pills),
 * add details (underline textarea), submit (pill). The draft is local UI
 * state; eligibility and the request mutation come from the loader.
 */
import { useState } from "react";

import { formatMoney } from "@/lib/commerce/format";
import type { DashboardOrderReturnSurfaceData } from "@/templates/packs/core/surfaces/dashboard.orderReturn";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Button, EmptyState, Eyebrow, LinkButton, SmallCaps, UnderlineInput } from "../parts";
import { ReceiptList, ReceiptRow, UnderlineSelect } from "../parts/extra-commerce";
import { BackButton, ChoicePill, PageHeading, Row, RowList, RowSkeleton, Section, UnderlineTextarea, dashDate } from "../parts/extra-dashboard";

const REASON_OPTIONS = [
  { value: "defective", label: "Defective / Damaged" },
  { value: "wrong_item", label: "Wrong item received" },
  { value: "not_as_described", label: "Not as described" },
  { value: "changed_mind", label: "Changed my mind" },
  { value: "other", label: "Other" },
];

export default function JournalDashboardOrderReturn({ data }: SurfaceProps<DashboardOrderReturnSurfaceData>) {
  const { eligibility, submitting, submitted, hrefs, actions } = data;

  const [selectedItems, setSelectedItems] = useState<Record<string, { selected: boolean; quantity: number; reason: string }>>({});
  const [mainReason, setMainReason] = useState("defective");
  const [additionalNotes, setAdditionalNotes] = useState("");

  function toggleItem(itemId: string, maxQty: number) {
    setSelectedItems((prev) => {
      const current = prev[itemId];
      if (current?.selected) {
        const { [itemId]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [itemId]: { selected: true, quantity: maxQty, reason: "" } };
    });
  }

  function updateItemQuantity(itemId: string, quantity: number) {
    setSelectedItems((prev) => ({ ...prev, [itemId]: { ...prev[itemId], quantity } }));
  }

  function updateItemReason(itemId: string, reason: string) {
    setSelectedItems((prev) => ({ ...prev, [itemId]: { ...prev[itemId], reason } }));
  }

  const selectedCount = Object.values(selectedItems).filter((item) => item.selected).length;

  function handleSubmit() {
    const items = Object.entries(selectedItems)
      .filter(([, value]) => value.selected)
      .map(([itemId, value]) => ({
        orderItemId: itemId,
        quantity: value.quantity,
        ...(value.reason ? { reason: value.reason } : {}),
      }));
    void actions.submit({
      reason: mainReason,
      ...(additionalNotes.trim() ? { reasonDetails: additionalNotes.trim() } : {}),
      items,
    });
  }

  if (submitted) {
    return (
      <div data-slot="dashboard-order-return" className="mx-auto flex w-full max-w-lg flex-col items-center gap-6 border-y border-border py-14 text-center md:py-20">
        <Eyebrow>Return requested</Eyebrow>
        <h1 className="font-display text-3xl leading-[1.08] tracking-tight text-foreground text-balance md:text-4xl">Return request submitted</h1>
        <p className="max-w-[40ch] text-base leading-8 text-muted-foreground text-balance">Your return request has been submitted successfully. We will review it and get back to you soon.</p>
        <div className="flex flex-col items-center gap-1">
          <SmallCaps>Return number</SmallCaps>
          <p className="font-display text-2xl tabular-nums text-foreground">{submitted.returnNumber}</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <LinkButton to={hrefs.returns} variant="primary">
            View my returns
          </LinkButton>
          <Button variant="ghost" onClick={actions.backToDashboard}>
            Back to dashboard
          </Button>
        </div>
      </div>
    );
  }

  const currency = eligibility?.currencyCode ?? "USD";

  return (
    <div data-slot="dashboard-order-return" className="flex flex-col gap-10">
      <div className="flex flex-col gap-6">
        <BackButton onClick={actions.backToDashboard}>Back</BackButton>
        <PageHeading eyebrow="Returns" title="Request a return" lede="Select items you'd like to return and provide a reason." />
      </div>

      {eligibility === undefined ? (
        <RowSkeleton rows={3} />
      ) : !eligibility ? (
        <EmptyState eyebrow="Not found" title="Order not found or you don't have access to this order." />
      ) : !eligibility.isEligible ? (
        <EmptyState eyebrow="Not eligible" title={eligibility.ineligibleReason ?? "This order is not currently eligible for returns."} />
      ) : (
        <div className="flex flex-col gap-10">
          {/* Order info */}
          <ReceiptList>
            <ReceiptRow label="Order" value={<span className="font-medium">{eligibility.orderNumber}</span>} />
            <ReceiptRow label="Total" value={formatMoney(eligibility.totalAmount ?? 0, currency)} />
            <ReceiptRow label="Policy" value={`${eligibility.returnWindowDays}-day return window${eligibility.requireDeliveryBeforeReturn ? " after delivery confirmation" : ""}`} />
            {eligibility.returnWindowEndsAt ? <ReceiptRow label="Window ends" value={dashDate(eligibility.returnWindowEndsAt)} /> : null}
          </ReceiptList>

          {/* Items */}
          <Section title="Select items to return">
            <RowList>
              {(eligibility.items ?? []).map((item: any) => {
                const draft = selectedItems[item.orderItemId];
                const isSelected = Boolean(draft?.selected);
                const inputId = `return-item-${item.orderItemId}`;
                return (
                  <Row key={item.orderItemId} className={!item.eligible ? "opacity-60" : undefined}>
                    <label htmlFor={inputId} className={item.eligible ? "flex cursor-pointer items-start gap-4" : "flex cursor-not-allowed items-start gap-4"}>
                      <input id={inputId} type="checkbox" checked={isSelected} disabled={!item.eligible} onChange={() => toggleItem(item.orderItemId, item.quantityAvailableToReturn ?? 1)} className="mt-1.5 size-4 shrink-0 accent-primary" />
                      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <span className="text-base text-foreground">{item.productTitle}</span>
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <SmallCaps className="tabular-nums">Ordered {item.quantityOrdered}</SmallCaps>
                          <Dot />
                          <SmallCaps className="tabular-nums">Returnable {item.quantityAvailableToReturn}</SmallCaps>
                          {item.sku ? (
                            <>
                              <Dot />
                              <SmallCaps>SKU {item.sku}</SmallCaps>
                            </>
                          ) : null}
                          <Dot />
                          <SmallCaps className="tabular-nums">{formatMoney(item.lineTotalAmount ?? 0, currency)}</SmallCaps>
                        </span>
                        {!item.eligible ? <span className="text-xs text-muted-foreground">This item has no remaining returnable quantity.</span> : null}
                      </span>
                    </label>

                    {isSelected && item.eligible ? (
                      <div className="grid gap-5 pl-8 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-8">
                        <div className="flex flex-col gap-1.5">
                          <label htmlFor={`${inputId}-qty`} className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                            Return qty
                          </label>
                          <UnderlineSelect id={`${inputId}-qty`} value={draft?.quantity ?? item.quantityAvailableToReturn} onChange={(event) => updateItemQuantity(item.orderItemId, Number(event.target.value))} className="h-10 text-sm">
                            {Array.from({ length: item.quantityAvailableToReturn ?? 1 }, (_, index) => index + 1).map((n) => (
                              <option key={n} value={n}>
                                {n}
                              </option>
                            ))}
                          </UnderlineSelect>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label htmlFor={`${inputId}-reason`} className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                            Item note
                          </label>
                          <UnderlineInput id={`${inputId}-reason`} value={draft?.reason ?? ""} onChange={(event) => updateItemReason(item.orderItemId, event.target.value)} placeholder="Item-specific reason (optional)" className="h-10 text-sm" />
                        </div>
                      </div>
                    ) : null}
                  </Row>
                );
              })}
            </RowList>
          </Section>

          {/* Reason */}
          <Section title="Reason for return">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Reason for return">
              {REASON_OPTIONS.map((option) => (
                <ChoicePill key={option.value} selected={mainReason === option.value} onClick={() => setMainReason(option.value)}>
                  {option.label}
                </ChoicePill>
              ))}
            </div>
          </Section>

          {/* Notes */}
          <Section title="Additional notes">
            <label className="flex flex-col gap-1.5">
              <span className="sr-only">Additional notes</span>
              <UnderlineTextarea value={additionalNotes} onChange={(event) => setAdditionalNotes(event.target.value)} placeholder="Provide any additional details about your return..." rows={4} />
            </label>
          </Section>

          {/* Submit */}
          <div className="flex flex-col gap-4 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm leading-6 text-muted-foreground">{selectedCount === 0 ? "Select items to return" : `${selectedCount} item(s) selected for return`}</p>
            <Button variant="primary" onClick={handleSubmit} disabled={selectedCount === 0 || submitting}>
              {submitting ? "Submitting..." : "Submit return request"}
            </Button>
          </div>
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
