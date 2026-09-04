/**
 * Depot · certificates.verify — serial lookup in a card on the reading
 * measure; the verdict as a badge plus a facts table. Same states as Core:
 * idle, checking, verified (with "View certificate"), not found.
 */
import { Award, CheckCircle2, Search, XCircle } from "lucide-react";
import { useState } from "react";

import type { CertificateVerifySurfaceData } from "@/templates/packs/core/surfaces/certificates.verify";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Badge, Button, Card, DataTable, Label, LinkButton, Prose, Skeleton } from "../parts";
import { Input } from "../parts/extra-plugins";

export default function DepotCertificateVerify({ data }: SurfaceProps<CertificateVerifySurfaceData>) {
  const { serial, result, actions } = data;
  const [value, setValue] = useState(serial ?? "");

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    actions.verify(value.trim());
  }

  return (
    <Prose data-slot="certificate-verify" data-pack="depot" className="flex flex-col gap-4 py-6 md:py-8">
      <Card className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Award className="size-5" aria-hidden="true" />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <Label>Certificates</Label>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl">Verify certificate</h1>
            <p className="text-[13px] leading-5 text-muted-foreground">Enter a certificate serial number to confirm the learner, course and issue date.</p>
          </div>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
          <label className="sr-only" htmlFor="certificate-serial">
            Certificate serial
          </label>
          <Input id="certificate-serial" value={value} onChange={(event) => setValue(event.target.value)} placeholder="CERT-..." className="flex-1 font-mono uppercase placeholder:normal-case" />
          <Button type="submit">
            <Search className="size-4" aria-hidden="true" />
            Verify
          </Button>
        </form>
      </Card>

      {serial ? (
        result === undefined ? (
          <Card className="flex flex-col gap-3 p-4" aria-busy="true">
            <p className="text-[13px] text-muted-foreground">Checking certificate...</p>
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
          </Card>
        ) : result.valid ? (
          <Card className="flex flex-col gap-3 p-4" role="status">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                <CheckCircle2 className="size-5 text-primary" aria-hidden="true" />
                Certificate verified
              </h2>
              <Badge tone="sale">Valid</Badge>
            </div>
            <DataTable
              caption="Certificate details"
              firstColumnLabel
              rows={[
                { key: "certificate", cells: ["Certificate", <span className="font-medium text-foreground">{result.certificateTitle}</span>] },
                { key: "learner", cells: ["Learner", <span className="font-medium text-foreground">{result.learnerName}</span>] },
                { key: "course", cells: ["Course", <span className="font-medium text-foreground">{result.courseTitle}</span>] },
                { key: "issued", cells: ["Issued", new Date(result.issuedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })] },
                { key: "serial", cells: ["Serial", <span className="break-all font-mono text-foreground">{result.serial}</span>] },
              ]}
            />
            <LinkButton to="/certificates/$serial" params={{ serial: result.serial }} className="self-start">
              View certificate
            </LinkButton>
          </Card>
        ) : (
          <Card className="flex flex-col gap-2 p-4" role="status">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                <XCircle className="size-5 text-destructive" aria-hidden="true" />
                Certificate not found
              </h2>
              <Badge tone="danger">Not found</Badge>
            </div>
            <p className="text-[13px] text-muted-foreground">Check the serial number and try again.</p>
          </Card>
        )
      ) : null}
    </Prose>
  );
}
