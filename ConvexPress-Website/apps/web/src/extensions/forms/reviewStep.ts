/**
 * The review step (form setting `reviewStep`, upstream PR 064): every answer
 * the buyer gave, page by page, as the form will submit it, so they can check
 * it (and edit a page) before submitting and paying. Only fields visible under
 * the form's logic are listed; value-less layout fields never are; passwords
 * are never shown.
 */
import type { PublicFormField } from "@/components/forms/FormFieldRenderer";
import { isEmptyForRequired, LAYOUT_VALUELESS_TYPES, parseMultiValue } from "@/lib/forms/render/fieldRender";
import { visibleFieldKeys, type WizardStep } from "./wizardSteps";

export interface ReviewAnswer {
  key: string;
  label: string;
  value: string;
}

export interface ReviewSection {
  /** The page's position among the form's active pages (what Edit returns to). */
  position: number;
  title: string;
  answers: ReviewAnswer[];
}

const NOT_ANSWERED = "Not answered";
const MULTI_CHOICE = new Set(["checkbox", "multi_select"]);

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : null;
}

/** The choice labels of a field (its settings' choices, or its plan offers' titles), by value. */
function choiceLabels(field: PublicFormField): Map<string, string> {
  const labels = new Map<string, string>();
  let settings: Record<string, unknown> | null = null;
  try {
    settings = record(JSON.parse(field.settings || "{}"));
  } catch {
    settings = null;
  }
  const choices = settings?.choices;
  if (Array.isArray(choices)) {
    for (const choice of choices) {
      const entry = record(choice);
      if (entry && typeof entry.value === "string") labels.set(entry.value, typeof entry.label === "string" && entry.label ? entry.label : entry.value);
    }
  }
  for (const offer of field.planOffers ?? []) if (!labels.has(offer.value)) labels.set(offer.value, offer.title);
  return labels;
}

/** How an answer reads on the review page. */
export function reviewValue(field: PublicFormField, raw: string | undefined): string {
  if (field.type === "password") return isEmptyForRequired(raw) ? NOT_ANSWERED : "Entered";
  if (field.type === "true_false") return raw === "1" || raw === "true" ? "Yes" : "No";
  if (isEmptyForRequired(raw)) return NOT_ANSWERED;
  const value = raw ?? "";
  const labels = choiceLabels(field);
  if (MULTI_CHOICE.has(field.type) || (value.startsWith("[") && labels.size > 0)) {
    const picked = parseMultiValue(value).map((choice) => labels.get(choice) ?? choice);
    return picked.length ? picked.join(", ") : NOT_ANSWERED;
  }
  return labels.get(value) ?? value;
}

/** The active pages and their visible answers, in order. */
export function reviewSections(activeSteps: readonly WizardStep[], values: Record<string, string>, fields: PublicFormField[]): ReviewSection[] {
  const byKey = new Map(fields.map((field) => [field.key, field]));
  return activeSteps
    .map((step, position) => ({
      position,
      title: step.title?.trim() || `Page ${position + 1}`,
      answers: visibleFieldKeys(step, values, fields).flatMap((key) => {
        const field = byKey.get(key);
        if (!field || LAYOUT_VALUELESS_TYPES.has(field.type)) return [];
        return [{ key, label: field.label || field.name, value: reviewValue(field, values[key]) }];
      }),
    }))
    .filter((section) => section.answers.length > 0);
}
