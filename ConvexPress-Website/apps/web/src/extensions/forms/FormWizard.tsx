/**
 * Form Multi-Step & Save-Continue — the wizard host.
 *
 * A THIN coordination layer that WRAPS the committed FormRenderer (never forks
 * it) and IMPORTS the shared step model + conditional evaluator. It owns:
 *   - the lifted value map (seeded from initialValues ?? field defaults),
 *   - the step state machine over the LIVE (skip-aware) active-step list,
 *   - ~1s debounced autosave via `submit({ isComplete:false, resumeToken,
 *     currentStep })` against the on-disk ARRAY `submit` contract,
 *   - final submit (isComplete:true) with server-error → step mapping,
 *   - first-view + first-interaction funnel pings (Analytics System §12).
 *
 * Resume-token resiliency (PLAN §0.B): the Submission System mints the bearer
 * resume token on the first autosave. The wizard only stores and reuses the
 * server-returned token for later autosaves/final submit.
 *
 * Degrades to single-page: when there is exactly one active step it renders the
 * one step with no progress bar and a plain Submit — like the bare renderer.
 *
 * SSR-safe: no `window`/`crypto` at module load (only inside effects/handlers).
 * No `@radix-ui/*`, no hardcoded colors. `api` is `(api as any)` for the
 * loosely-typed extension function path, mirroring FormRenderer/SignupForm.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useAction, useConvex, useMutation } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

import { AuthError } from "@/components/auth/AuthError";
import {
  FormRenderer,
  SubmittedConfirmation,
  parseSubmitError,
  type FormRendererHandle,
  type PublicForm,
} from "@/components/forms/FormRenderer";
import {
  clampStepIndex,
  computeActiveSteps,
  deriveSteps,
  type WizardStep,
} from "./wizardSteps";
import { LAYOUT_VALUELESS_TYPES } from "@/lib/forms/render/fieldRender";
import { StepProgress } from "./StepProgress";
import { StepNav } from "./StepNav";
import { AutosaveIndicator, type SaveState } from "./AutosaveIndicator";
import { ResumeBanner } from "./ResumeBanner";
import {
  FormLoginRequiredNotice,
  FormStateNotice,
  getFormClosedState,
  parsePublicFormSettings,
  publicFormRequiresLogin,
} from "./StateNotices";
import { FormSecurityControls } from "./SecurityControls";
import {
  buildSubmitSecurityEnvelope,
  captchaConfigProblem,
  captchaIsRequired,
} from "./security";

const DEFAULT_AUTOSAVE_DELAY_MS = 1000;

function browserNonce(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${prefix}_${hex}`;
  }
  return `${prefix}_${Date.now().toString(36)}`;
}

export interface FormWizardOptions {
  autosave?: boolean;
  autosaveDelayMs?: number;
  showProgress?: boolean;
  allowBackNav?: boolean;
}

interface FormWizardProps {
  form: PublicForm;
  /** Present on the resume path — seeds the resume key + shows the banner. */
  resumeToken?: string;
  /** Prefilled / resumed values (override per-field defaults in the renderer). */
  initialValues?: Record<string, string>;
  /** Resumed step (clamped into the live active-step list). */
  initialStep?: number;
  /** Handed the final submit result for the Confirmation System handoff. */
  onSubmitted?: (res: { submissionId: string; isComplete: boolean }) => void;
  options?: FormWizardOptions;
}

/** Parse a field's settings JSON tolerantly (for page_break label overrides). */
function parseSettings(settings: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(settings);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Build the autosave/submit ARRAY payload from ALL fields + the live value map.
 * Pure + exported so the value-less filter is unit-testable without rendering.
 *
 * Drops EVERY value-less layout/security type via the canonical
 * `LAYOUT_VALUELESS_TYPES` (message/accordion/tab/page_break/captcha/honeypot) —
 * not just `page_break` — so a debounced draft save never leaks a honeypot /
 * captcha value (same bug class the renderer's `buildSubmitPayload` guards). A
 * field absent from the value map is skipped (no key emitted).
 */
export function buildWizardPayload(
  fields: ReadonlyArray<{ key: string; type: string }>,
  valueMap: Record<string, string>,
): Array<{ fieldKey: string; value: string }> {
  const out: Array<{ fieldKey: string; value: string }> = [];
  for (const f of fields) {
    if (LAYOUT_VALUELESS_TYPES.has(f.type)) continue;
    const v = valueMap[f.key];
    if (v === undefined) continue;
    out.push({ fieldKey: f.key, value: v });
  }
  return out;
}

export function FormWizard({
  form,
  resumeToken,
  initialValues,
  initialStep,
  onSubmitted,
  options,
}: FormWizardProps) {
  const { isLoaded, isSignedIn } = useAuth();
  const opts = {
    autosave: options?.autosave ?? true,
    autosaveDelayMs: options?.autosaveDelayMs ?? DEFAULT_AUTOSAVE_DELAY_MS,
    showProgress: options?.showProgress ?? true,
    allowBackNav: options?.allowBackNav ?? true,
  };

  const submit = useMutation((api as any).extensions.forms.mutations.submit);
  const submitWithCaptcha = useAction(
    (api as any).extensions.forms.mutations.submitWithCaptcha,
  );
  const recordFunnel = useMutation(
    (api as any).extensions.forms.analytics.recordFunnelPublic,
  );
  const convex = useConvex();

  // ── Derived step model (pure) ───────────────────────────────────────────────
  const steps = useMemo<WizardStep[]>(
    () => deriveSteps(form.fields),
    [form.fields],
  );
  // page_break label overrides keyed by the index of the step they PRECEDE.
  const breakLabels = useMemo(() => {
    const sorted = [...form.fields].sort(
      (a, b) => (a.menuOrder ?? 0) - (b.menuOrder ?? 0),
    );
    const labels: Array<{ nextLabel?: string; prevLabel?: string }> = [];
    let stepCursor = 0;
    let sawFieldInStep = false;
    for (const f of sorted) {
      if (f.type === "page_break") {
        if (sawFieldInStep) {
          stepCursor += 1;
          sawFieldInStep = false;
        }
        const s = parseSettings(f.settings);
        labels[stepCursor] = {
          nextLabel: typeof s.nextLabel === "string" ? s.nextLabel : undefined,
          prevLabel: typeof s.prevLabel === "string" ? s.prevLabel : undefined,
        };
      } else {
        sawFieldInStep = true;
      }
    }
    return labels;
  }, [form.fields]);

  // ── State ───────────────────────────────────────────────────────────────────
  const [values, setValues] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    for (const f of form.fields) seed[f.key] = f.defaultValue ?? "";
    if (initialValues) {
      for (const [k, val] of Object.entries(initialValues)) seed[k] = val;
    }
    return seed;
  });
  const [stepIndex, setStepIndex] = useState(0);
  const [furthestStep, setFurthestStep] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedResult, setSubmittedResult] = useState<{
    submissionId: string;
    isComplete: boolean;
  } | null>(null);
  const [renderedMessage, setRenderedMessage] = useState("");
  const [honeypotValue, setHoneypotValue] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaError, setCaptchaError] = useState<string | null>(null);

  // Refs (no re-render): resume token, last submission id, debounce timer,
  // renderer handle, and the latest values for the debounced flush.
  const resumeTokenRef = useRef<string | undefined>(resumeToken);
  const submissionIdRef = useRef<string | undefined>(undefined);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rendererRef = useRef<FormRendererHandle | null>(null);
  const valuesRef = useRef(values);
  const startedAtRef = useRef(Date.now());
  valuesRef.current = values;

  // ── Live active steps + clamp ───────────────────────────────────────────────
  const activeSteps = useMemo(
    () => computeActiveSteps(steps, values, form.fields),
    [steps, values, form.fields],
  );
  // Map the desired stepIndex into the live list; clamp so a step emptied by
  // logic never strands the user (PRD §12). Uses the hardened pure clamp so a
  // non-finite / float index (e.g. from an untrusted resume token) can never
  // index the active-step array as `undefined`.
  const clampedIndex = clampStepIndex(stepIndex, activeSteps.length);
  // Re-sync the clamped index back into state when logic shrinks the list.
  useEffect(() => {
    if (clampedIndex !== stepIndex) setStepIndex(clampedIndex);
  }, [clampedIndex, stepIndex]);

  // On the resume path, jump to the resumed step once (clamped to live list).
  const didInitStep = useRef(false);
  useEffect(() => {
    if (didInitStep.current) return;
    didInitStep.current = true;
    if (typeof initialStep === "number" && activeSteps.length > 0) {
      // Untrusted (resume-token-controlled) step → hardened clamp.
      const target = clampStepIndex(initialStep, activeSteps.length);
      setStepIndex(target);
      setFurthestStep((f) => Math.max(f, target));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = activeSteps[clampedIndex];
  const isFinal = clampedIndex === activeSteps.length - 1;
  const isSinglePage = activeSteps.length <= 1;
  const formSettings = useMemo(
    () => parsePublicFormSettings(form.settings),
    [form.settings],
  );
  const closedState = useMemo(
    () => getFormClosedState(formSettings, form.availability),
    [formSettings, form.availability],
  );
  const loginRequired = publicFormRequiresLogin(formSettings, form.availability);
  const loginBlocked = loginRequired && (!isLoaded || !isSignedIn);

  // ── Funnel analytics (Analytics System §12) ─────────────────────────────────
  // first VIEW on mount; first INTERACTION (started) on the first value change.
  const viewedRef = useRef(false);
  const startedRef = useRef(false);
  const sessionNonceRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (viewedRef.current) return;
    viewedRef.current = true;
    void recordFunnel({ formId: form._id as any, stage: "viewed" }).catch(
      () => {},
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Autosave ────────────────────────────────────────────────────────────────
  /** Build the on-disk ARRAY payload from ALL currently-visible fields across
   *  all steps (so resume rehydrates everything). The server drops hidden /
   *  unknown / layout fields, so sending the whole working map is safe. Delegates
   *  to the pure {@link buildWizardPayload} (value-less layout/security types are
   *  dropped there via the canonical set). */
  const buildPayload = useCallback(
    (): Array<{ fieldKey: string; value: string }> =>
      buildWizardPayload(form.fields, valuesRef.current),
    [form.fields],
  );

  const flushAutosave = useCallback(async () => {
    if (!opts.autosave) return;
    setSaveState("saving");
    try {
      const res = await submit({
        formId: form._id as any,
        values: buildPayload(),
        isComplete: false,
        resumeToken: resumeTokenRef.current || undefined,
        currentStep: clampedIndex,
        ...buildSubmitSecurityEnvelope({
          security: form.security,
          honeypotValue,
          startedAt: startedAtRef.current,
          isComplete: false,
        }),
      });
      submissionIdRef.current = res?.submissionId;
      // Prefer a server-returned token if/when the Submission System mints one.
      resumeTokenRef.current = res?.resumeToken ?? resumeTokenRef.current;
      setSaveState("saved");
      setSavedAt(Date.now());
    } catch {
      // Non-blocking: keep input working; retry on the next change / step.
      setSaveState("save-error");
    }
  }, [
    opts.autosave,
    submit,
    form._id,
    form.security,
    honeypotValue,
    buildPayload,
    clampedIndex,
  ]);

  const scheduleAutosave = useCallback(() => {
    if (!opts.autosave) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void flushAutosave();
    }, opts.autosaveDelayMs);
  }, [opts.autosave, opts.autosaveDelayMs, flushAutosave]);

  // Clear any pending timer on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // ── Value change handler (lifted from the renderer) ─────────────────────────
  const onValuesChange = useCallback(
    (next: Record<string, string>) => {
      valuesRef.current = next;
      setValues(next);
      setSubmitError(null);
      // First interaction → funnel "started" (deduped client-side).
      if (!startedRef.current) {
        startedRef.current = true;
        if (!sessionNonceRef.current) {
          sessionNonceRef.current = browserNonce("forms_started");
        }
        void recordFunnel({
          formId: form._id as any,
          stage: "started",
          sessionNonce: sessionNonceRef.current,
        }).catch(() => {});
      }
      scheduleAutosave();
    },
    [scheduleAutosave, recordFunnel, form._id],
  );

  // ── Navigation ──────────────────────────────────────────────────────────────
  const goNext = useCallback(() => {
    // Validate the current step via the renderer's lifted handle. On fail the
    // renderer surfaces inline errors and we do not advance.
    const ok = rendererRef.current?.validate() ?? true;
    if (!ok) return;
    // Immediate (non-debounced) flush so the draft is never a keystroke behind.
    if (timerRef.current) clearTimeout(timerRef.current);
    void flushAutosave();
    const target = Math.min(clampedIndex + 1, activeSteps.length - 1);
    setStepIndex(target);
    setFurthestStep((f) => Math.max(f, target));
  }, [flushAutosave, clampedIndex, activeSteps.length]);

  const goBack = useCallback(() => {
    if (!opts.allowBackNav) return;
    setStepIndex((i) => Math.max(0, i - 1));
  }, [opts.allowBackNav]);

  const jumpTo = useCallback(
    (target: number) => {
      if (!opts.allowBackNav) return;
      if (target < clampedIndex) setStepIndex(target);
    },
    [opts.allowBackNav, clampedIndex],
  );

  // ── Final submit ────────────────────────────────────────────────────────────
  const onFinalSubmit = useCallback(async () => {
    const ok = rendererRef.current?.validate() ?? true;
    if (!ok) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    setSubmitError(null);
    const captchaProblem = captchaConfigProblem(form.security);
    if (captchaProblem) {
      setSubmitError(captchaProblem);
      return;
    }
    if (captchaIsRequired(form.security) && !captchaToken.trim()) {
      setSubmitError(
        captchaError ?? "Please complete the verification challenge.",
      );
      return;
    }
    setIsSubmitting(true);
    try {
      const submitComplete = captchaIsRequired(form.security)
        ? submitWithCaptcha
        : submit;
      const res = await submitComplete({
        formId: form._id as any,
        values: buildPayload(),
        isComplete: true,
        resumeToken: resumeTokenRef.current,
        ...buildSubmitSecurityEnvelope({
          security: form.security,
          honeypotValue,
          captchaToken,
          startedAt: startedAtRef.current,
          isComplete: true,
        }),
      });

      try {
        const ref = await convex.query(
          (api as any).extensions.forms.confirmations.resolveConfirmation,
          { formId: form._id as any, submissionId: res.submissionId },
        );

        if (ref?.type === "redirect" && ref.redirectUrl) {
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
        setRenderedMessage("");
      }

      setSubmittedResult(res);
      onSubmitted?.(res);
    } catch (err: unknown) {
      // Map server field errors back to the step that owns each field, jump to
      // the FIRST offending step, and do NOT treat as complete.
      const { message, serverFieldErrors } = parseSubmitError(err);
      setSubmitError(message);
      if (serverFieldErrors && serverFieldErrors.length > 0) {
        const offendingKeys = new Set(serverFieldErrors.map((e) => e.fieldKey));
        let firstStep = -1;
        for (let i = 0; i < activeSteps.length; i++) {
          if (activeSteps[i]!.fieldKeys.some((k) => offendingKeys.has(k))) {
            firstStep = i;
            break;
          }
        }
        if (firstStep >= 0) {
          setStepIndex(firstStep);
          // Defer validate so the renderer re-mounts on the offending step and
          // re-runs its own required check (surfacing inline errors there).
          setTimeout(() => rendererRef.current?.validate(), 0);
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [
    submit,
    submitWithCaptcha,
    convex,
    form._id,
    form.security,
    buildPayload,
    onSubmitted,
    activeSteps,
    honeypotValue,
    captchaToken,
    captchaError,
  ]);

  // ── Post-submit confirmation handoff ────────────────────────────────────────
  // Reuse the renderer's confirmation view. The wizard owns the submit lifecycle,
  // so it also resolves the Confirmation System's redirect/page/message result.
  if (submittedResult) {
    return (
      <SubmittedConfirmation
        formTitle={form.title}
        renderedMessage={renderedMessage}
      />
    );
  }

  if (!current) {
    // Defensive: no active step (e.g. a form of only page breaks). Render the
    // bare renderer so SOMETHING coherent shows.
    return <FormRenderer form={form} initialValues={values} />;
  }

  const labels = breakLabels[clampedIndex] ?? {};

  return (
    <div
      data-slot="form-wizard"
      className="flex flex-col gap-6 rounded-lg border border-border bg-card p-6"
    >
      <div className="flex flex-col gap-1.5 border-b border-border pb-4">
        <h1 className="text-xl font-semibold text-foreground">{form.title}</h1>
        {form.description ? (
          <p className="text-sm text-muted-foreground">{form.description}</p>
        ) : null}
      </div>

      {resumeToken ? <ResumeBanner stepNumber={clampedIndex + 1} /> : null}

      {!closedState.open ? (
        <FormStateNotice state={closedState} />
      ) : loginBlocked ? (
        <FormLoginRequiredNotice />
      ) : (
        <>
          {opts.showProgress && !isSinglePage ? (
            <StepProgress
              activeSteps={activeSteps}
              currentIndex={clampedIndex}
              furthestIndex={furthestStep}
              allowBackNav={opts.allowBackNav}
              onJumpTo={jumpTo}
            />
          ) : null}

          {submitError ? <AuthError message={submitError} /> : null}

          <FormRenderer
            // Re-mount the renderer per step so its internal field error state is
            // scoped to the step (keyed on the step index).
            key={`step-${current.index}`}
            form={form}
            step={{
              index: clampedIndex,
              total: activeSteps.length,
              fieldKeys: current.fieldKeys,
            }}
            initialValues={values}
            onValuesChange={onValuesChange}
            hideSubmit
            onReady={(handle) => {
              rendererRef.current = handle;
            }}
          />

          <FormSecurityControls
            formId={form._id}
            security={form.security}
            honeypotValue={honeypotValue}
            onHoneypotChange={setHoneypotValue}
            onCaptchaTokenChange={setCaptchaToken}
            onCaptchaErrorChange={setCaptchaError}
          />

          <StepNav
            canBack={clampedIndex > 0 && opts.allowBackNav}
            isFinal={isFinal}
            onBack={goBack}
            onNext={goNext}
            onSubmit={onFinalSubmit}
            isSubmitting={isSubmitting}
            nextLabel={labels.nextLabel}
            prevLabel={labels.prevLabel}
          />

          <AutosaveIndicator saveState={saveState} savedAt={savedAt} />
        </>
      )}
    </div>
  );
}
