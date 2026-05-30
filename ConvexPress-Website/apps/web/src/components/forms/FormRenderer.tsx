/**
 * Public Forms — FormRenderer (Phase 1: single-page render + submit).
 *
 * Responsibilities:
 *   - Holds a `fieldKey -> string value` map, seeded from each field's
 *     defaultValue. Conditional rules reference sibling `key`s, and the submit
 *     mutation keys values by `fieldKey`, so keying state by `key` lines all
 *     three up (state, visibility evaluation, payload).
 *   - Evaluates conditional visibility with the shared evaluator; hidden fields
 *     are skipped (not rendered, not validated, not submitted).
 *   - Validates required + visible fields client-side for UX only. The backend
 *     re-validates authoritatively in `forms.mutations.submit`.
 *   - Submits via `(api as any).extensions.forms.mutations.submit` with
 *     `isComplete: true`, then shows a thank-you confirmation.
 *
 * Multi-step, calculations, merge-tags, save-and-continue, and spam/captcha are
 * intentionally OUT OF SCOPE here — those are later systems. This is a clean
 * single-page render+submit.
 *
 * `api` is imported the same way the rest of the Website imports it (from
 * `@convexpress-website/backend/generated/api`) and cast to `any` for the
 * loosely-typed extension function path, mirroring `SignupForm.tsx`.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useConvex } from "convex/react";
import DOMPurify from "isomorphic-dompurify";
import { CheckCircle2, Loader2 } from "lucide-react";
import { api } from "@convexpress-website/backend/generated/api";

import { Button } from "@/components/ui/button";
import { AuthError } from "@/components/auth/AuthError";
import {
  recomputeForm,
  COMPUTED_TYPES,
  type CalcFieldDef,
  type RepeaterRow,
} from "@/lib/forms/calc";
import {
  LAYOUT_VALUELESS_TYPES,
  sortByMenuOrder,
  deriveInitialValues,
  selectVisibleFields,
  serializeComputedMap,
  displayValueForField,
  buildSubmitPayload,
  isEmptyForRequired,
} from "@/lib/forms/render/fieldRender";
import {
  FormFieldRenderer,
  type PublicFormField,
} from "@/components/forms/FormFieldRenderer";

export interface PublicForm {
  _id: string;
  title: string;
  slug: string;
  description?: string | null;
  settings: string;
  fields: PublicFormField[];
}

/**
 * A wizard-injected step restriction (Form Multi-Step System). When present,
 * the renderer restricts its rendered + validated + submitted fields to
 * `fieldKeys` (intersected with the existing conditional `visibleFields`
 * filter). Absent ⇒ whole-form behavior (today's single-page path), unchanged.
 */
export interface FormRendererStep {
  index: number;
  total: number;
  fieldKeys: string[];
}

/**
 * Imperative handle the FormWizard lifts via `onReady`, so StepNav can
 * validate-before-next without duplicating the renderer's required-check logic.
 */
export interface FormRendererHandle {
  /** Run the client-side required check over the CURRENT (step-scoped) visible
   *  fields. Returns true when valid; surfaces inline errors when not. */
  validate: () => boolean;
}

interface FormRendererProps {
  form: PublicForm;
  /**
   * Multi-Step System: restrict render/validate/submit to a single step. Absent
   * ⇒ whole-form single-page behavior (unchanged).
   */
  step?: FormRendererStep;
  /**
   * Multi-Step System: called after every local value update so the wizard can
   * lift the value map for autosave + step gating. No-op when absent.
   */
  onValuesChange?: (values: Record<string, string>) => void;
  /**
   * Multi-Step System: suppress the renderer's own submit button + submit
   * lifecycle. When hosted, the wizard's StepNav owns Back/Next/Submit. Inferred
   * as true when `step` is present.
   */
  hideSubmit?: boolean;
  /**
   * Merge-Tags & Prefill System + Multi-Step rehydrate: seed the value map from
   * this (overriding per-field `defaultValue`). Precedence: defaultValue <
   * initialValues.
   */
  initialValues?: Record<string, string>;
  /**
   * Multi-Step System: lift an imperative handle (the per-step `validate()`).
   * Called once on mount/update with a stable handle.
   */
  onReady?: (handle: FormRendererHandle) => void;
}

/**
 * Field types that never carry a submittable value. Sourced from the shared
 * renderer module so it stays the SINGLE list mirrored against the backend
 * `LAYOUT_FIELD_TYPES` — crucially this now INCLUDES the security types
 * `captcha` + `honeypot`, so a (visible) honeypot's value is never serialized
 * into the submit payload (the server drops it too, but the client must not leak
 * it either, and a required honeypot must not block legitimate submissions).
 */
const LAYOUT_TYPES = LAYOUT_VALUELESS_TYPES;

/** Server-side ConvexError shape returned by `submit` on validation failure. */
export interface SubmitFieldError {
  fieldKey: string;
  label: string;
  error: string;
}

export function FormRenderer({
  form,
  step,
  onValuesChange,
  hideSubmit,
  initialValues,
  onReady,
}: FormRendererProps) {
  const submit = useMutation((api as any).extensions.forms.mutations.submit);
  const convex = useConvex();

  // When hosted by the wizard (a step is injected), suppress the built-in
  // submit + submit lifecycle even if `hideSubmit` wasn't passed explicitly.
  const suppressSubmit = hideSubmit ?? step !== undefined;

  // Field definitions sorted by the admin-authored order.
  const fields = useMemo(() => sortByMenuOrder(form.fields), [form.fields]);

  // Value map keyed by field `key`. Seeded from each field's defaultValue, then
  // OVERRIDDEN by any prefilled / resumed `initialValues` (precedence:
  // defaultValue < initialValues). Layout/password fields stay governed by their
  // own renderers; conditional visibility is unaffected by the seed.
  const [values, setValues] = useState<Record<string, string>>(() =>
    deriveInitialValues(form.fields, initialValues),
  );

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  // Resolved server-side confirmation message HTML (empty → static fallback).
  const [renderedMessage, setRenderedMessage] = useState<string>("");

  // Visibility recompute on every render from the current value map. When a
  // wizard step is injected, the rendered/validated/submitted set is the
  // intersection of the conditional `visibleFields` with the step's fieldKeys.
  // Absent `step` ⇒ whole form (unchanged single-page behavior).
  const stepKeySet = useMemo(
    () => (step ? new Set(step.fieldKeys) : null),
    [step],
  );
  const visibleFields = useMemo(
    () => selectVisibleFields(fields, values, stepKeySet),
    [fields, values, stepKeySet],
  );

  // Live calculation recompute (Form Calculation & Pricing System) — UX only.
  // The server re-derives every computed field authoritatively at submit (the
  // client value is never trusted for money). We feed the full value map + any
  // repeater rows and surface the derived value for `calculation`/`product`
  // fields below. Memoized on [fields, values]; full recompute is fine for v1.
  const computedValues = useMemo(() => {
    const calcDefs = fields as unknown as CalcFieldDef[];
    const repeaters: Record<string, RepeaterRow[]> = {};
    for (const field of fields) {
      if (field.type !== "repeater") continue;
      const raw = values[field.key];
      if (typeof raw !== "string" || raw.trim() === "") continue;
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          repeaters[field.key] = parsed.filter(
            (r): r is RepeaterRow => typeof r === "object" && r !== null,
          );
        }
      } catch {
        /* skip malformed repeater */
      }
    }
    const { computed } = recomputeForm(calcDefs, values, repeaters);
    return serializeComputedMap(computed);
  }, [fields, values]);

  function setFieldValue(key: string, next: string) {
    setValues((prev) => {
      const updated = { ...prev, [key]: next };
      // Lift the new value map for the wizard (autosave + step gating). Done
      // here (inside the updater) so the wizard always sees the latest map.
      onValuesChange?.(updated);
      return updated;
    });
    // Clear a field's prior error as soon as the user edits it.
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const { [key]: _, ...rest } = prev;
      return rest;
    });
  }

  /** Client-side required check on VISIBLE, value-bearing fields (UX only). */
  function validate(): boolean {
    const errors: Record<string, string> = {};
    for (const field of visibleFields) {
      if (LAYOUT_TYPES.has(field.type)) continue;
      // Computed fields are read-only + server-owned — never user-required.
      if (COMPUTED_TYPES.has(field.type)) continue;
      if (!field.required) continue;
      if (isEmptyForRequired(values[field.key])) {
        errors[field.key] = `${field.label || "This field"} is required.`;
      }
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  // Publish a STABLE imperative handle to the wizard. `validate` closes over the
  // current step's `visibleFields`/`values`, so we keep a ref to the latest and
  // hand the wizard a handle that always calls the freshest validate(). The
  // handle identity stays stable across renders (published once on mount).
  const validateRef = useRef(validate);
  validateRef.current = validate;
  const handleRef = useRef<FormRendererHandle>({
    validate: () => validateRef.current(),
  });
  useEffect(() => {
    onReady?.(handleRef.current);
    // Intentionally publish once on mount: the handle is stable and always
    // delegates to the latest validate via the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!validate()) {
      setFormError("Please fix the highlighted fields and try again.");
      return;
    }

    // Submit only visible, value-bearing fields, keyed by fieldKey. Layout +
    // security (captcha/honeypot) types are dropped by `buildSubmitPayload`.
    const payloadValues = buildSubmitPayload(visibleFields, values);

    setIsSubmitting(true);
    try {
      const res = await submit({
        formId: form._id as any,
        values: payloadValues,
        isComplete: true,
      });

      // Resolve the configured confirmation (message / redirect / page). Any
      // failure here must NOT block the success state — fall back to the static
      // thank-you below.
      try {
        const ref = await convex.query(
          (api as any).extensions.forms.confirmations.resolveConfirmation,
          { formId: form._id as any, submissionId: res.submissionId },
        );

        if (ref?.type === "redirect" && ref.redirectUrl) {
          // Host already validated server-side.
          window.location.assign(ref.redirectUrl as string);
          return;
        }
        if (ref?.type === "page" && ref.pagePath) {
          window.location.assign(ref.pagePath as string);
          return;
        }
        if (ref?.type === "message" && typeof ref.renderedMessage === "string") {
          setRenderedMessage(ref.renderedMessage);
        }
      } catch {
        // Resolver unavailable — keep the static thank-you.
      }

      setSubmitted(true);
    } catch (err: unknown) {
      const { message, serverFieldErrors } = parseSubmitError(err);
      if (serverFieldErrors) {
        const mapped: Record<string, string> = {};
        for (const fe of serverFieldErrors) {
          mapped[fe.fieldKey] = fe.error;
        }
        setFieldErrors(mapped);
      }
      setFormError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  // ── Confirmation / thank-you state ──────────────────────────────────────────
  // Only the standalone renderer owns its confirmation. When hosted, the wizard
  // owns the post-submit handoff (it calls submit with isComplete:true itself).
  if (submitted && !suppressSubmit) {
    return (
      <SubmittedConfirmation
        formTitle={form.title}
        renderedMessage={renderedMessage}
      />
    );
  }

  // Shared field list — identical markup in both standalone + hosted modes.
  const fieldList = (
    <div className="flex flex-col gap-5">
      {visibleFields.map((field) => {
        const inputId = `form-${form._id}-${field.key}`;
        const error = fieldErrors[field.key];
        // Computed fields display the recomputed value (fallback: stored, then
        // ""). A `calculation` is fully read-only (its onChange is a no-op); a
        // `product` keeps its quantity input editable so the user can change qty.
        const fieldValue = displayValueForField(field, values, computedValues);
        const handleChange =
          field.type === "calculation"
            ? () => {
                /* read-only — value owned by the calc engine */
              }
            : (next: string) => setFieldValue(field.key, next);
        return (
          <div key={field._id} className="flex flex-col gap-1.5">
            <FormFieldRenderer
              field={field}
              value={fieldValue}
              onChange={handleChange}
              invalid={Boolean(error)}
              inputId={inputId}
            />
            {error ? (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );

  // ── Hosted mode (wizard): render ONLY the step's fields + inline errors.
  // The FormWizard owns the surrounding card, header, progress, nav + submit.
  if (suppressSubmit) {
    return (
      <div data-slot="form-renderer" data-hosted="true" className="flex flex-col gap-5">
        {formError ? <AuthError message={formError} /> : null}
        {fieldList}
      </div>
    );
  }

  // ── Standalone single-page mode — unchanged behavior. ───────────────────────
  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      data-slot="form-renderer"
      className="flex flex-col gap-6 rounded-2xl border border-border bg-card p-6"
    >
      <div className="flex flex-col gap-1.5 border-b border-border pb-4">
        <h1 className="text-xl font-semibold text-foreground">{form.title}</h1>
        {form.description ? (
          <p className="text-sm text-muted-foreground">{form.description}</p>
        ) : null}
      </div>

      {formError ? <AuthError message={formError} /> : null}

      {fieldList}

      <Button type="submit" size="lg" disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
            Submitting…
          </>
        ) : (
          "Submit"
        )}
      </Button>
    </form>
  );
}

// ─── Submitted confirmation view ───────────────────────────────────────────────

/**
 * Post-submit thank-you. Renders the server-resolved confirmation message HTML
 * when present (re-sanitized client-side as defense-in-depth, matching
 * CommentItem.tsx), otherwise falls back to the static copy. Focuses the
 * success region on mount and announces it via role="status".
 */
export function SubmittedConfirmation({
  formTitle,
  renderedMessage,
}: {
  formTitle: string;
  renderedMessage: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const safeMessage = useMemo(
    () => (renderedMessage ? DOMPurify.sanitize(renderedMessage) : ""),
    [renderedMessage],
  );

  return (
    <div
      ref={ref}
      data-slot="form-success"
      role="status"
      tabIndex={-1}
      className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card p-10 text-center outline-none"
    >
      <CheckCircle2 className="size-10 text-primary" aria-hidden="true" />
      {safeMessage ? (
        <div
          className="prose prose-sm max-w-none text-foreground"
          dangerouslySetInnerHTML={{ __html: safeMessage }}
        />
      ) : (
        <div className="flex flex-col gap-1.5">
          <h2 className="text-lg font-semibold text-foreground">Thank you</h2>
          <p className="text-sm text-muted-foreground">
            Your response to &ldquo;{formTitle}&rdquo; has been received.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Error parsing ────────────────────────────────────────────────────────────

export function parseSubmitError(err: unknown): {
  message: string;
  serverFieldErrors?: SubmitFieldError[];
} {
  // ConvexError carries structured data on `err.data`.
  const convexError = err as {
    data?: { message?: string; errors?: SubmitFieldError[] };
  };
  const data = convexError?.data;
  if (data) {
    const serverFieldErrors = Array.isArray(data.errors) ? data.errors : undefined;
    return {
      message:
        data.message ??
        "We couldn't submit the form. Please review your answers and try again.",
      serverFieldErrors,
    };
  }
  if (err instanceof Error && err.message) return { message: err.message };
  return { message: "Something went wrong. Please try again." };
}
