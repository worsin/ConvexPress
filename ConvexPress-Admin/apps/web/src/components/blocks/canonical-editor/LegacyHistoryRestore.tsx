import { useRef, useState } from "react";
import { canonicalRecoveryReceiptSchema, type CanonicalDocumentRead } from "@backend/canonical-blocks-foundation/documentContracts";
import { getErrorMessage } from "../../../lib/utils";
/** Compatibility for installations that still advertise recover-legacy. New
 * installations advertise import-legacy and never enter this transition. */
export function LegacyHistoryRestore(props: {
  revisionId: string;
  revision: number;
  documentId: string;
  recover: (args:{revisionId:string;expectedRevision:number})=>Promise<unknown>;
  onRestored:()=>Promise<CanonicalDocumentRead>;
  onRecovered?:()=>void;
  onCancel:()=>void;
}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
  const pending=useRef(false);
  return <div role="group" aria-label="Confirm revision restore" className="space-y-3 rounded border border-primary/40 p-4">
    <p>Restore the full authored content from this original version and return to its original editor? Your current block version will remain in history so you can return to it. Current publication, URL and access settings remain unchanged. Unsaved edits will be discarded.</p>
    {error && <p role="alert">{error}</p>}
    <button type="button" disabled={busy} className="min-h-11 rounded bg-primary px-4 text-primary-foreground" onClick={() => void(async()=>{
      if(pending.current)return;pending.current=true;setBusy(true);setError(null);
      try {
        const receipt=canonicalRecoveryReceiptSchema.parse(await props.recover({revisionId:props.revisionId,expectedRevision:props.revision}));
        if(receipt.postId!==props.documentId||receipt.revision!==props.revision+1)throw Error("Recovery receipt mismatch");
        const next=await props.onRestored();
        if(next?.contract!=="canonical-initialization-v1"||next.document.revision!==receipt.revision||next.document.authoringDigest!==receipt.authoringDigest)throw Error("Recovery reopen mismatch");
        props.onRecovered?.();
      }catch(issue){setError(getErrorMessage(issue,"The document changed or restoration was denied. Reload the current revision before trying again."));}
      finally{pending.current=false;setBusy(false);}
    })()}>Restore this revision</button>
    <button type="button" disabled={busy} className="ml-2 min-h-11 rounded border px-4" onClick={props.onCancel}>Cancel</button>
  </div>;
}
