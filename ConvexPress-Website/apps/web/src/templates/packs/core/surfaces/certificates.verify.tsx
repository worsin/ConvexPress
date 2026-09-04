/** Core · certificates.verify — look up a certificate by serial and show the verdict. */
import { Link } from "@tanstack/react-router";
import { Award, CheckCircle2, Search, XCircle } from "lucide-react";
import { useState } from "react";

import type { SurfaceProps } from "@/templates/sdk/types";

export type CertificateVerification =
  | {
      valid: true;
      learnerName: string;
      courseTitle: string;
      issuedAt: number;
      serial: string;
      certificateTitle: string;
      orientation: "landscape" | "portrait";
      certificateText: string;
    }
  | { valid: false };

export interface CertificateVerifySurfaceData {
  /** Serial from the URL; undefined until the visitor submits one. */
  serial?: string;
  /** Verification for `serial`; undefined while loading (or when no serial). */
  result: CertificateVerification | undefined;
  actions: {
    /** Navigate to the verify page with the given serial (already trimmed; empty clears). */
    verify: (serial: string) => void;
  };
}

export default function CoreCertificateVerify({ data }: SurfaceProps<CertificateVerifySurfaceData>) {
  const { serial, result, actions } = data;
  const [value, setValue] = useState(serial ?? "");

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    actions.verify(value.trim());
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 py-12">
      <section className="rounded-lg border border-border bg-card p-8 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="rounded-lg bg-primary/10 p-3 text-primary">
            <Award className="size-6" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              Verify certificate
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Enter a certificate serial number to confirm the learner, course,
              and issue date.
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="mt-6 flex flex-col gap-3 sm:flex-row">
          <label className="sr-only" htmlFor="certificate-serial">
            Certificate serial
          </label>
          <input
            id="certificate-serial"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="CERT-..."
            className="min-h-11 flex-1 border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
          />
          <button
            type="submit"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Search className="size-4" aria-hidden="true" />
            Verify
          </button>
        </form>
      </section>

      {serial ? (
        result === undefined ? (
          <div className="border border-border bg-card p-6 text-sm text-muted-foreground">
            Checking certificate...
          </div>
        ) : result.valid ? (
          <div className="border border-border bg-card p-6">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 size-5 text-primary" aria-hidden="true" />
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  Certificate verified
                </h2>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">Certificate</dt>
                    <dd className="font-medium text-foreground">{result.certificateTitle}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Learner</dt>
                    <dd className="font-medium text-foreground">{result.learnerName}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Course</dt>
                    <dd className="font-medium text-foreground">{result.courseTitle}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Issued</dt>
                    <dd className="font-medium text-foreground">
                      {new Date(result.issuedAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Serial</dt>
                    <dd className="break-all font-medium text-foreground">
                      {result.serial}
                    </dd>
                  </div>
                </dl>
                <Link
                  to="/certificates/$serial"
                  params={{ serial: result.serial }}
                  className="mt-5 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  View certificate
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="border border-border bg-card p-6">
            <div className="flex items-start gap-3">
              <XCircle className="mt-0.5 size-5 text-destructive" aria-hidden="true" />
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  Certificate not found
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Check the serial number and try again.
                </p>
              </div>
            </div>
          </div>
        )
      ) : null}
    </div>
  );
}
