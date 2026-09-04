/**
 * Depot · dashboard.orderReturn — start a return: the order facts as a label
 * table, eligible items as selectable rows (quantity select + per-item note
 * when selected), reason chips, notes, and a submit bar. The draft is local;
 * eligibility and the request come from the loader. Same validation gate
 * (at least one item) and states as Core.
 */
import { CheckCircle2, RotateCcw } from "lucide-react";
import { useState } from "react";

import { formatMoney } from "@/lib/commerce/format";
import { cn } from "@/lib/utils";
import type { DashboardOrderReturnSurfaceData } from "@/templates/packs/core/surfaces/dashboard.orderReturn";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Button, Card, Chip, DataTable, EmptyState, Label, LinkButton, Select, Skeleton } from "../parts";
import { Band, Field, Input, Textarea } from "../parts/extra-plugins";
import { Checkbox, DashboardPageHeader, DashboardSection, dateOrDash } from "../parts/extra-dashboard";

const REASON_OPTIONS = [
  { value: "defective", label: "Defective / damaged" },
  { value: "wrong_item", label: "Wrong item received" },
  { value: "not_as_described", label: "Not as described" },
  { value: "changed_mind", label: "Changed my mind" },
  { value: "other", label: "Other" },
];

export default function DepotDashboardOrderReturn({ data }: SurfaceProps<DashboardOrderReturnSurfaceData>) {
  const { eligibility, submitting, submitted, hrefs, actions } = data;

  const [selectedItems, setSelectedItems] = useState<Record<string, { selected: boolean; quantity: number; reason: string }>>({});
  const [mainReason, setMainReason] = useState("defective");
  const [additionalNotes, setAdditionalNotes] = useState("");

  function toggleItem(itemId: string, maxQty: number) {
    setSelectedItems((prev) => {
      const current = prev[itemId];
      if (current?.selected) {
        const { [itemId]: _, ...rest } = prev;
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
      .map(([itemId, value]) => ({ orderItemId: itemId, quantity: value.quantity, ...(value.reason ? { reason: value.reason } : {}) }));
    void actions.submit({ reason: mainReason, ...(additionalNotes.trim() ? { reasonDetails: additionalNotes.trim() } : {}), items });
  }

  if (submitted) {
    return (
      <div data-slot="dashboard-order-return" data-pack="depot">
        <Band label="Return request submitted" cardClassName="items-center text-center">
          <CheckCircle2 className="size-8 text-primary" aria-hidden="true" />
          <h1 className="text-lg font-semibold text-foreground">Return request submitted</h1>
          <p className="text-[13px] leading-5 text-muted-foreground">Your return request has been submitted successfully. We will review it and get back to you soon.</p>
          <div className="flex w-full flex-col gap-0.5 rounded-md border border-border bg-muted/40 px-3 py-2">
            <Label>Return number</Label>
            <p className="font-mono text-lg font-semibold tabular-nums text-foreground">{submitted.returnNumber}</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row">
            <LinkButton to={hrefs.returns} className="flex-1">
              View my returns
            </LinkButton>
            <Button variant="secondary" onClick={actions.backToDashboard} className="flex-1">
              Back to dashboard
            </Button>
          </div>
        </Band>
      </div>
    );
  }

  const currency = eligibility?.currencyCode ?? "USD";

  return (
    <div data-slot="dashboard-order-return" data-pack="depot" className="flex flex-col gap-4">
      <DashboardPageHeader eyebrow="Shop" title="Request a return" description="Select items you'd like to return and provide a reason." back={{ label: "Back", onClick: actions.backToDashboard }} />

      {eligibility === undefined ? (
        <div className="flex flex-col gap-3" aria-hidden="true">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : !eligibility ? (
        <EmptyState title="Order not found" description="Order not found or you don't have access to this order." />
      ) : !eligibility.isEligible ? (
        <EmptyState title="Not eligible for returns" description={eligibility.ineligibleReason ?? "This order is not currently eligible for returns."} />
      ) : (
        <>
          <DataTable
            caption="Order"
            firstColumnLabel
            rows={[
              { key: "order", cells: ["Order", <span className="font-mono font-semibold tabular-nums text-foreground">{eligibility.orderNumber}</span>] },
              { key: "total", cells: ["Total", <span className="font-semibold tabular-nums text-foreground">{formatMoney(eligibility.totalAmount ?? 0, currency)}</span>] },
              { key: "policy", cells: ["Policy", `${eligibility.returnWindowDays}-day return window${eligibility.requireDeliveryBeforeReturn ? " after delivery confirmation." : "."}`] },
              ...(eligibility.returnWindowEndsAt ? [{ key: "window", cells: ["Window ends", dateOrDash(eligibility.returnWindowEndsAt)] }] : []),
            ]}
          />

          <DashboardSection title="Select items to return" count={selectedCount > 0 ? `${selectedCount} selected` : undefined}>
            <div className="flex flex-col gap-2">
              {(eligibility.items ?? []).map((item: any) => {
                const isSelected = Boolean(selectedItems[item.orderItemId]?.selected);
                const available = item.quantityAvailableToReturn ?? 1;
                return (
                  <Card key={item.orderItemId} className={cn("flex flex-col gap-3 p-3 transition-colors", isSelected && "border-primary bg-primary/5")}>
                    <label className={cn("flex items-start gap-3", item.eligible ? "cursor-pointer" : "cursor-not-allowed")}>
                      <Checkbox checked={isSelected} onChange={() => toggleItem(item.orderItemId, available)} disabled={!item.eligible} className="mt-0.5" />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-sm font-semibold text-foreground">{item.productTitle}</span>
                        <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs tabular-nums text-muted-foreground">
                          <span>Ordered {item.quantityOrdered}</span>
                          <span>Available to return {item.quantityAvailableToReturn}</span>
                          {item.sku ? <span>SKU {item.sku}</span> : null}
                          <span>{formatMoney(item.lineTotalAmount ?? 0, currency)}</span>
                        </span>
                        {!item.eligible ? <span className="text-xs text-muted-foreground">This item has no remaining returnable quantity.</span> : null}
                      </span>
                    </label>

                    {isSelected && item.eligible ? (
                      <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-[8rem_1fr]">
                        <Field label="Return qty" htmlFor={`qty-${item.orderItemId}`}>
                          <Select id={`qty-${item.orderItemId}`} value={selectedItems[item.orderItemId]?.quantity ?? available} onChange={(event) => updateItemQuantity(item.orderItemId, Number(event.target.value))} className="w-full">
                            {Array.from({ length: available }, (_, index) => index + 1).map((quantity) => (
                              <option key={quantity} value={quantity}>
                                {quantity}
                              </option>
                            ))}
                          </Select>
                        </Field>
                        <Field label="Item-specific reason" htmlFor={`reason-${item.orderItemId}`} hint="Optional">
                          <Input id={`reason-${item.orderItemId}`} value={selectedItems[item.orderItemId]?.reason ?? ""} onChange={(event) => updateItemReason(item.orderItemId, event.target.value)} placeholder="Item-specific reason (optional)" />
                        </Field>
                      </div>
                    ) : null}
                  </Card>
                );
              })}
            </div>
          </DashboardSection>

          <DashboardSection title="Reason for return">
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Reason for return">
              {REASON_OPTIONS.map((option) => (
                <Chip key={option.value} active={mainReason === option.value} onClick={() => setMainReason(option.value)} role="radio" aria-checked={mainReason === option.value}>
                  {option.label}
                </Chip>
              ))}
            </div>
          </DashboardSection>

          <DashboardSection title="Additional notes">
            <Field label="Details" htmlFor="return-notes" hint="Anything that helps us process the return faster.">
              <Textarea id="return-notes" value={additionalNotes} onChange={(event) => setAdditionalNotes(event.target.value)} placeholder="Provide any additional details about your return..." rows={4} />
            </Field>
          </DashboardSection>

          <Card className="flex flex-wrap items-center justify-between gap-3 p-3">
            <p className="text-[13px] tabular-nums text-muted-foreground">{selectedCount === 0 ? "Select items to return" : `${selectedCount} item(s) selected for return`}</p>
            <Button onClick={handleSubmit} disabled={selectedCount === 0 || submitting}>
              <RotateCcw className="size-4" aria-hidden="true" />
              {submitting ? "Submitting..." : "Submit return request"}
            </Button>
          </Card>
        </>
      )}
    </div>
  );
}
