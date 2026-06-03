import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";

import { NotFoundPage } from "@/components/blog/NotFoundPage";
import {
  SubmittedConfirmation,
  type PublicForm,
} from "@/components/forms/FormRenderer";
import {
  FormWizard,
  parseOrderFormSettings,
} from "@/extensions/forms/FormWizard";
import { isPublicPluginEnabled } from "@/lib/plugins/public";
import { parsePrefill } from "@/lib/forms/prefill/parsePrefill";
import { buildSeoHead, normalizeSiteUrl, toAbsoluteUrl } from "@/lib/seo/head";

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
 *      (allowlisted, sanitized) into `initialValues`, and mounts `<FormWizard>`
 *      — which splits on `page_break` markers into a multi-step wizard with
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

    // Prefetch the form itself so SSR can render it on first paint.
    const form = formsEnabled
      ? ((await queryClient.ensureQueryData(
          convexQuery(getBySlugFn, { slug: params.slug }),
        )) as PublicForm | null)
      : null;

    const siteUrl = normalizeSiteUrl(
      (publicSettings as { siteUrl?: string | null })?.siteUrl,
    );

    return {
      formsEnabled,
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
  const { formsEnabled } = Route.useLoaderData();
  if (!formsEnabled) return <NotFoundPage />;
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
  if (search.payment === "complete") {
    return (
      <div className="mx-auto w-full max-w-2xl py-10">
        <SubmittedConfirmation formTitle={form.title} renderedMessage="" />
      </div>
    );
  }

  return (
    <div
      className={
        orderForm.enabled
          ? "mx-auto w-full max-w-6xl py-10"
          : "mx-auto w-full max-w-2xl py-10"
      }
    >
      <FormWizard form={form} initialValues={prefill.initialValues} />
    </div>
  );
}
