import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";

import { NotFoundPage } from "@/components/blog/NotFoundPage";
import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";
import { FormRenderer, type PublicForm } from "@/components/forms/FormRenderer";
import { buildSeoHead, normalizeSiteUrl, toAbsoluteUrl } from "@/lib/seo/head";

/**
 * Public form render + submit page (Forms extension, Phase 1).
 *
 *     /forms/{slug}
 *
 * The page:
 *   1. Prefetches public settings + the form (SSR) via TanStack Query +
 *      `convexQuery`, so the form HTML is present on first paint.
 *   2. Gates on the `forms` plugin (404 when explicitly disabled).
 *   3. Loads the published form via `extensions.forms.queries.getBySlug`
 *      (PUBLIC, no auth). Unpublished / missing → null → 404.
 *   4. Renders `<FormRenderer>` which evaluates conditional visibility,
 *      validates required-visible fields, and submits via
 *      `extensions.forms.mutations.submit`.
 *
 * The Forms backend functions live under a loosely-typed (`anyApi`) extension
 * path, so the function references are read off `(api as any).extensions.forms`
 * — matching how the Website calls other extension/plugin Convex functions.
 */

const getBySlugFn = (api as any).extensions.forms.queries.getBySlug;

export const Route = createFileRoute("/_marketing/forms/$slug")({
  component: FormPage,
  loader: async ({ context: { queryClient }, params }) => {
    const publicSettings = (await queryClient.ensureQueryData(
      convexQuery(api.settings.queries.getPublic, {}),
    )) as { siteUrl?: string | null };

    // Prefetch the form itself so SSR can render it on first paint.
    const form = (await queryClient.ensureQueryData(
      convexQuery(getBySlugFn, { slug: params.slug }),
    )) as PublicForm | null;

    const siteUrl = normalizeSiteUrl(publicSettings?.siteUrl);

    return {
      seoHead: buildSeoHead({
        title: `${form?.title ?? params.slug} - ConvexPress`,
        description:
          form?.description || `Form: ${form?.title ?? params.slug}.`,
        canonical: toAbsoluteUrl(`/forms/${params.slug}`, siteUrl),
        // Forms are interactive conversion surfaces, not indexable content.
        robots: "noindex",
      }),
    };
  },
  head: ({ loaderData }) => loaderData?.seoHead ?? {},
});

function FormPage() {
  return (
    <PublicPluginGate pluginId="forms">
      <FormPageInner />
    </PublicPluginGate>
  );
}

function FormPageInner() {
  const { slug } = Route.useParams();
  const query = convexQuery(getBySlugFn, { slug }) as any;
  const { data: form } = useSuspenseQuery(query) as { data: PublicForm | null };

  if (!form) {
    return <NotFoundPage />;
  }

  return (
    <div className="mx-auto w-full max-w-2xl py-10">
      <FormRenderer form={form} />
    </div>
  );
}
