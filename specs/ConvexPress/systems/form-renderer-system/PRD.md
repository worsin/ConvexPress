# PRD: Form Renderer System (Public)

> **Origin:** Authored 2026-05-30 for the ConvexPress Forms extension (the form-builder build). The public, respondent-facing half of the Forms tree; consumes the Form Field Engine and the Form Submission System.
> **Project:** ConvexPress — a unified CMS + commerce platform (WordPress + WooCommerce replacement). Commerce/content/forms are first-class layers, not separate apps.
> **Two-app architecture:** `ConvexPress-Admin/` (TanStack Router SPA, Convex Auth) owns the Convex database + all mutations. `ConvexPress-Website/` (TanStack Start SSR, Clerk auth) is a read-only consumer.
> **Roles (WordPress-standard):** Administrator / Editor / Author / Contributor / Subscriber. Public form surfaces serve guests + `Subscriber`.
> **Extensions — v2 (NOT the v1 commerce model):** Forms is the **first scanner-discovered v2 extension**. It lives at `apps/web/src/extensions/forms/` (manifest + nav) and `packages/backend/convex/extensions/forms/` (schema/queries/mutations), with admin routes at the canonical `apps/web/src/routes/_authenticated/_admin/forms/` path. v2 is **additive-only**: extensions never edit `schema.ts`, `lib/plugins/registry.ts`, or `lib/admin-shell/nav-config.ts` — scanners + codegen merge them in. See `ConvexPress-Admin/extension-kit/ARCHITECTURE.md`.
> **Stack:** Bun. Base UI (not Radix). Tailwind v4. Zod for validation. Stripe for payments.

---

## Integration with ConvexPress

**Positioning:** The **public renderer host** that lives on the Website app (`ConvexPress-Website/`), not the admin builder. It is the runtime that turns a published form definition into an interactive, accessible, submittable form for guests and signed-in `Subscriber`s. It owns **rendering and orchestration only** — it stores nothing, mutates nothing of its own, and re-validates nothing authoritatively (that is the server's job at submit).

**Recommended home:** `ConvexPress-Website/apps/web/src/extensions/forms/` (renderer host + the public route), consuming the shared field engine package (working name `@convexpress/field-engine`, see the Form Field Engine PRD (`specs/ConvexPress/systems/form-field-engine/PRD.md`)). It mirrors the existing `commerceSubscriptions` public-surface pattern: `ConvexPress-Website/apps/web/src/components/subscriptions/SignupForm.tsx` + `ConvexPress-Website/apps/web/src/routes/signup.$offerId.tsx`.

**Consumes these ConvexPress systems:**

- **Form Field Engine** (`@convexpress/field-engine`) — the *only* hard dependency. Provides the typed field registry + `FieldRenderer`, the pure `evaluateConditionalLogic(field, valueMap)` visibility function, `validateFieldValue()` for inline UX checks, and `parseFieldValue` / `encodeFieldValue` for value (de)serialization. The renderer is a **host** of this engine in the sense the engine PRD §3 defines: it supplies the relational `resolveRelation` query seam and the compound (repeater/group) orchestration the engine declares as host-implemented.
- **Form Submission System** — the renderer calls its public, **unauthenticated** submit mutation. The renderer never writes `fieldValues` itself. See the Form Submission System PRD (`specs/ConvexPress/systems/form-submission-system/PRD.md`).
- **Public plugin gate** — `<PublicPluginGate pluginId="forms">` (`ConvexPress-Website/apps/web/src/components/plugins/PublicPluginGate.tsx`) wraps every public Forms surface; 404s when the extension is disabled for the site.
- **Design kit (page-feature pattern)** — forms can ALSO be embedded inside a Page via the `design:page-feature` pattern (`ConvexPress-Website/design-kit/references/page-feature.example.tsx`), layering `<FormRenderer formSlug={…} />` below page content.

**WooCommerce / WordPress analog:** Gravity Forms' front-end form display (`GFFormDisplay::get_form()`) + its client-side conditional-logic engine and AJAX submit — the runtime that renders a saved form, hides/shows fields live, validates inline, and POSTs the entry.

---

## 1. Overview

### 1.1 Purpose

Render a published form definition **publicly on the Website**, SSR-safe, from a single host component: load the form by slug, render its fields through the shared engine, evaluate conditional logic client-side for live show/hide, validate inline as UX, and submit through the Form Submission System's public mutation — handing off to the Confirmation System on success. One host powers both the standalone hosted-form route (`/forms/$slug`) and the embedded-in-a-Page case.

This system is the public counterpart to the admin Form Builder (the Form Builder System PRD (`specs/ConvexPress/systems/form-builder-system/PRD.md`)): the builder authors the definition in Admin; the renderer consumes it read-only on the Website.

### 1.2 Scope

**In scope:**
- A public **`FormRenderer`** host component: orchestration, value-map state, render order, error/empty/disabled/closed states.
- SSR data prefetch of the form definition via `queryClient.ensureQueryData(convexQuery(...))` in the route loader, with `useQuery`/`useTanStackQuery` hydration in the component.
- Client-side conditional logic via the engine's pure `evaluateConditionalLogic` — live field/section visibility as the user types.
- Inline, UX-only validation via the engine's `validateFieldValue` (errors shown on blur/submit; never authoritative).
- The **submit wiring**: collect the visible value map, encode per type, call the public submit mutation, surface pending/success/error.
- **Host-side compound renderers** (repeater/group) ported into the Website host per the engine's host-implemented contract.
- **Host-side relational `resolveRelation`** bound to the Website's read-only public Convex queries (the engine never imports admin API).
- The standalone `/forms/$slug` route under `_marketing`, gated by `<PublicPluginGate pluginId="forms">`, plus the embedded-via-page note.
- A11y: label association, error association, keyboard operability, focus management.

**Out of scope:**
- The submit mutation itself, entry storage, anti-spam enforcement, and server re-validation — owned by the Form Submission System PRD (`specs/ConvexPress/systems/form-submission-system/PRD.md`) and the Form Logic & Validation System PRD (`specs/ConvexPress/systems/form-logic-validation-system/PRD.md`).
- The field catalog, renderers, the logic evaluator, and the validator — owned by the Form Field Engine PRD (`specs/ConvexPress/systems/form-field-engine/PRD.md`). This system **reuses**, it does not rebuild.
- Multi-page/wizard navigation + save-and-resume — owned by the Form Multi-Step & Save-Continue System PRD (`specs/ConvexPress/systems/form-multi-step-system/PRD.md`). The renderer exposes a handoff seam (`FormProgress`) but owns no step state.
- Confirmation messages / redirects after submit — owned by the Form Confirmation System PRD (`specs/ConvexPress/systems/form-confirmation-system/PRD.md`). The renderer hands off on success.
- Merge tags + field pre-fill from URL/user — owned by the Form Merge Tags & Prefill System PRD (`specs/ConvexPress/systems/form-merge-tags-prefill-system/PRD.md`). The renderer accepts a seed value map but does not source it.
- The admin builder UI (the Form Builder System PRD (`specs/ConvexPress/systems/form-builder-system/PRD.md`)).
- Calculations/pricing/payment fields (the Form Calculation & Pricing System PRD (`specs/ConvexPress/systems/form-calculation-pricing-system/PRD.md`) + the Form Commerce Subscription Action PRD (`specs/ConvexPress/systems/form-commerce-subscription-action/PRD.md`)).

---

## 2. Dependencies

### 2.1 Required before this system

| System | Why |
|---|---|
| Form Field Engine (`@convexpress/field-engine`) | Source of the field registry, `FieldRenderer`, `evaluateConditionalLogic`, `validateFieldValue`, `parseFieldValue`/`encodeFieldValue`. The renderer is a host of this engine and supplies its relational + compound seams. |
| Form Submission System | Provides the public unauthenticated submit mutation the renderer calls; owns entry storage + server-trusted re-validation. |
| Public plugin gate (`PublicPluginGate`) | Gates the public surface on the `forms` extension flag. |

### 2.2 Systems that depend on this

| System | Integration point |
|---|---|
| Form Multi-Step & Save-Continue | Wraps the renderer's field set in step navigation; consumes the `FormProgress` handoff seam. |
| Form Confirmation | Receives the success handoff (message vs redirect) from the renderer's submit. |
| Form Merge Tags & Prefill | Feeds the renderer a seed value map (URL params, signed-in user fields) for pre-fill + dynamic default population. |
| Form Logic & Validation | Owns the server-side mirror of the rules the renderer evaluates client-side; the renderer is the client UX half of the same contract. |

### 2.3 Integration shape

```typescript
// What the renderer host accepts (Website-side).
interface FormRendererProps {
  // One of: slug (standalone route) or a prefetched definition (embedded).
  formSlug?: string;
  form?: PublicFormDefinition;          // prefetched on the server for embeds
  // Seed values for prefill (Merge Tags & Prefill System owns the source).
  initialValues?: Record<string, unknown>;
  // Multi-Step handoff: when provided, the host renders one step's fields and
  // delegates navigation. Omitted => single-page render of all fields.
  step?: { index: number; total: number; fieldKeys: string[] };
  // Confirmation handoff: called on a successful submit so the Confirmation
  // System can render a message or perform a redirect.
  onSubmitted?: (result: SubmitResult) => void;
}

// Read-only shape the renderer consumes (projected by the public query; never
// the admin-authoring shape).
interface PublicFormDefinition {
  _id: string;
  slug: string;
  title: string;
  description?: string;
  status: "draft" | "published";        // only "published" renders publicly
  fields: PublicFieldDefinition[];      // engine FieldDefinition projection
  settings: {
    submitLabel?: string;
    confirmation?: ConfirmationRef;      // resolved by Confirmation System
    schedule?: { startsAt?: number; endsAt?: number };
    entryLimit?: number | null;
    loginRequired?: boolean;             // gate to Subscriber when true
    disabled?: boolean;
  };
}

interface SubmitResult {
  ok: boolean;
  entryId?: string;
  confirmation?: ConfirmationRef;
  errors?: Record<string, string>;       // server field errors -> inline display
}
```

---

## 3. Data Model

**No new tables. Reads only.** This system owns **zero** schema. It reads:

- The `forms` table (via a public, no-auth, read-only Convex query that projects only publish-safe fields — slug, title, description, status, field definitions, public settings). It must never expose admin-only authoring metadata.
- The form's **field definitions**, consumed through the Form Field Engine — `fieldDefinitions` shape per the engine PRD §5 (`groupId, label, name, key, type, instructions, required, defaultValue, settings (JSON), conditionalLogic (JSON), wrapper*, menuOrder, parentFieldId`).

It **writes nothing.** The respondent's answers live only in component state (the value map) until submit, at which point they are handed to the Form Submission System's mutation, which owns the `fieldValues` write (`entityType: "form_submission"`, `entityId: <submissionId>`, per the engine PRD §5).

```
forms (read-only) ──projected──> PublicFormDefinition
   │
   └─ fieldDefinitions ──(engine)──> FieldRenderer × N
                                        │
                          respondent input ──> value map (component state)
                                        │
                              submit ──> Form Submission System mutation ──> fieldValues (server-owned)
```

---

## 4. Routes

### 4.1 Public route (Website app)

| Route | Path | Layout | App | Auth Required | Roles |
|---|---|---|---|---|---|
| Hosted Form | `/forms/$slug` | `_marketing` | Website | No\* | Guest, Subscriber |

\* `auth=false` by default (public). When the form's `settings.loginRequired` is true, the renderer additionally gates on a signed-in `Subscriber` (mirroring the membership pattern), prompting sign-in rather than 404ing.

**Plugin gate.** Every public Forms surface wraps in `<PublicPluginGate pluginId="forms">` (mirror `signup.$offerId.tsx`): a disabled `forms` extension renders `<NotFoundPage />` exactly as the subscriptions surface does.

**Embedded-in-a-Page (alternative surface).** A form can be rendered inside any Page through the design-kit page-feature pattern (`design:page-feature`): a named route or a page block prefetches both the Page record and the form definition, then renders `<FormRenderer form={prefetchedForm} />` below the page content. This reuses the *same* host component — there is no second renderer. See `ConvexPress-Website/design-kit/references/page-feature.example.tsx`.

### 4.2 SSR data prefetch

The standalone route prefetches the form definition in its loader so SSR has data ready and hydration is seamless — the same `convexQuery` + `ensureQueryData` mechanic the page routes use:

```tsx
// ConvexPress-Website/apps/web/src/routes/_marketing/forms.$slug.tsx
import { convexQuery } from "@convex-dev/react-query";
import { useQuery as useTanStackQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";

import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";
import { NotFoundPage } from "@/components/blog/NotFoundPage";
import { FormRenderer } from "@/extensions/forms/FormRenderer";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_marketing/forms/$slug")({
  loader: async ({ context: { queryClient }, params }) => {
    // Prefetch the public form definition so SSR renders the form, not a spinner.
    const form = await queryClient.ensureQueryData(
      convexQuery(api.extensions.forms.public.getBySlug, { slug: params.slug }),
    );
    return {
      seoHead: {
        title:
          form && typeof form === "object" && "title" in form
            ? `${form.title} - ConvexPress`
            : "Form - ConvexPress",
      },
    };
  },
  head: ({ loaderData }) => ({ meta: [{ title: loaderData?.seoHead.title }] }),
  component: HostedFormPage,
});

function HostedFormPage() {
  const { slug } = Route.useParams();
  const { data: form } = useTanStackQuery(
    convexQuery(api.extensions.forms.public.getBySlug, { slug }),
  );

  return (
    <PublicPluginGate pluginId="forms">
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-12 md:py-16">
        {form === undefined ? (
          <FormSkeleton />
        ) : form === null || form.status !== "published" ? (
          <NotFoundPage />
        ) : (
          <FormRenderer form={form} />
        )}
      </main>
    </PublicPluginGate>
  );
}

function FormSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-40" />
    </div>
  );
}
```

---

## 5. Actions / Events / Notifications

**None owned.** Rendering only.

- **Submit** is the Form Submission System's public unauthenticated mutation; the renderer is a caller, not the owner. See the Form Submission System PRD (`specs/ConvexPress/systems/form-submission-system/PRD.md`).
- **Save / resume** (draft step state) belongs to the Form Multi-Step & Save-Continue System PRD (`specs/ConvexPress/systems/form-multi-step-system/PRD.md`).
- **Events** (e.g. `form.submitted`) are emitted by the Submission System inside its mutation, not by the renderer.
- **Notifications** (autoresponder, admin alert) are owned by the Form Notification System PRD (`specs/ConvexPress/systems/form-notification-system/PRD.md`), triggered off the Submission System's event.

This section is intentionally thin to keep the renderer a pure presentation/orchestration host. The only side effect it initiates is the single submit call.

---

## 6. UI Components

**Website (public) components — all SSR-safe, all theme-token colours only:**

- [ ] **`FormRenderer`** — the host. Holds the value map (`Record<fieldKey, value>`), seeds from `initialValues`, computes per-field visibility via `evaluateConditionalLogic`, renders the visible fields in `menuOrder`, runs inline validation, and owns the submit lifecycle (idle → validating → submitting → submitted/failed). Renders the standalone *and* embedded cases.
- [ ] **`FieldRenderer`** (from the engine) — renders one field from `(field, value, onChange, ctx)`. The renderer passes `ctx.resolveRelation` (Website-bound public query fn) and the compound orchestration callback. **Not rebuilt here** — imported from `@convexpress/field-engine`.
- [ ] **`ConditionalSection`** — a thin wrapper that mounts/unmounts (or `hidden`-toggles) a field or a logic-grouped set of fields based on `evaluateConditionalLogic`. Hidden fields are excluded from the submitted value map (see §8). Wraps both single fields and `group`/`accordion`/`tab` clusters.
- [ ] **`CompoundFieldHost`** (repeater/group) — the host-side implementation of the engine's compound contract (engine PRD §3.2): renders N rows of sub-fields, add/remove/reorder row, recurses for nested compounds. Ported into the Website host because the engine ships compound *contracts*, not Website renderers.
- [ ] **`FormProgress`** — a multi-step **handoff** seam. On a single-page form it renders nothing. When the Multi-Step System wraps the renderer, it supplies `step={index,total,fieldKeys}` and `FormProgress` shows the step indicator; navigation lives in the Multi-Step System, not here.
- [ ] **`SubmitButton`** — submit control with explicit `pending` (spinner + disabled), `disabled` (form closed / over limit / login required), and default states. Mirrors the `SignupForm` button: `disabled={isSubmitting}` with a `Loader2` spinner and "Processing…" label.
- [ ] **Confirmation handoff** — on `ok`, the renderer calls `onSubmitted(result)` and yields to the Form Confirmation System (inline message swap or redirect). The renderer itself renders only a minimal "Submitting…"→success transition if no confirmation handler is wired (graceful default).
- [ ] **State surfaces** — `FormDisabledNotice`, `FormClosedNotice` (schedule window), `FormLimitReachedNotice`, and a per-field `FieldError` (associated via `aria-describedby`). All are presentational and theme-token only.

**Host orchestration sketch (mirrors the `SignupForm` submit/error/pending conventions):**

```tsx
// ConvexPress-Website/apps/web/src/extensions/forms/FormRenderer.tsx
import { useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { Loader2 } from "lucide-react";
import { api } from "@convexpress-website/backend/generated/api";
import {
  FieldRenderer,
  evaluateConditionalLogic,
  validateFieldValue,
  encodeFieldValue,
} from "@convexpress/field-engine";

import { Button } from "@/components/ui/button";
import { resolvePublicRelation } from "@/extensions/forms/resolveRelation";

export function FormRenderer({
  form,
  initialValues = {},
  step,
  onSubmitted,
}: FormRendererProps) {
  const submit = useMutation(api.extensions.forms.public.submit);

  const [values, setValues] = useState<Record<string, unknown>>(initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const firstErrorRef = useRef<HTMLDivElement | null>(null);

  // Visibility is recomputed every render from the live value map. Pure +
  // synchronous: client UX only, never authoritative (see §8).
  const visibleFields = useMemo(
    () =>
      form.fields
        .filter((f) => (step ? step.fieldKeys.includes(f.key) : true))
        .filter((f) => evaluateConditionalLogic(f, values)),
    [form.fields, values, step],
  );

  function setValue(key: string, value: unknown) {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: "" }));
  }

  function validateVisible(): Record<string, string> {
    const next: Record<string, string> = {};
    for (const f of visibleFields) {
      const msg = validateFieldValue(f.type, values[f.key], f.settings, f.required);
      if (msg) next[f.key] = msg; // imperative per-type check; Zod runs at the boundary too
    }
    return next;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const clientErrors = validateVisible();
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      firstErrorRef.current?.focus(); // focus management: jump to first error
      return;
    }

    // Encode only VISIBLE fields. Hidden-by-logic fields are omitted entirely.
    const payload = Object.fromEntries(
      visibleFields.map((f) => [f.key, encodeFieldValue(f.type, values[f.key])]),
    );

    setIsSubmitting(true);
    try {
      const result = await submit({ slug: form.slug, values: payload });
      if (!result.ok) {
        // Server is authoritative — map its field errors back to inline display.
        setErrors(result.errors ?? {});
        setFormError(result.errors ? null : "Submission failed. Please try again.");
        firstErrorRef.current?.focus();
        return;
      }
      onSubmitted?.(result); // hand off to the Confirmation System
    } catch (err) {
      setFormError(extractErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  const closed = isFormClosed(form); // schedule / disabled / over-limit (see §9)

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-foreground">{form.title}</h1>
        {form.description ? (
          <p className="text-muted-foreground">{form.description}</p>
        ) : null}
      </header>

      {closed.reason ? (
        <p role="status" className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-foreground">
          {closed.message}
        </p>
      ) : (
        <>
          {visibleFields.map((field) => (
            <FieldRenderer
              key={field.key}
              field={field}
              value={values[field.key]}
              onChange={(v: unknown) => setValue(field.key, v)}
              error={errors[field.key]}
              context={{ resolveRelation: resolvePublicRelation }}
            />
          ))}

          {formError ? (
            <p role="alert" className="text-sm text-destructive">{formError}</p>
          ) : null}

          <Button type="submit" size="lg" disabled={isSubmitting || closed.reason !== null}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" /> Processing…
              </>
            ) : (
              form.settings.submitLabel ?? "Submit"
            )}
          </Button>
        </>
      )}
    </form>
  );
}
```

---

## 7. Accessibility

- **Labels.** Every input has a programmatic `<label htmlFor>` (or an `aria-label` for control patterns that cannot use a visible label). The engine's simple renderers already pair label + control; the host must not strip that association.
- **Required state.** Required fields expose `aria-required="true"` and a visible required indicator; the indicator is not colour-only.
- **Error association.** Field errors render in an element referenced by the input's `aria-describedby`, and the input is marked `aria-invalid="true"` while in error. The form sets `noValidate` so native bubbles don't compete with our accessible inline errors.
- **Error summary + focus management.** On a failed submit, focus moves to the first invalid field (or an error summary region with `tabIndex={-1}`). On a successful submit, focus moves to the confirmation region so screen-reader users are told the outcome.
- **Live regions.** Form-level status (submitting / closed / limit reached) uses `role="status"`; submit failures use `role="alert"` so they are announced.
- **Keyboard.** All controls — including compound add/remove-row buttons and any custom Base UI controls — are reachable and operable by keyboard, with a visible focus ring (theme `ring` token). No keyboard traps in repeaters.
- **Conditional visibility.** Fields hidden by logic are removed from the accessibility tree (unmounted or `hidden`), not merely visually hidden, so they are not announced or tab-focusable while inactive.
- **SSR parity.** Because the form is server-rendered, the first paint is already semantic HTML (labels + inputs), so assistive tech and no-JS degraded views get a usable form before hydration.

---

## 8. API / Data Flow

1. **Load by slug.** The route loader prefetches `api.extensions.forms.public.getBySlug({ slug })` via `ensureQueryData(convexQuery(...))`; the component hydrates with the same query. The query is **no-auth, read-only**, and projects only publish-safe fields. `null` or non-`published` → `NotFoundPage`.
2. **Seed values.** The host initializes its value map from `initialValues` (supplied by the Merge Tags & Prefill System — URL params, signed-in user fields). The renderer does not source these; it only accepts them.
3. **Render.** Fields render in `menuOrder` through the engine's `FieldRenderer`. Relational fields resolve through the host's injected `resolvePublicRelation` (bound to public Website queries) — the engine imports no admin API. Compound fields render through the host's `CompoundFieldHost`.
4. **Evaluate logic (live).** On every change, `evaluateConditionalLogic(field, valueMap)` recomputes visibility synchronously. Hidden fields unmount and are excluded from the submitted payload.
5. **Validate inline (UX).** On blur/submit, `validateFieldValue(type, value, settings, required)` produces per-field messages. A Zod schema compiled from the field definitions runs alongside it at the submit boundary (engine PRD §8). **This is UX only.**
6. **Submit.** The host encodes the **visible** value map per type (`encodeFieldValue`) and calls the Form Submission System's public unauthenticated mutation (`api.extensions.forms.public.submit({ slug, values })`). It passes the slug, not an admin id, so the server re-resolves the form and is the source of truth.
7. **Result.** On `ok`, the host calls `onSubmitted(result)` and the Confirmation System renders the message or performs the redirect. On `!ok`, the host maps `result.errors` back to inline `aria-describedby` errors and moves focus to the first. Thrown errors surface as a form-level `role="alert"` message via the shared `extractErrorMessage` helper (same pattern as `SignupForm`).

```typescript
// Read-only public query the renderer consumes (Submission System / Forms
// extension owns the implementation; shown here for the data contract).
export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const form = await ctx.db
      .query("forms")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (!form || form.status !== "published") return null;

    // Project ONLY publish-safe fields. Never leak admin authoring metadata.
    const fields = await loadPublicFieldDefinitions(ctx, form._id);
    return {
      _id: form._id,
      slug: form.slug,
      title: form.title,
      description: form.description,
      status: form.status,
      fields,
      settings: projectPublicSettings(form),
    };
  },
});
```

---

## 9. Business Rules & Constraints

- **Client visibility is UX only — never authoritative.** `evaluateConditionalLogic` on the client decides what the respondent *sees*; it does not decide what is *accepted*. The Form Submission System re-runs logic + validation server-side and is the sole source of truth (engine PRD §8; Logic & Validation System owns the rule that a server-hidden field is treated as not-required).
- **Never trust the client payload.** The renderer submits a slug + a value map. The server re-resolves the form, re-evaluates which fields should be visible, re-validates, and rejects anything inconsistent. A malicious client cannot force-accept a hidden/disabled field.
- **Read-only on the Website.** This system performs exactly one mutation call (submit) and owns no others. It writes no Convex data of its own.
- **No admin coupling.** The renderer and the engine package must not import `@backend/convex` admin API or admin-shell; relational data flows through the injected public `resolveRelation`. (Engine PRD CI guard applies.)
- **SSR-safe.** No `window` access at module load; all browser-only work is inside effects/handlers (the Website runs TanStack Start SSR).
- **Gated surface.** The form renders only when the `forms` extension is enabled (`PublicPluginGate`) and the form is `published`. `loginRequired` forms additionally require a signed-in `Subscriber`.
- **Hidden ⇒ omitted.** Fields hidden by conditional logic are excluded from the submitted value map, so the server does not receive stale values for inactive branches.

---

## 10. Edge Cases

| Scenario | Handling |
|---|---|
| Form disabled (`settings.disabled`) | Render `FormDisabledNotice` (e.g. "This form is not currently accepting responses"); submit hidden/disabled. Server also rejects. |
| Scheduling window closed (`schedule.startsAt`/`endsAt`) | Compute open/closed from the prefetched window; render `FormClosedNotice` with the appropriate "not yet open" vs "now closed" copy; submit disabled. Server re-checks the window. |
| Entry limit reached (`entryLimit`) | Render `FormLimitReachedNotice`; submit disabled. The server is authoritative on the count and rejects late submits even if the client believed there was room (race-safe). |
| `loginRequired` but guest | Render a sign-in prompt (not a 404) and gate submit until the `Subscriber` is authenticated, mirroring the membership pattern. |
| Form not found / not published | `NotFoundPage` (same as the subscriptions surface for an invalid offer). |
| Extension disabled | `PublicPluginGate` renders `NotFoundPage`. |
| Unknown field type at render | Render the engine's safe fallback for that field and log; **never throw** in the public renderer (engine PRD §9). |
| Layout field (message/accordion/tab) | No stored value; rendered for structure, skipped by encode + submit (engine serializer/validator already skip these). |
| Relational field on the Website | Resolved via the injected public `resolveRelation`; never via admin API. |
| Repeater nested in a repeater | `CompoundFieldHost` recurses per the engine's recursive compound contract. |
| Submit succeeds but Confirmation handler absent | Host shows a minimal built-in success state (graceful default) so the respondent is never left without feedback. |
| Network error on submit | Form-level `role="alert"` message via `extractErrorMessage`; form values retained so the respondent can retry without re-entry. |
| JS disabled / pre-hydration | SSR delivers semantic label+input HTML; the form is readable, and submit degrades to the server mutation boundary once hydrated (no silent data loss). |

---

## 11. Implementation Checklist

**Phase 1 — host + standalone route**
- [ ] Create `apps/web/src/extensions/forms/FormRenderer.tsx` (value map, render order, submit lifecycle, error/pending states).
- [ ] Add `_marketing/forms.$slug.tsx` with `ensureQueryData(convexQuery(getBySlug))` prefetch + `<PublicPluginGate pluginId="forms">`.
- [ ] Wire the public `getBySlug` read-only query consumption (publish-safe projection); handle `undefined`/`null`/non-`published`.

**Phase 2 — engine integration**
- [ ] Render simple fields via the engine's `FieldRenderer`.
- [ ] Implement host-side `resolvePublicRelation` bound to public Website queries; pass via field `context`.
- [ ] Port compound orchestration into `CompoundFieldHost` per the engine's host-implemented contract (recursion + add/remove/reorder row).
- [ ] Wire `ConditionalSection` to `evaluateConditionalLogic`; ensure hidden fields unmount and drop from the payload.

**Phase 3 — validation + submit**
- [ ] Inline UX validation via `validateFieldValue` + a Zod schema compiled from field definitions at the submit boundary.
- [ ] Encode visible values (`encodeFieldValue`) and call the Submission System's public submit mutation; map server `errors` to inline fields.
- [ ] `SubmitButton` pending/disabled states; form-level `role="alert"` failure messaging.

**Phase 4 — states + a11y + handoffs**
- [ ] Disabled / scheduled-closed / limit-reached / login-required notices + gated submit.
- [ ] A11y pass: label + error association, `aria-invalid`, focus-to-first-error, success focus, live regions, keyboard repeaters.
- [ ] `FormProgress` handoff seam for the Multi-Step System; `onSubmitted` handoff for the Confirmation System; accept `initialValues` from the Prefill System.
- [ ] Embedded-via-page path verified with `<FormRenderer form={prefetchedForm} />` under the page-feature pattern.

---

## 12. Open Questions

- **Embed plumbing:** does the embedded-in-a-Page case go through a dedicated page-block type (authored in the page builder) or only through bespoke `design:page-feature` routes? Default: support both, but the block type is gated on the page-builder block contract landing first.
- **`resolveRelation` surface area:** which relational field kinds are even valid on a *public* form (e.g. `user`/`taxonomy` may be admin-only)? Default: expose a minimal public allow-list and fall back to the engine's safe renderer for unsupported kinds.
- **Anti-spam UX ownership:** the renderer must *place* captcha/honeypot fields, but enforcement is server-side (the Form Spam & Security System PRD (`specs/ConvexPress/systems/form-spam-security-system/PRD.md`)). Confirm whether the renderer renders those field types directly via the engine registry or via a thin host wrapper.
- **Optimistic vs awaited submit:** keep the awaited submit (current sketch) for correctness, or add optimistic UI? Default: awaited — entries must be server-confirmed before showing the confirmation.

---

## 13. Cross-References

- Dependency (engine): Form Field Engine PRD (`specs/ConvexPress/systems/form-field-engine/PRD.md`)
- Submit owner: Form Submission System PRD (`specs/ConvexPress/systems/form-submission-system/PRD.md`)
- Step/resume handoff: Form Multi-Step & Save-Continue System PRD (`specs/ConvexPress/systems/form-multi-step-system/PRD.md`)
- Server-side rules mirror: Form Logic & Validation System PRD (`specs/ConvexPress/systems/form-logic-validation-system/PRD.md`)
- Success handoff: Form Confirmation System PRD (`specs/ConvexPress/systems/form-confirmation-system/PRD.md`)
- Prefill source: Form Merge Tags & Prefill System PRD (`specs/ConvexPress/systems/form-merge-tags-prefill-system/PRD.md`)
- Authoring counterpart: Form Builder System PRD (`specs/ConvexPress/systems/form-builder-system/PRD.md`)
- Public-surface pattern: `ConvexPress-Website/apps/web/src/components/subscriptions/SignupForm.tsx`, `ConvexPress-Website/apps/web/src/routes/signup.$offerId.tsx`, `ConvexPress-Website/apps/web/src/components/plugins/PublicPluginGate.tsx`
- Embed pattern: `ConvexPress-Website/design-kit/references/page-feature.example.tsx`
- Kit: `ConvexPress-Admin/extension-kit/ARCHITECTURE.md`

---

**PRD Version:** 1.0 · **Created:** 2026-05-30 · **System:** Form Renderer System (Public) · **Plugin:** ConvexPress Forms (v2)
