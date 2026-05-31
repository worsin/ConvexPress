import { api } from "@convexpress-website/backend/generated/api";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Award, CheckCircle2, Download, Printer, XCircle } from "lucide-react";

import { buildSeoHead } from "@/lib/seo/head";

export const Route = createFileRoute("/_marketing/certificates/$serial")({
  head: ({ params }) =>
    buildSeoHead({
      title: `Certificate ${params.serial} - ConvexPress`,
      description: "Verified ConvexPress LMS certificate.",
      robots: "noindex, follow",
    }),
  component: CertificatePreviewPage,
});

type VerificationResult =
  | {
      valid: true;
      learnerName: string;
      courseTitle: string;
      issuedAt: number;
      serial: string;
    }
  | { valid: false };

function CertificatePreviewPage() {
  const { serial } = Route.useParams();
  const result = useQuery((api as any).lms.certificates.queries.verifyBySerial, {
    serial,
  }) as VerificationResult | undefined;

  if (result === undefined) {
    return (
      <div className="mx-auto max-w-4xl py-12 text-sm text-muted-foreground">
        Loading certificate...
      </div>
    );
  }

  if (!result.valid) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4 py-12">
        <div className="border border-border bg-card p-6">
          <div className="flex items-start gap-3">
            <XCircle className="mt-0.5 size-5 text-destructive" aria-hidden="true" />
            <div>
              <h1 className="text-lg font-semibold text-foreground">
                Certificate not found
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                This serial number is not issued or has been revoked.
              </p>
            </div>
          </div>
        </div>
        <Link to="/certificates/verify" className="text-sm text-primary hover:underline">
          Verify another certificate
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 py-12">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link to="/certificates/verify" className="text-sm text-primary hover:underline">
          Verify another certificate
        </Link>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted"
          >
            <Printer className="size-4" aria-hidden="true" />
            Print
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Download className="size-4" aria-hidden="true" />
            Save PDF
          </button>
        </div>
      </div>

      <article className="border border-border bg-card p-8 shadow-sm print:border-0 print:shadow-none sm:p-12">
        <div className="flex justify-center">
          <div className="rounded-full border border-primary/30 bg-primary/10 p-5 text-primary">
            <Award className="size-12" aria-hidden="true" />
          </div>
        </div>

        <div className="mx-auto mt-8 max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">
            Certificate of Completion
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            {result.learnerName}
          </h1>
          <p className="mt-5 text-sm leading-6 text-muted-foreground">
            has successfully completed
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-foreground">
            {result.courseTitle}
          </h2>
        </div>

        <dl className="mx-auto mt-10 grid max-w-2xl gap-4 border-t border-border pt-6 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Status</dt>
            <dd className="mt-1 inline-flex items-center gap-1 font-medium text-foreground">
              <CheckCircle2 className="size-4 text-primary" aria-hidden="true" />
              Verified
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Issued</dt>
            <dd className="mt-1 font-medium text-foreground">
              {new Date(result.issuedAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Serial</dt>
            <dd className="mt-1 break-all font-medium text-foreground">
              {result.serial}
            </dd>
          </div>
        </dl>
      </article>
    </div>
  );
}
