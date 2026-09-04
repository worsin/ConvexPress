/**
 * Depot · certificates.view — the printable certificate: a toolbar row
 * (verify another, print, PDF) that hides in print, then the certificate as a
 * bordered card with the facts as a compact table. Loading and not-found
 * states as in Core.
 */
import { Link } from "@tanstack/react-router";
import { Award, CheckCircle2, Download, Printer, XCircle } from "lucide-react";

import type { CertificateViewSurfaceData } from "@/templates/packs/core/surfaces/certificates.view";
import { cn } from "@/lib/utils";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Badge, Button, Card, Container, Label, Prose, Skeleton, buttonClasses } from "../parts";

export default function DepotCertificateView({ data }: SurfaceProps<CertificateViewSurfaceData>) {
  const { result } = data;

  if (result === undefined) {
    return (
      <Prose data-slot="certificate-view" data-pack="depot" className="flex flex-col gap-3 py-6 md:py-8" aria-busy="true">
        <p className="text-[13px] text-muted-foreground">Loading certificate...</p>
        <Skeleton className="h-64 w-full" />
      </Prose>
    );
  }

  if (!result.valid) {
    return (
      <Prose data-slot="certificate-view" data-pack="depot" className="flex flex-col gap-3 py-6 md:py-8">
        <Card className="flex flex-col gap-2 p-4" role="status">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <XCircle className="size-5 text-destructive" aria-hidden="true" />
              Certificate not found
            </h1>
            <Badge tone="danger">Not found</Badge>
          </div>
          <p className="text-[13px] text-muted-foreground">This serial number is not issued or has been revoked.</p>
        </Card>
        <Link to="/certificates/verify" className="text-[13px] font-medium text-primary hover:underline">
          Verify another certificate
        </Link>
      </Prose>
    );
  }

  const issued = new Date(result.issuedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const portrait = result.orientation === "portrait";

  return (
    <Container padded={false} data-slot="certificate-view" data-pack="depot" className="flex flex-col gap-4 py-6 md:py-8">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link to="/certificates/verify" className="text-[13px] font-medium text-primary hover:underline">
          Verify another certificate
        </Link>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => window.print()}>
            <Printer className="size-4" aria-hidden="true" />
            Print
          </Button>
          {result.pdfUrl ? (
            <a href={result.pdfUrl} target="_blank" rel="noreferrer" className={buttonClasses("primary")}>
              <Download className="size-4" aria-hidden="true" />
              Download PDF
            </a>
          ) : (
            <Button type="button" onClick={() => window.print()}>
              <Download className="size-4" aria-hidden="true" />
              Save PDF
            </Button>
          )}
        </div>
      </div>

      <Card as="article" className={cn("mx-auto w-full p-6 print:border-0 sm:p-10", portrait ? "max-w-3xl" : "max-w-5xl")}>
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex size-14 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary">
            <Award className="size-7" aria-hidden="true" />
          </div>
          <Label className="text-primary">{result.certificateTitle}</Label>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{result.learnerName}</h1>
          <div className="flex max-w-2xl flex-col gap-2 text-sm leading-6 text-muted-foreground">
            {result.certificateText.split(/\n{2,}/).map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </div>

        <dl className="mx-auto mt-8 grid max-w-2xl gap-3 rounded-md border border-border sm:grid-cols-3 sm:divide-x sm:divide-border">
          <div className="flex flex-col gap-1 p-3">
            <Label as="dt">Status</Label>
            <dd className="inline-flex items-center gap-1 text-sm font-medium text-foreground">
              <CheckCircle2 className="size-4 text-primary" aria-hidden="true" />
              Verified
            </dd>
          </div>
          <div className="flex flex-col gap-1 p-3">
            <Label as="dt">Issued</Label>
            <dd className="text-sm font-medium tabular-nums text-foreground">{issued}</dd>
          </div>
          <div className="flex flex-col gap-1 p-3">
            <Label as="dt">Serial</Label>
            <dd className="break-all font-mono text-sm font-medium text-foreground">{result.serial}</dd>
          </div>
        </dl>
      </Card>
    </Container>
  );
}
