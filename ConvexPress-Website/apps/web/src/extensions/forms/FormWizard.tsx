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
import {
  LAYOUT_VALUELESS_TYPES,
  selectVisibleFields,
  sortByMenuOrder,
} from "@/lib/forms/render/fieldRender";
import {
  recomputeForm,
  type CalcFieldDef,
  type Interval,
  type PricingLineItem,
  type PricingResult,
  type RepeaterRow,
} from "@/lib/forms/calc";
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
import { FormStripePaymentForm } from "./payment/FormStripePaymentForm";

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

export interface OrderFormSettings {
  enabled: boolean;
  showSummary: boolean;
  summaryTitle: string;
  paymentTitle: string;
  paymentDescription: string;
}

interface OrderPaymentDescriptor {
  clientSecret: string;
  publishableKey: string;
  mode: "payment" | "setup";
  returnUrl: string;
  paymentIntentId: string;
  amount: number;
  currency: string;
}

interface OrderPaymentState {
  submissionId: string;
  pricing: PricingResult;
  isLoading: boolean;
  descriptor: OrderPaymentDescriptor | null;
  error: string | null;
}

interface TrustedPricingSnapshot {
  oneTime?: unknown;
  recurring?: unknown;
  lineItems?: unknown;
  currency?: unknown;
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

export function parseOrderFormSettings(settings: string): OrderFormSettings {
  const parsed = parseSettings(settings);
  const raw = parsed.orderForm;
  const orderForm =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const enabled = orderForm.enabled === true;
  return {
    enabled,
    showSummary: enabled && orderForm.showSummary !== false,
    summaryTitle:
      typeof orderForm.summaryTitle === "string" && orderForm.summaryTitle.trim()
        ? orderForm.summaryTitle.trim()
        : "Order summary",
    paymentTitle:
      typeof orderForm.paymentTitle === "string" && orderForm.paymentTitle.trim()
        ? orderForm.paymentTitle.trim()
        : "Complete payment",
    paymentDescription:
      typeof orderForm.paymentDescription === "string" &&
      orderForm.paymentDescription.trim()
        ? orderForm.paymentDescription.trim()
        : "Your order has been saved. Complete payment to finish.",
  };
}

function formatMoney(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function fromMinorUnits(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? value / 100
    : 0;
}

function normalizeTrustedPricing(
  snapshot: TrustedPricingSnapshot | null | undefined,
): PricingResult | null {
  if (!snapshot || typeof snapshot.oneTime !== "number") return null;
  const currency =
    typeof snapshot.currency === "string" && snapshot.currency.trim()
      ? snapshot.currency.trim().toUpperCase()
      : "USD";
  const recurring = Array.isArray(snapshot.recurring)
    ? snapshot.recurring
        .filter(
          (line): line is Record<string, unknown> =>
            line !== null && typeof line === "object",
        )
        .map((line) => {
          const interval: Interval = line.interval === "year" ? "year" : "month";
          return {
            interval,
            amount: fromMinorUnits(line.amount),
            ...(typeof line.label === "string" && line.label
              ? { label: line.label }
              : {}),
          };
        })
        .filter((line) => line.amount !== 0)
    : [];
  const lineItems = Array.isArray(snapshot.lineItems)
    ? snapshot.lineItems
        .filter(
          (line): line is Record<string, unknown> =>
            line !== null && typeof line === "object",
        )
        .map((line, index): PricingLineItem => {
          const priceKind =
            line.priceKind === "recurring" ? "recurring" : "oneTime";
          return {
            source:
              line.source === "product" || line.source === "calculation"
                ? line.source
                : "choice",
            fieldKey:
              typeof line.fieldKey === "string"
                ? line.fieldKey
                : `line_${index}`,
            fieldLabel:
              typeof line.fieldLabel === "string" && line.fieldLabel
                ? line.fieldLabel
                : "Order item",
            label:
              typeof line.label === "string" && line.label
                ? line.label
                : "Order item",
            amount: fromMinorUnits(line.amount),
            priceKind,
            ...(typeof line.choiceValue === "string"
              ? { choiceValue: line.choiceValue }
              : {}),
            ...(typeof line.quantity === "number"
              ? { quantity: line.quantity }
              : {}),
            ...(priceKind === "recurring"
              ? { interval: line.interval === "year" ? "year" : "month" }
              : {}),
            ...(typeof line.recurringLabel === "string" && line.recurringLabel
              ? { recurringLabel: line.recurringLabel }
              : {}),
            ...(typeof line.firstPeriodAmount === "number"
              ? { firstPeriodAmount: fromMinorUnits(line.firstPeriodAmount) }
              : {}),
          };
        })
        .filter((line) => line.amount !== 0)
    : [];
  return {
    oneTime: fromMinorUnits(snapshot.oneTime),
    recurring,
    lineItems,
    currency,
  };
}

function buildRepeaters(
  fields: ReadonlyArray<PublicForm["fields"][number]>,
  values: Record<string, string>,
): Record<string, RepeaterRow[]> {
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
      // Leave malformed repeater values out of the price preview.
    }
  }
  return repeaters;
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
  const beginOrderPayment = useAction(
    (api as any).extensions.forms.orderPaymentActions.beginOrderPayment,
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
  const [orderPayment, setOrderPayment] = useState<OrderPaymentState | null>(
    null,
  );
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
  const orderFormSettings = useMemo(
    () => parseOrderFormSettings(form.settings),
    [form.settings],
  );
  const orderedFields = useMemo(
    () => sortByMenuOrder(form.fields),
    [form.fields],
  );
  const visiblePricingFields = useMemo(
    () => selectVisibleFields(orderedFields, values, null),
    [orderedFields, values],
  );
  const orderPricing = useMemo<PricingResult>(() => {
    const calcDefs = visiblePricingFields as unknown as CalcFieldDef[];
    return recomputeForm(
      calcDefs,
      values,
      buildRepeaters(visiblePricingFields, values),
    ).pricing;
  }, [visiblePricingFields, values]);
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

      let trustedPricing: PricingResult | null = null;
      if (orderFormSettings.enabled) {
        try {
          const snapshot = (await convex.query(
            (api as any).extensions.forms.queries.getSubmissionPricing,
            { id: res.submissionId },
          )) as TrustedPricingSnapshot | null;
          trustedPricing = normalizeTrustedPricing(snapshot);
        } catch {
          trustedPricing = null;
        }
      }

      const paymentPricing = trustedPricing ?? orderPricing;
      if (orderFormSettings.enabled && paymentPricing.oneTime > 0) {
        const returnUrl = `/forms/${form.slug}?payment=complete&submissionId=${encodeURIComponent(res.submissionId)}`;
        setOrderPayment({
          submissionId: res.submissionId,
          pricing: paymentPricing,
          isLoading: true,
          descriptor: null,
          error: null,
        });
        onSubmitted?.(res);
        try {
          const descriptor = (await beginOrderPayment({
            submissionId: res.submissionId as any,
            returnUrl,
          })) as OrderPaymentDescriptor;
          setOrderPayment({
            submissionId: res.submissionId,
            pricing: paymentPricing,
            isLoading: false,
            descriptor,
            error: null,
          });
        } catch (paymentErr) {
          setOrderPayment({
            submissionId: res.submissionId,
            pricing: paymentPricing,
            isLoading: false,
            descriptor: null,
            error:
              paymentErr instanceof Error
                ? paymentErr.message
                : "Could not start payment.",
          });
        }
        return;
      }

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
    form.slug,
    form.security,
    buildPayload,
    beginOrderPayment,
    orderFormSettings.enabled,
    orderPricing,
    onSubmitted,
    activeSteps,
    honeypotValue,
    captchaToken,
    captchaError,
  ]);

  // ── Post-submit confirmation handoff ────────────────────────────────────────
  // Reuse the renderer's confirmation view. The wizard owns the submit lifecycle,
  // so it also resolves the Confirmation System's redirect/page/message result.
  if (orderPayment) {
    return (
      <OrderPaymentView
        formTitle={form.title}
        pricing={orderPayment.pricing}
        settings={orderFormSettings}
        state={orderPayment}
        onError={(message) =>
          setOrderPayment((prev) => (prev ? { ...prev, error: message } : prev))
        }
      />
    );
  }

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

  const wizardCard = (
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

  if (orderFormSettings.showSummary) {
    return (
      <div
        data-slot="form-order-layout"
        className="grid w-full gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start"
      >
        {wizardCard}
        <OrderSummaryPanel pricing={orderPricing} settings={orderFormSettings} />
      </div>
    );
  }

  return wizardCard;
}

function OrderPaymentView({
  formTitle,
  pricing,
  settings,
  state,
  onError,
}: {
  formTitle: string;
  pricing: PricingResult;
  settings: OrderFormSettings;
  state: OrderPaymentState;
  onError: (message: string) => void;
}) {
  const paymentPanel = (
    <section
      data-slot="form-order-payment"
      className="flex flex-col gap-6 rounded-lg border border-border bg-card p-6"
    >
      <div className="flex flex-col gap-1.5 border-b border-border pb-4">
        <p className="text-xs font-medium uppercase text-muted-foreground">
          {formTitle}
        </p>
        <h1 className="text-xl font-semibold text-foreground">
          {settings.paymentTitle}
        </h1>
        <p className="text-sm text-muted-foreground">
          {settings.paymentDescription}
        </p>
      </div>

      <div className="flex items-center justify-between border-b border-border pb-4 text-sm">
        <span className="text-muted-foreground">Due today</span>
        <span className="text-lg font-semibold tabular-nums text-foreground">
          {formatMoney(pricing.oneTime, pricing.currency)}
        </span>
      </div>

      {state.error ? <AuthError message={state.error} /> : null}

      {state.isLoading ? (
        <p className="text-sm text-muted-foreground">Preparing payment...</p>
      ) : state.descriptor ? (
        <FormStripePaymentForm
          publishableKey={state.descriptor.publishableKey}
          clientSecret={state.descriptor.clientSecret}
          mode={state.descriptor.mode}
          returnUrl={state.descriptor.returnUrl}
          onError={onError}
        />
      ) : null}
    </section>
  );

  if (!settings.showSummary) return paymentPanel;

  return (
    <div
      data-slot="form-order-payment-layout"
      className="grid w-full gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start"
    >
      {paymentPanel}
      <OrderSummaryPanel pricing={pricing} settings={settings} />
    </div>
  );
}

function OrderSummaryPanel({
  pricing,
  settings,
}: {
  pricing: PricingResult;
  settings: OrderFormSettings;
}) {
  return (
    <aside
      data-slot="form-order-summary"
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 lg:sticky lg:top-6"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold text-foreground">
          {settings.summaryTitle}
        </h2>
        <p className="text-xs text-muted-foreground">
          {pricing.lineItems.length} selected item
          {pricing.lineItems.length === 1 ? "" : "s"}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {pricing.lineItems.length > 0 ? (
          pricing.lineItems.map((line, index) => (
            <OrderSummaryLine
              key={`${line.source}-${line.fieldKey}-${line.choiceValue ?? index}`}
              line={line}
              currency={pricing.currency}
            />
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No priced selections yet.</p>
        )}
      </div>

      {pricing.recurring.length > 0 ? (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          {pricing.recurring.map((line) => (
            <div
              key={line.interval}
              className="flex items-center justify-between gap-3 text-xs text-muted-foreground"
            >
              <span>Recurring / {line.interval}</span>
              <span className="font-medium tabular-nums text-foreground">
                {formatMoney(line.amount, pricing.currency)}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex items-center justify-between border-t border-border pt-4">
        <span className="text-sm font-medium text-foreground">Due today</span>
        <span className="text-lg font-semibold tabular-nums text-foreground">
          {formatMoney(pricing.oneTime, pricing.currency)}
        </span>
      </div>
    </aside>
  );
}

function OrderSummaryLine({
  line,
  currency,
}: {
  line: PricingLineItem;
  currency: string;
}) {
  const amount =
    line.priceKind === "recurring"
      ? `${formatMoney(line.amount, currency)}/${line.interval ?? "month"}`
      : formatMoney(line.amount, currency);
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <div className="min-w-0">
        <p className="truncate font-medium text-foreground">{line.label}</p>
        <p className="text-xs text-muted-foreground">{line.fieldLabel}</p>
      </div>
      <span className="shrink-0 font-medium tabular-nums text-foreground">
        {amount}
      </span>
    </div>
  );
}
