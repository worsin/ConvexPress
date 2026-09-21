/**
 * Aster · certificates.verify — a narrow centred column: display heading,
 * one underline serial line with a text-link submit, then the verdict as a
 * rule-separated definition list (or a quiet "not found" line).
 */
import { useState, type FormEvent } from "react";

import type { CertificateVerifySurfaceData } from "@/templates/packs/core/surfaces/certificates.verify";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Container, Eyebrow, LinkButton, SectionHeading, SkeletonText, UnderlineInput, formatDate } from "../parts";

export default function AsterCertificateVerify({ data }: SurfaceProps<CertificateVerifySurfaceData>) {
  const { serial, result, actions } = data;
  const [value, setValue] = useState(serial ?? "");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    actions.verify(value.trim());
  }

  return (
    <Container data-slot="certificate-verify" className="py-6 md:py-10">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-12">
        <SectionHeading level={1} eyebrow="Certificates" title="Verify a certificate" lede="Enter a certificate serial number to confirm the learner, course, and issue date." />

        <form onSubmit={submit} className="flex items-end gap-4">
          <label htmlFor="certificate-serial" className="min-w-0 flex-1">
            <span className="sr-only">Certificate serial</span>
            <UnderlineInput id="certificate-serial" value={value} onChange={(event) => setValue(event.target.value)} placeholder="CERT-…" autoComplete="off" spellCheck={false} />
          </label>
          <button type="submit" className="h-11 shrink-0 text-sm font-medium text-foreground underline decoration-border underline-offset-[6px] transition-colors hover:decoration-foreground">
            Verify
          </button>
        </form>

        {serial ? (
          result === undefined ? (
            <div className="flex flex-col gap-4 border-t border-border pt-8" role="status" aria-live="polite">
              <p className="text-sm text-muted-foreground">Checking certificate...</p>
              <SkeletonText lines={4} />
            </div>
          ) : result.valid ? (
            <section className="flex flex-col gap-6 border-t border-border pt-8" aria-live="polite">
              <div className="flex flex-col gap-2">
                <Eyebrow>Verified</Eyebrow>
                <h2 className="font-display text-3xl tracking-tight text-foreground">Certificate verified</h2>
              </div>
              <dl className="flex flex-col divide-y divide-border border-y border-border text-sm">
                <Row label="Certificate">{result.certificateTitle}</Row>
                <Row label="Learner">{result.learnerName}</Row>
                <Row label="Course">{result.courseTitle}</Row>
                <Row label="Issued">{formatDate(result.issuedAt) ?? "—"}</Row>
                <Row label="Serial">
                  <span className="break-all">{result.serial}</span>
                </Row>
              </dl>
              <div>
                <LinkButton to="/certificates/$serial" params={{ serial: result.serial }} variant="primary">
                  View certificate
                </LinkButton>
              </div>
            </section>
          ) : (
            <section className="flex flex-col gap-2 border-t border-border pt-8" aria-live="polite">
              <Eyebrow className="text-destructive">Not found</Eyebrow>
              <h2 className="font-display text-3xl tracking-tight text-foreground">Certificate not found</h2>
              <p className="text-base leading-8 text-muted-foreground">Check the serial number and try again.</p>
            </section>
          )
        ) : null}
      </div>
    </Container>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-4 py-3">
      <dt className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{children}</dd>
    </div>
  );
}
