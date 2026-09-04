import { api } from "@convexpress-website/backend/generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";

import { buildSeoHead, siteTitled } from "@/lib/seo/head";
import CoreCertificateView, {
  type CertificateView,
  type CertificateViewSurfaceData,
} from "@/templates/packs/core/surfaces/certificates.view";
import { Surface } from "@/templates/sdk/Surface";

export const Route = createFileRoute("/_marketing/certificates/$serial")({
  head: ({ params }) =>
    buildSeoHead({
      title: siteTitled(`Certificate ${params.serial}`),
      description: "Verified ConvexPress LMS certificate.",
      robots: "noindex, follow",
    }),
  component: CertificatePreviewPage,
});

function CertificatePreviewPage() {
  const { serial } = Route.useParams();
  const result = useQuery((api as any).lms.certificates.queries.verifyBySerial, {
    serial,
  }) as CertificateView | undefined;

  const data: CertificateViewSurfaceData = { result };

  return <Surface name="certificates.view" data={data} fallback={CoreCertificateView} />;
}
