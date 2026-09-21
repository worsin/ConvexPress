import { useEffect, useId, useRef, useState } from "react";
import { promotionName } from "@backend/canonical-blocks-foundation/blockPromotion";
import { Button } from "@/components/ui/button";
import type { SavedDefinition } from "./model";
import { checkPromotionExport, downloadPromotionPackage, type PromotionClient, type PromotionState } from "./promotion-model";

export function PromotionPanel({ saved, client, disabled, canConfirm, onLocked, onConfirmed }: {
  saved: SavedDefinition; client: PromotionClient; disabled: boolean; canConfirm: boolean;
  onLocked: (value: boolean) => void; onConfirmed: () => Promise<void>;
}) {
  const [name, setName] = useState(`blocks/${saved.name.split("/")[1]}`);
  const [review, setReview] = useState<ReturnType<typeof checkPromotionExport> | null>(null);
  const [state, setState] = useState<PromotionState | "unchecked">("unchecked");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false), [verifiedWebsite, setVerifiedWebsite] = useState(false);
  const pending = useRef(false), alive = useRef(true), epoch = useRef(0), allowed = useRef({ disabled, canConfirm });
  allowed.current = { disabled, canConfirm };
  const nameId = useId(), verifyId = useId();
  useEffect(() => { onLocked(busy || review !== null); }, [busy, review, onLocked]);
  useEffect(() => { alive.current = true;return () => { alive.current = false;epoch.current++;onLocked(false); }; }, [onLocked]);
  useEffect(() => {
    epoch.current++;setReview(null);setState("unchecked");setError("");setUncertain(false);setVerifiedWebsite(false);
  }, [saved.id, saved.generation, saved.version, saved.digest]);
  async function run(action: (current: () => boolean) => Promise<void>) {
    if (pending.current || allowed.current.disabled) return;
    pending.current = true;setBusy(true);setError("");const turn = epoch.current;
    const current = () => alive.current && turn === epoch.current && !allowed.current.disabled;
    try { await action(current); }
    catch { if (current()) setError("The request could not be verified. Keep this review and check its status before continuing."); }
    finally { pending.current = false;if (alive.current) setBusy(false); }
  }
  async function inspect(current: () => boolean) {
    if (!review) return;
    const result = await client.inspect(review.operation);
    if (!current()) return;
    if (result.targetName !== review.operation.targetName || !Number.isSafeInteger(result.generation) || result.generation < review.operation.expectedGeneration) throw Error("Invalid promotion readback");
    setState(result.state);setUncertain(false);setVerifiedWebsite(false);
    if (result.state === "promoted") await onConfirmed();
  }
  const blocked = disabled || busy;
  return <section aria-label="Promote custom block" className="space-y-3 rounded-lg border border-border p-4">
    <h3 className="font-semibold">Add to the SDK library</h3>
    <p className="text-sm text-muted-foreground">Export this saved version as a reusable block. Install and verify it before retiring this custom definition. Existing pages keep their selected versions.</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {!review ? <form className="space-y-3" onSubmit={event => { event.preventDefault(); }}>
      <label htmlFor={nameId} className="block text-sm font-medium">Library block name</label>
      <input id={nameId} value={name} maxLength={160} disabled={blocked} onChange={event => setName(event.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
      <p className="text-xs text-muted-foreground">Use a namespace and name, such as blocks/studio-services.</p>
      <Button type="button" disabled={blocked || !promotionName.safeParse(name).success} onClick={() => void run(async current => {
        const response = await client.exportPackage({ id: saved.id, version: saved.version, expectedGeneration: saved.generation, expectedDigest: saved.digest, targetName: name });
        const checked = checkPromotionExport(response, saved, name);
        if (current()) { setReview(checked);setState("unchecked"); }
      })}>Prepare SDK export</Button>
    </form> : <>
      <p className="break-all text-sm font-medium">{review.operation.targetName} · From version {review.operation.version}</p>
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={blocked} onClick={() => {
        try { downloadPromotionPackage(review.json, review.operation.targetName);setError(""); }
        catch { setError("The package could not be downloaded. The reviewed export is retained; try downloading again."); }
      }}>Download SDK package</Button><Button type="button" variant="outline" disabled={blocked} onClick={() => void run(inspect)}>Check installation status</Button></div>
      <p className="text-sm text-muted-foreground">Build this package with the ConvexPress block kit, then deploy the matching Website and backend. Checking status does not change the definition.</p>
      {state === "unchecked" && <p role="status" className="text-sm">Installation has not been checked.</p>}
      {state === "not-installed" && <p role="status" className="text-sm">This exact block is not installed in the site backend yet.</p>}
      {state === "needs-approval" && <p role="status" className="text-sm">Approve this saved version first, then prepare a fresh export review.</p>}
      {state === "conflict" && <p role="alert" className="text-sm">The definition changed or was promoted by a different operation. Close this review and reload the saved definition.</p>}
      {state === "promoted" && <p role="status" className="text-sm">Promotion is confirmed. Existing pages retain their pinned versions.</p>}
      {uncertain && <p role="alert" className="text-sm">Confirmation was sent, but its result is unverified. Check installation status before another confirmation.</p>}
      {state === "ready" && <><p role="status" className="text-sm">The site backend has the exact reviewed block installed.</p><label htmlFor={verifyId} className="flex items-start gap-2 text-sm"><input id={verifyId} type="checkbox" checked={verifiedWebsite} disabled={blocked || uncertain || !canConfirm} onChange={event => setVerifiedWebsite(event.target.checked)} />I verified this block in the deployed Website, including its template and existing content.</label><Button type="button" disabled={blocked || uncertain || !verifiedWebsite || !canConfirm} onClick={() => void run(async current => {
        if (!allowed.current.canConfirm || !verifiedWebsite || uncertain) return;
        setUncertain(true);
        const receipt = await client.confirm(review.operation);
        if (!current()) return;
        if (receipt.id !== saved.id || receipt.targetName !== review.operation.targetName || receipt.version !== saved.version || receipt.digest !== saved.digest || receipt.generation <= review.operation.expectedGeneration) throw Error("Invalid confirmation receipt");
        await inspect(current);
      })}>Confirm SDK promotion</Button>{!canConfirm && <p className="text-sm text-muted-foreground">Confirmation requires permission to update and publish content.</p>}</>}
      <Button type="button" variant="ghost" disabled={blocked || uncertain} onClick={() => { setReview(null);setError("");setState("unchecked");setVerifiedWebsite(false); }}>Close promotion review</Button>
    </>}
  </section>;
}
