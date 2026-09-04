/**
 * Journal · certificates.view — the printable certificate as a typographic
 * sheet: a hairline panel, small-caps certificate title, the learner's name
 * in display type, the certificate text in the reading measure, and a
 * rule-separated row of status · issued · serial. Print and download actions
 * sit above it as pills (hidden when printing).
 */
import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils";
import type { CertificateViewSurfaceData } from "@/templates/packs/core/surfaces/certificates.view";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Button, Container, EmptyState, Eyebrow, LinkButton, SkeletonBlock, SmallCaps, buttonClasses, formatDate } from "../parts";

export default function JournalCertificateView({ data }: SurfaceProps<CertificateViewSurfaceData>) {
  const { result } = data;

  if (result === undefined) {
    return (
      <Container data-slot="certificate-view" className="py-6 md:py-10">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6" role="status" aria-live="polite">
          <p className="text-sm text-muted-foreground">Loading certificate...</p>
          <SkeletonBlock className="aspect-[3/2] w-full rounded-2xl" />
        </div>
      </Container>
    );
  }

  if (!result.valid) {
    return (
      <Container data-slot="certificate-view" className="py-6 md:py-10">
        <div className="mx-auto w-full max-w-2xl">
          <EmptyState
            eyebrow="Not found"
            title="This serial number is not issued or has been revoked."
            action={
              <LinkButton to="/certificates/verify" variant="ghost">
                Verify another certificate
              </LinkButton>
            }
          />
        </div>
      </Container>
    );
  }

  const portrait = result.orientation === "portrait";

  return (
    <Container data-slot="certificate-view" className="flex flex-col gap-8 py-6 md:py-10">
      <div className="flex flex-wrap items-center justify-between gap-4 print:hidden">
        <Link to="/certificates/verify" className="text-sm text-foreground underline decoration-border underline-offset-[6px] transition-colors hover:decoration-foreground">
          Verify another certificate
        </Link>
        <div className="flex flex-wrap gap-3">
          <Button variant="ghost" onClick={() => window.print()}>
            Print
          </Button>
          {result.pdfUrl ? (
            <a href={result.pdfUrl} target="_blank" rel="noreferrer" className={buttonClasses("primary")}>
              Download PDF
            </a>
          ) : (
            <Button variant="primary" onClick={() => window.print()}>
              Save PDF
            </Button>
          )}
        </div>
      </div>

      <article
        data-slot="certificate-sheet"
        className={cn(
          "mx-auto w-full rounded-xl border border-border bg-background px-6 py-12 print:border-0 print:px-0 sm:px-12 sm:py-16 md:py-20",
          portrait ? "max-w-3xl" : "max-w-5xl",
        )}
      >
        <div className="mx-auto flex max-w-[60ch] flex-col items-center gap-6 text-center">
          <Eyebrow>{result.certificateTitle}</Eyebrow>
          <h1 className="font-display text-4xl leading-[1.02] tracking-tight text-foreground text-balance sm:text-6xl">{result.learnerName}</h1>
          <div className="flex flex-col gap-3 text-base leading-8 text-muted-foreground md:text-[17px]">
            {result.certificateText.split(/\n{2,}/).map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </div>

        <dl className="mx-auto mt-12 grid max-w-2xl gap-6 border-t border-border pt-8 text-center sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <SmallCaps as="dt">Status</SmallCaps>
            <dd className="font-display text-xl text-foreground">Verified</dd>
          </div>
          <div className="flex flex-col gap-1.5">
            <SmallCaps as="dt">Issued</SmallCaps>
            <dd className="font-display text-xl tabular-nums text-foreground">{formatDate(result.issuedAt) ?? "—"}</dd>
          </div>
          <div className="flex flex-col gap-1.5">
            <SmallCaps as="dt">Serial</SmallCaps>
            <dd className="break-all font-display text-xl text-foreground">{result.serial}</dd>
          </div>
        </dl>
      </article>
    </Container>
  );
}
