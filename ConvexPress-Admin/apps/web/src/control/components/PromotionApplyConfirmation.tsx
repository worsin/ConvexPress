import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Confirmation } from "./promotionApplyModel";
import { PromotionReviewView } from "./PromotionReviewView";
type Props = { confirmation: Confirmation; acknowledged: boolean; onAcknowledge(value: boolean): void; busy: boolean; valid: boolean; unknownOutcome: boolean; now: number; onConfirm(): void; onCancel(): void };
export function PromotionApplyConfirmationBody(props: Props) {
  const recovery = props.confirmation.mode === "recover" || props.unknownOutcome;
  return <>
    <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
      <p className="font-semibold">Production destination: {props.confirmation.review.targetIdentity.siteOrigin}</p>
      <p className="mt-1">{recovery ? "This checks the same original production receipt. If it is still eligible and has not completed, it may retry that exact reviewed change." : `This will apply ${props.confirmation.review.recordCount} reviewed authored records to production.`}</p>
      <p className="mt-1">Published content may change the public website. Drafts stay drafts. Users, orders, and payment activity stay in production.</p>
    </div>
    <PromotionReviewView review={props.confirmation.review} now={props.now} expanded unknownOutcome={props.unknownOutcome} />
    <label className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm"><input className="mt-1" type="checkbox" checked={props.acknowledged} disabled={props.busy} onChange={event => props.onAcknowledge(event.target.checked)} /><span>I reviewed these incoming values and confirm this change to the production destination shown above.</span></label>
    {!props.valid && <p role="alert" className="text-sm text-destructive">This confirmation is no longer current. Close it and refresh the receipt.</p>}
    <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={props.busy} onClick={props.onCancel}>Cancel</Button><Button disabled={!props.acknowledged || !props.valid || props.busy} onClick={props.onConfirm}>{props.busy ? "Checking production result…" : recovery ? "Check outcome and retry if eligible" : "Apply reviewed content to production"}</Button></div>
  </>;
}
export function PromotionApplyConfirmation(props: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  return <Dialog open onOpenChange={open => { if (!open && !props.busy) props.onCancel(); }}><DialogContent className="max-w-3xl" initialFocus={heading}><DialogHeader><DialogTitle ref={heading} tabIndex={-1}>{props.confirmation.mode === "recover" || props.unknownOutcome ? "Recover the reviewed production change" : "Confirm the production change"}</DialogTitle><DialogDescription>Confirm only the content and destination in this receipt. The controller checks authorization and content again before applying.</DialogDescription></DialogHeader><PromotionApplyConfirmationBody {...props} /></DialogContent></Dialog>;
}
