import { useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { toast } from "sonner";

export function KBInheritedCategoryAccess({ articleId }: { articleId: Id<"kb_articles"> }) {
  const review = useQuery(api.kb.categoryAccess.review, { articleId });
  const release = useMutation(api.kb.categoryAccess.release);
  const [working, setWorking] = useState(false);
  if (!review?.entries.length) return null;
  return <details className="rounded-md border border-border bg-card p-4">
    <summary className="cursor-pointer font-medium">Review access retained from deleted categories</summary>
    <p className="mt-3 text-sm text-muted-foreground">These rules still protect this article. Releasing them may make it visible to more visitors. Current site and article rules will still apply.</p>
    <ul className="my-3 space-y-2 text-sm">{review.entries.map((entry, index) => <li key={index}>
      /help/{entry.categorySlug}/{entry.articleSlug}{entry.wasPublished ? "" : " — hidden in its former category"}
    </li>)}</ul>
    {review.hasMore && <p className="mb-3 text-sm">Showing the first 20 retained restrictions. Additional restrictions remain after this review.</p>}
    {review.canRelease ? <button type="button" disabled={working} className="rounded-md bg-destructive px-3 py-2 text-sm text-destructive-foreground disabled:opacity-50" onClick={async () => {
      setWorking(true);
      try { await release({ articleId, expectedDigest: review.digest, confirm: true }); toast.success("Reviewed restrictions released"); }
      catch { toast.error("Could not release restrictions. Review the current rules and try again."); }
      finally { setWorking(false); }
    }}>{working ? "Releasing…" : "Release these reviewed restrictions"}</button> : <p className="text-sm">An authorized publisher can release these restrictions.</p>}
  </details>;
}
