/**
 * The page inside a form document's dialog (FormDocument.tsx), loaded only
 * when someone opens one: it brings the page renderer with it.
 */
import { useQuery } from "convex/react";
import { useEffect, useState } from "react";

import { api } from "@convexpress-website/backend/generated/api";
import DOMPurify from "@/lib/html-sanitizer";
import { loadAnonymousCanonical } from "@/templates/sdk/block-public/anonymous-loader";
import { PublicCanonicalBody, PublicCanonicalScope } from "@/templates/sdk/block-public/PublicCanonicalBody";
import type { PublicCanonicalDocument } from "@/templates/sdk/block-data/portable/publicDocumentContracts";
import type { FormDocument } from "./agreementDocument";

export default function FormDocumentBody({ document }: { document: FormDocument }) {
  const page = useQuery(api.pages.queries.getByPath, { path: document.page });
  const [canonical, setCanonical] = useState<PublicCanonicalDocument | undefined>(undefined);
  const pageId = page?._id;
  const blocksVersion = page?.blocksVersion;

  useEffect(() => {
    if (!pageId) return;
    let cancelled = false;
    loadAnonymousCanonical({ _id: pageId, blocksVersion })
      .then((result) => {
        if (!cancelled) setCanonical(result);
      })
      .catch(() => {
        if (!cancelled) setCanonical(null);
      });
    return () => {
      cancelled = true;
    };
  }, [pageId, blocksVersion]);

  if (page === undefined || (page && canonical === undefined)) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground" role="status">
        Loading the {document.label}…
      </p>
    );
  }
  if (page === null) {
    return <p className="text-sm text-muted-foreground">The {document.label} isn't available right now. Try opening it in a new tab.</p>;
  }
  if (canonical) {
    return (
      <div className="text-sm">
        <PublicCanonicalScope documentId={page._id} initial={canonical}>
          <PublicCanonicalBody documentId={page._id} />
        </PublicCanonicalScope>
      </div>
    );
  }
  return (
    <div
      className="prose prose-sm max-w-none dark:prose-invert"
      // Page HTML from the CMS, sanitized like every page body.
      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize("content" in page && typeof page.content === "string" ? page.content : "") }}
    />
  );
}
