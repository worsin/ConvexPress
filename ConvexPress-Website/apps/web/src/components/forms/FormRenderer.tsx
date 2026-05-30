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

import { useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { api } from "@convexpress-website/backend/generated/api";

import { Button } from "@/components/ui/button";
import { AuthError } from "@/components/auth/AuthError";
import { evaluateConditionalLogic } from "@/lib/forms/conditionalLogic";
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

interface FormRendererProps {
  form: PublicForm;
}

/** Field types that never carry a submittable value (layout-only). */
const LAYOUT_TYPES = new Set(["message", "accordion", "tab"]);

/** Server-side ConvexError shape returned by `submit` on validation failure. */
interface SubmitFieldError {
  fieldKey: string;
  label: string;
  error: string;
}

export function FormRenderer({ form }: FormRendererProps) {
  const submit = useMutation((api as any).extensions.forms.mutations.submit);

  // Field definitions sorted by the admin-authored order.
  const fields = useMemo(
    () =>
      [...form.fields].sort(
        (a, b) => (a.menuOrder ?? 0) - (b.menuOrder ?? 0),
      ),
    [form.fields],
  );

  // Value map keyed by field `key`, seeded from each field's defaultValue.
  const [values, setValues] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    for (const field of form.fields) {
      seed[field.key] = field.defaultValue ?? "";
    }
    return seed;
  });

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Visibility recompute on every render from the current value map.
  const visibleFields = useMemo(
    () =>
      fields.filter((field) =>
        evaluateConditionalLogic(field.conditionalLogic, values),
      ),
    [fields, values],
  );

  function setFieldValue(key: string, next: string) {
    setValues((prev) => ({ ...prev, [key]: next }));
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
      if (!field.required) continue;
      const raw = values[field.key] ?? "";
      const isEmpty =
        raw.trim() === "" || raw === "[]" || raw === "{}";
      if (isEmpty) {
        errors[field.key] = `${field.label || "This field"} is required.`;
      }
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!validate()) {
      setFormError("Please fix the highlighted fields and try again.");
      return;
    }

    // Submit only visible, value-bearing fields, keyed by fieldKey.
    const payloadValues = visibleFields
      .filter((field) => !LAYOUT_TYPES.has(field.type))
      .map((field) => ({
        fieldKey: field.key,
        value: values[field.key] ?? "",
      }));

    setIsSubmitting(true);
    try {
      await submit({
        formId: form._id as any,
        values: payloadValues,
        isComplete: true,
      });
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
  if (submitted) {
    return (
      <div
        data-slot="form-success"
        className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card p-10 text-center"
      >
        <CheckCircle2 className="size-10 text-primary" aria-hidden="true" />
        <div className="flex flex-col gap-1.5">
          <h2 className="text-lg font-semibold text-foreground">Thank you</h2>
          <p className="text-sm text-muted-foreground">
            Your response to &ldquo;{form.title}&rdquo; has been received.
          </p>
        </div>
      </div>
    );
  }

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

      <div className="flex flex-col gap-5">
        {visibleFields.map((field) => {
          const inputId = `form-${form._id}-${field.key}`;
          const error = fieldErrors[field.key];
          return (
            <div key={field._id} className="flex flex-col gap-1.5">
              <FormFieldRenderer
                field={field}
                value={values[field.key] ?? ""}
                onChange={(next) => setFieldValue(field.key, next)}
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

// ─── Error parsing ────────────────────────────────────────────────────────────

function parseSubmitError(err: unknown): {
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
