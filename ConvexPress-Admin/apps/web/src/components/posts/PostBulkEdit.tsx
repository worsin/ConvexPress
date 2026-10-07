/**
 * Post Bulk Edit Panel
 *
 * Allows editing common fields on multiple selected posts at once.
 * Fields: Status, Comment Status, Sticky.
 * Applies each canonical update against the selected revision.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Id } from "@backend/convex/_generated/dataModel";

import { Button } from "@/components/ui/button";
import { useMutation } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import {applyBulkPostEdit,type BulkPost,type BulkPostPatch,type BulkPostResult} from "./bulk-edit";
import { toast } from "sonner";

interface PostBulkEditProps {
  /** Immutable revisions captured when these rows were selected. */
  posts: readonly BulkPost[];
  /** Close the bulk edit panel. */
  onClose: () => void;
  /** Clear selection after successful edit. */
  onClearSelection: () => void;
}

/**
 * Bulk edit panel for multiple posts.
 *
 * Shows dropdowns and checkboxes for fields that can be changed in bulk.
 * Only changes fields that the user explicitly modifies (uses "-- No Change --" defaults).
 */
export function PostBulkEdit({
  posts,
  onClose,
  onClearSelection,
}: PostBulkEditProps) {
  const [status, setStatus] = useState("");
  const [commentStatus, setCommentStatus] = useState("");
  const [sticky, setSticky] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [results,setResults] = useState<BulkPostResult[]|null>(null);
  const active=useRef(true),busy=useRef(false);
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  const update=useMutation(api.canonicalDocuments.updateMetadata);
  const handleApply = useCallback(async () => {
    if (busy.current || results || posts.length===0) return;
    const patch:BulkPostPatch = {};
    if(status)patch.status=status as BulkPostPatch["status"];
    if(commentStatus)patch.commentStatus=commentStatus as BulkPostPatch["commentStatus"];
    if(sticky)patch.isSticky=sticky==="yes";
    if(Object.keys(patch).length===0){toast.error("No changes selected.");return;}
    busy.current=true;setIsSaving(true);
    const outcome=await applyBulkPostEdit(posts,patch,args=>update({...args,postId:args.postId as Id<"posts">}),()=>active.current);
    busy.current=false;
    if(!active.current)return;
    setIsSaving(false);setResults(outcome);
    if(outcome.every(row=>row.status==="updated")){
      toast.success(`${outcome.length} post(s) updated.`);onClearSelection();onClose();
    }
  },[posts,status,commentStatus,sticky,results,update,onClearSelection,onClose]);

  const close = () => {if(results)onClearSelection();onClose();};

  return (
    <div className="border border-border bg-card rounded-none mb-4">
      <div className="border-b border-border bg-muted/50 px-4 py-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-foreground">
          Bulk Edit ({posts.length} post{posts.length !== 1 ? "s" : ""} selected)
        </h3>
        <button
          type="button"
          onClick={close}
          disabled={isSaving}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {results ? "Close" : "Cancel"}
        </button>
      </div>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-3 gap-4">
          {/* Status */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Status
            </label>
            <select
              aria-label="Bulk status"
              disabled={isSaving || results!==null}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-8 w-full rounded-none border border-input bg-transparent px-2 text-xs text-foreground outline-hidden focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
            >
              <option value="">-- No Change --</option>
              <option value="draft">Draft</option>
              <option value="publish">Published</option>
              <option value="private">Private</option>
            </select>
          </div>

          {/* Comment Status */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Comments
            </label>
            <select
              aria-label="Bulk comments"
              disabled={isSaving || results!==null}
              value={commentStatus}
              onChange={(e) => setCommentStatus(e.target.value)}
              className="h-8 w-full rounded-none border border-input bg-transparent px-2 text-xs text-foreground outline-hidden focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
            >
              <option value="">-- No Change --</option>
              <option value="open">Allow</option>
              <option value="closed">Do not allow</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Sticky</label>
            <select aria-label="Bulk sticky" disabled={isSaving || results!==null} value={sticky} onChange={event=>setSticky(event.target.value)} className="h-8 w-full rounded-none border border-input bg-transparent px-2 text-xs">
              <option value="">-- No Change --</option><option value="yes">Make sticky</option><option value="no">Remove sticky</option>
            </select>
          </div>
        </div>

        {results && <div role="status" className="space-y-2 text-sm">
          <p>{results.filter(row=>row.status==="updated").length} updated; {results.filter(row=>row.status!=="updated").length} need review. Close Bulk Edit, then review and reselect these posts before trying again.</p>
          <ul>{results.map(row=><li key={row.id}><strong>{row.title}</strong>: {row.message}</li>)}</ul>
        </div>}
        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <Button
            variant="outline"
            size="sm"
            onClick={close}
            disabled={isSaving}
          >
            {results ? "Close and clear selection" : "Cancel"}
          </Button>
          <Button size="sm" onClick={handleApply} disabled={isSaving || results!==null}>
            {isSaving ? "Updating..." : "Update"}
          </Button>
        </div>
      </div>
    </div>
  );
}
