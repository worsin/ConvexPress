import { api } from "@convexpress-website/backend/generated/api";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { z } from "zod";

import { buildSeoHead, siteTitled } from "@/lib/seo/head";
import CoreCertificateVerify, {
  type CertificateVerification,
  type CertificateVerifySurfaceData,
} from "@/templates/packs/core/surfaces/certificates.verify";
import { Surface } from "@/templates/sdk/Surface";

const verifySearchSchema = z.object({
  serial: z.string().optional(),
});

export const Route = createFileRoute("/_marketing/certificates/verify")({
  validateSearch: verifySearchSchema,
  head: () =>
    buildSeoHead({
      title: siteTitled("Verify Certificate"),
      description: "Verify an issued ConvexPress LMS certificate by serial number.",
    }),
  component: VerifyCertificatePage,
});

function VerifyCertificatePage() {
  const navigate = useNavigate();
  const { serial } = Route.useSearch();
  const result = useQuery(
    (api as any).lms.certificates.queries.verifyBySerial,
    serial ? { serial } : "skip",
  ) as CertificateVerification | undefined;

  function verify(next: string) {
    void navigate({
      to: "/certificates/verify",
      search: next ? { serial: next } : {},
    } as any);
  }

  const data: CertificateVerifySurfaceData = { serial, result, actions: { verify } };

  return <Surface name="certificates.verify" data={data} fallback={CoreCertificateVerify} />;
}
