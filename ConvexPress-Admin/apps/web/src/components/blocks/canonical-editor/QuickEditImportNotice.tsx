import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

/** Old records must pass the existing import/recovery review before editing. */
export function QuickEditImportNotice({ type, postId, onClose }: {
  type: "post" | "page";
  postId: string;
  onClose: () => void;
}) {
  return <section className="space-y-3 border border-border bg-card p-4" aria-label="Quick Edit review required">
    <p>Open the editor to review this document before using Quick Edit. Your existing content is preserved.</p>
    {type === "post"
      ? <Link to="/posts/$postId/edit" params={{ postId }} className="underline">Open editor</Link>
      : <Link to="/pages/$pageId/edit" params={{ pageId: postId }} className="underline">Open editor</Link>}
    <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
  </section>;
}
