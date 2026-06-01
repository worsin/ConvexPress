/**
 * Certificate verification — /lms/verify
 * Admin-side lookup companion to the public website certificate verifier.
 */

import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { Award, CheckCircle2, XCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_admin/lms/verify")({
  component: VerifyPage,
});

function VerifyPage() {
  const [serial, setSerial] = useState("");
  const [query, setQuery] = useState("");
  const result = useQuery(
    api.lms.certificates.queries.verifyBySerial,
    query ? { serial: query } : "skip",
  ) as
    | { valid: boolean; learnerName?: string; courseTitle?: string; issuedAt?: number; serial?: string }
    | undefined;

  return (
    <div className="mx-auto max-w-xl p-6">
      <div className="mb-6 flex items-center gap-3">
        <Award className="h-6 w-6" />
        <h1 className="text-2xl font-semibold">Verify Certificate</h1>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(serial.trim());
        }}
        className="mb-6 flex gap-2"
      >
        <input
          value={serial}
          onChange={(e) => setSerial(e.target.value)}
          placeholder="Enter certificate serial (e.g. CERT-ABC123-XXXXXX)"
          className="flex-1 rounded-md border border-border px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Verify
        </button>
      </form>

      {query && result !== undefined && (
        result.valid ? (
          <div className="rounded-lg border border-success/40 bg-success/10 p-5">
            <div className="mb-2 flex items-center gap-2 font-medium text-success">
              <CheckCircle2 className="h-5 w-5" /> Valid certificate
            </div>
            <dl className="space-y-1 text-sm">
              <Row k="Learner" v={result.learnerName} />
              <Row k="Course" v={result.courseTitle} />
              <Row
                k="Issued"
                v={result.issuedAt ? new Date(result.issuedAt).toLocaleDateString() : "—"}
              />
              <Row k="Serial" v={result.serial} />
            </dl>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-5 text-sm font-medium text-destructive">
            <XCircle className="h-5 w-5" /> No certificate found for that serial.
          </div>
        )
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v?: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 text-muted-foreground">{k}</dt>
      <dd className="font-medium">{v ?? "—"}</dd>
    </div>
  );
}
