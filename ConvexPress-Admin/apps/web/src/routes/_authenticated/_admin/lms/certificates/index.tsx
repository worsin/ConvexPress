/**
 * Certificates — /lms/certificates (templates list)
 */

import { createFileRoute } from "@tanstack/react-router";
import { Award, Info } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_admin/lms/certificates/")({
  component: CertificatesPage,
});

function CertificatesPage() {
  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-center gap-3">
        <Award className="h-6 w-6" />
        <h1 className="text-2xl font-semibold">Certificates</h1>
      </div>
      <div className="mb-6 flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <p>
          Certificate templates are issued automatically on course completion
          (schema + issuance flow are part of the learner-surface milestone).
        </p>
      </div>
      <div className="rounded-lg border border-dashed border-border py-16 text-center">
        <Award className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          No certificate templates yet.
        </p>
      </div>
    </div>
  );
}
