import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";

import { NotFoundPage } from "@/components/blog/NotFoundPage";
import { type PublicForm } from "@/components/forms/FormRenderer";
import { parseOrderFormSettings } from "@/extensions/forms/FormWizard";
import { isPublicPluginEnabled } from "@/lib/plugins/public";
import { throwPublicNotFound } from "@/lib/plugins/public-route-loader";
import { parsePrefill } from "@/lib/forms/prefill/parsePrefill";
import { buildSeoHead, normalizeSiteUrl, toAbsoluteUrl, siteTitled } from "@/lib/seo/head";
import CoreForm, { type FormSurfaceData } from "@/templates/packs/core/surfaces/forms.form";
import { Surface } from "@/templates/sdk/Surface";

/**
 * Public form render + submit page (Forms extension).
 *
 *     /forms/{slug}
 *
 * The page:
 *   1. Prefetches public settings + the form (SSR) via TanStack Query +
 *      `convexQuery`, so the form HTML is present on first paint.
 *   2. Gates on the `forms` plugin (404 when explicitly disabled).
 *   3. Loads the published form via `extensions.forms.queries.getBySlug`
 *      (PUBLIC, no auth). Unpublished / missing → null → 404.
 *   4. Reads arbitrary query params via `useSearch()`, resolves PREFILL
 *      (allowlisted, sanitized) into `initialValues`, and hands the
 *      `forms.form` surface the view model — Core mounts `<FormWizard>`,
 *      which splits on `page_break` markers into a multi-step wizard with
 *      autosave, degrading to a single page (with a plain Submit) when the form
 *      has no `page_break`.
 *
 * The Forms backend functions live under a loosely-typed (`anyApi`) extension
 * path, so the function references are read off `(api as any).extensions.forms`
 * — matching how the Website calls other extension/plugin Convex functions.
 *
 * SSR-safe: `parsePrefill` runs identically in the SSR loader and the browser.
 */

const getBySlugFn = (api as any).extensions.forms.queries.getBySlug;

export const Route = createFileRoute("/_marketing/forms/$slug")({
  component: FormPage,
  // Permissive search: arbitrary prefill query params pass through as a string
  // map. parsePrefill decides which are eligible (allowlisted opt-in fields).
  validateSearch: (search: Record<string, unknown>): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(search)) {
      if (typeof value === "string") out[key] = value;
      else if (Array.isArray(value) && typeof value[0] === "string") {
        out[key] = value[0];
      }
    }
    return out;
  },
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

    // Prefetch the form itself so SSR can render it on first paint.
    const form = (await queryClient.ensureQueryData(
      convexQuery(getBySlugFn, { slug: params.slug }),
    )) as PublicForm | null;
    if (!form) {
      throwPublicNotFound({
        reason: "form_not_found",
        slug: params.slug,
      });
    }

    const siteUrl = normalizeSiteUrl(
      (publicSettings as { siteUrl?: string | null })?.siteUrl,
    );

    return {
      seoHead: buildSeoHead({
        title: siteTitled(`${form?.title ?? params.slug}`),
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
  return <FormPageInner />;
}

function FormPageInner() {
  const { slug } = Route.useParams();
  const search = Route.useSearch();
  const query = convexQuery(getBySlugFn, { slug }) as any;
  const { data: form } = useSuspenseQuery(query) as { data: PublicForm | null };

  if (!form) {
    return <NotFoundPage />;
  }

  // Resolve allowlisted prefill from URL params → initialValues (string map).
  // Only opted-in (allowDynamicPopulation) fields are populated; hidden /
  // admin-only / layout / password fields are never seeded. SSR-safe + pure.
  const prefill = parsePrefill(search, { fields: form.fields });
  const orderForm = parseOrderFormSettings(form.settings);

  const data: FormSurfaceData = {
    form,
    slug,
    initialValues: prefill.initialValues,
    orderFormEnabled: orderForm.enabled,
    paymentReturn:
      search.payment === "complete" ? { status: search.redirect_status } : null,
  };

  return <Surface name="forms.form" data={data} fallback={CoreForm} />;
}
