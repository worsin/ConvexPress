import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";

import { NotFoundPage } from "@/components/blog/NotFoundPage";
import { type PublicForm } from "@/components/forms/FormRenderer";
import { isPublicPluginEnabled } from "@/lib/plugins/public";
import { throwPublicNotFound } from "@/lib/plugins/public-route-loader";
import { buildSeoHead, normalizeSiteUrl, toAbsoluteUrl, siteTitled } from "@/lib/seo/head";
import CoreFormResume, {
  type FormResumeSurfaceData,
  type ResumeDraftState,
} from "@/templates/packs/core/surfaces/forms.resume";
import { Surface } from "@/templates/sdk/Surface";

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
 *   - draft.formSlug !== slug (partial draft for another form) → <NotFoundPage />
 *   - draft.status === "expired" (TTL marker) → surface shows <DraftExpiredNotice />
 *   - else → surface mounts <FormWizard initialValues={draft.values} initialStep={...}>
 *
 * Forms are conversion surfaces, not indexable → `noindex`.
 */

const getBySlugFn = (api as any).extensions.forms.queries.getBySlug;
const resumeFn = (api as any).extensions.forms.queries.resume;

/** The resume-query projection (resume-safe; keyed by fieldKey). */
type ResumeDraft = ResumeDraftState | null;

export const Route = createFileRoute("/_marketing/forms/$slug/resume/$token")({
  component: ResumeFormPage,
  loader: async ({ context: { queryClient }, params }) => {
    const publicSettings = await queryClient.ensureQueryData(
      convexQuery(api.settings.queries.getPublic, {}),
    );
    const formsEnabled = isPublicPluginEnabled("forms", publicSettings);
    if (!formsEnabled) {
      throwPublicNotFound({
        pluginId: "forms",
        reason: "plugin_disabled",
      });
    }

    // Prefetch BOTH queries for an SSR-first paint.
    const [form, draft] = await Promise.all([
      queryClient.ensureQueryData(
        convexQuery(getBySlugFn, { slug: params.slug }),
      ) as Promise<PublicForm | null>,
      queryClient.ensureQueryData(convexQuery(resumeFn, { token: params.token })) as Promise<ResumeDraft>,
    ]);
    if (!form || draft == null) {
      throwPublicNotFound({
        reason: "form_resume_not_found",
        slug: params.slug,
      });
    }

    const siteUrl = normalizeSiteUrl(
      (publicSettings as { siteUrl?: string | null })?.siteUrl,
    );

    return {
      seoHead: buildSeoHead({
        title: siteTitled(`Resume ${form?.title ?? params.slug}`),
        description: `Resume your saved ${form?.title ?? params.slug} form.`,
        canonical: toAbsoluteUrl(`/forms/${params.slug}`, siteUrl),
        robots: "noindex",
      }),
    };
  },
  head: ({ loaderData }) => loaderData?.seoHead ?? {},
});

function ResumeFormPage() {
  return <ResumeFormInner />;
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

  // A partial draft that belongs to a different form → 404.
  // (An expired marker carries no formSlug, so it was never subject to this check.)
  if (draft.status !== "expired" && draft.formSlug !== slug) {
    return <NotFoundPage />;
  }

  const data: FormResumeSurfaceData = { form, slug, token, draft };

  return <Surface name="forms.resume" data={data} fallback={CoreFormResume} />;
}
