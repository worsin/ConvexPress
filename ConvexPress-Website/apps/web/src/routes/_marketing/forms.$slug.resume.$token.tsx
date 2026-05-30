import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";

import { NotFoundPage } from "@/components/blog/NotFoundPage";
import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";
import { type PublicForm } from "@/components/forms/FormRenderer";
import { FormWizard } from "@/extensions/forms/FormWizard";
import { DraftExpiredNotice } from "@/extensions/forms/DraftExpiredNotice";
import { buildSeoHead, normalizeSiteUrl, toAbsoluteUrl } from "@/lib/seo/head";

/**
 * Public, no-auth resume route (Form Multi-Step & Save-Continue System).
 *
 *     /forms/{slug}/resume/{token}
 *
 * SSR-first (no spinner): the loader prefetches BOTH the public form
 * (`getBySlug`) and the draft (`resume`) so the wizard rehydrates on first
 * paint. The opaque token IS the credential for an anonymous draft.
 *
 * Branches:
 *   - form missing / unpublished, or draft == null → <NotFoundPage />
 *   - draft.status === "expired" (TTL marker) → <DraftExpiredNotice />
 *   - else → <FormWizard initialValues={draft.values} initialStep={...}>
 *
 * Forms are conversion surfaces, not indexable → `noindex`.
 */

const getBySlugFn = (api as any).extensions.forms.queries.getBySlug;
const resumeFn = (api as any).extensions.forms.queries.resume;

/** The resume-query projection (resume-safe; keyed by fieldKey). */
type ResumeDraft =
  | { status: "expired" }
  | {
      submissionId: string;
      formSlug: string;
      status: "partial";
      currentStep: number;
      expiresAt: number;
      values: Record<string, string>;
    }
  | null;

export const Route = createFileRoute("/_marketing/forms/$slug/resume/$token")({
  component: ResumeFormPage,
  loader: async ({ context: { queryClient }, params }) => {
    const publicSettings = (await queryClient.ensureQueryData(
      convexQuery(api.settings.queries.getPublic, {}),
    )) as { siteUrl?: string | null };

    // Prefetch BOTH queries for an SSR-first paint.
    const [form] = await Promise.all([
      queryClient.ensureQueryData(
        convexQuery(getBySlugFn, { slug: params.slug }),
      ) as Promise<PublicForm | null>,
      queryClient.ensureQueryData(convexQuery(resumeFn, { token: params.token })),
    ]);

    const siteUrl = normalizeSiteUrl(publicSettings?.siteUrl);

    return {
      seoHead: buildSeoHead({
        title: `Resume ${form?.title ?? params.slug} - ConvexPress`,
        description: `Resume your saved ${form?.title ?? params.slug} form.`,
        canonical: toAbsoluteUrl(
          `/forms/${params.slug}/resume/${params.token}`,
          siteUrl,
        ),
        robots: "noindex",
      }),
    };
  },
  head: ({ loaderData }) => loaderData?.seoHead ?? {},
});

function ResumeFormPage() {
  return (
    <PublicPluginGate pluginId="forms">
      <ResumeFormInner />
    </PublicPluginGate>
  );
}

function ResumeFormInner() {
  const { slug, token } = Route.useParams();

  const formQuery = convexQuery(getBySlugFn, { slug }) as any;
  const resumeQuery = convexQuery(resumeFn, { token }) as any;
  const { data: form } = useSuspenseQuery(formQuery) as {
    data: PublicForm | null;
  };
  const { data: draft } = useSuspenseQuery(resumeQuery) as { data: ResumeDraft };

  // Form missing/unpublished, or no draft at all → 404.
  if (!form || draft == null) {
    return <NotFoundPage />;
  }

  // Expired / non-resumable → start-fresh notice.
  if (draft.status === "expired") {
    return (
      <div className="mx-auto w-full max-w-2xl py-10">
        <DraftExpiredNotice slug={slug} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl py-10">
      <FormWizard
        form={form}
        resumeToken={token}
        initialValues={draft.values}
        initialStep={draft.currentStep}
      />
    </div>
  );
}
