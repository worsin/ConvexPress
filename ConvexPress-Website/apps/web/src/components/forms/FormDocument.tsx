/**
 * A document a form asks someone to agree to (Terms of Service, Privacy
 * Policy, an agreement), read without leaving the form. A true/false field's
 * settings name a site page (`document: { page: "/terms", label: "Terms of
 * Service" }`); "Read the Terms of Service" opens that page in a dialog, and
 * every answer stays as it was. "Open in a new tab" is offered as well.
 */
import { lazy, Suspense, useState } from "react";
import { ExternalLink, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { documentHref, type FormDocument } from "./agreementDocument";

// The page renderer loads only when someone opens a document.
const FormDocumentBody = lazy(() => import("./FormDocumentBody"));

export function FormDocumentLink({ document }: { document: FormDocument }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 self-start text-xs font-medium text-foreground underline underline-offset-2 hover:text-primary"
      >
        <FileText className="size-3.5" aria-hidden="true" />
        Read the {document.label}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        {/* The document scrolls; its title and the way back stay in view. */}
        <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col">
          <DialogHeader>
            <DialogTitle>{document.label}</DialogTitle>
          </DialogHeader>
          <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          {open ? (
            <Suspense
              fallback={
                <p className="py-8 text-center text-sm text-muted-foreground" role="status">
                  Loading the {document.label}…
                </p>
              }
            >
              <FormDocumentBody document={document} />
            </Suspense>
          ) : null}
          </div>
          <DialogFooter>
            <a
              href={documentHref(document.page)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Open in a new tab
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
            <DialogClose render={<Button type="button">Back to the form</Button>} />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
