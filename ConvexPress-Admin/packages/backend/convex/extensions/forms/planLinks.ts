/**
 * Plan links — linking straight into a signup form with the plan chosen.
 *
 * A form's `subscription` action reads the plan either as a fixed offer or
 * from one of the form's fields (`offerMode: "fromField"`, choice value →
 * offer through `offerFieldMap`). Pricing pages link into such a form, so
 * that field is the one field a link may always preselect: the public form
 * read marks it prefillable (URL parameter `plan`, unless the field names its
 * own), and the pricing read builds each offer's link with the matching
 * choice. A field whose settings say `allowDynamicPopulation: false` has
 * opted out; its links open the form without a plan chosen.
 *
 * Pure: no Convex imports; values are validated before use.
 */

export const DEFAULT_PLAN_PARAM = "plan";

/** What a subscription action's config says about the plan. */
export type ActionPlan =
  | { mode: "fixed"; offerId: string }
  | { mode: "fromField"; fieldKey: string; offerByChoice: Record<string, string> };

function parseObject(json: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parsed)) out[key] = value;
    return out;
  } catch {
    return null;
  }
}

/** The plan a subscription action's config selects, or null when it names none usable. */
export function actionPlan(configJson: string): ActionPlan | null {
  const config = parseObject(configJson);
  if (!config) return null;
  if (config.offerMode === "fixed") {
    return typeof config.offerId === "string" && config.offerId ? { mode: "fixed", offerId: config.offerId } : null;
  }
  if (config.offerMode === "fromField" && typeof config.offerFieldName === "string" && config.offerFieldName) {
    const offerByChoice: Record<string, string> = {};
    const map = config.offerFieldMap;
    if (map && typeof map === "object" && !Array.isArray(map)) {
      for (const [choice, offerId] of Object.entries(map)) {
        if (typeof offerId === "string" && offerId) offerByChoice[choice] = offerId;
      }
    }
    return { mode: "fromField", fieldKey: config.offerFieldName, offerByChoice };
  }
  return null;
}

/** The choice value that selects `offerId` (the map's key, or the id itself when unmapped). */
export function choiceForOffer(plan: Extract<ActionPlan, { mode: "fromField" }>, offerId: string): string {
  for (const [choice, mapped] of Object.entries(plan.offerByChoice)) {
    if (mapped === offerId) return choice;
  }
  return offerId;
}

/**
 * The URL parameter that preselects the plan field, or null when the field has
 * opted out of being filled from links.
 */
export function planParam(fieldSettingsJson: string): string | null {
  const settings = parseObject(fieldSettingsJson) ?? {};
  if (settings.allowDynamicPopulation === false) return null;
  if (settings.adminOnly === true || settings.hidden === true) return null;
  const custom = settings.paramName;
  if (settings.allowDynamicPopulation === true && typeof custom === "string" && custom.trim()) return custom.trim();
  return DEFAULT_PLAN_PARAM;
}

/** The plan field's settings as the public form sees them: prefillable under `planParam`. */
export function withPlanPrefill(fieldSettingsJson: string): string {
  const settings = parseObject(fieldSettingsJson) ?? {};
  const param = planParam(fieldSettingsJson);
  if (param === null) return fieldSettingsJson;
  return JSON.stringify({ ...settings, allowDynamicPopulation: true, paramName: param });
}

/** The values of a choice field's options, in order. */
export function choiceValues(fieldSettingsJson: string): string[] {
  return choiceOptions(fieldSettingsJson).map((choice) => choice.value);
}

/** A choice field's options (value and label, label falling back to the value), in order. */
export function choiceOptions(fieldSettingsJson: string): Array<{ value: string; label: string }> {
  const settings = parseObject(fieldSettingsJson);
  const choices = settings?.choices;
  if (!Array.isArray(choices)) return [];
  const options: Array<{ value: string; label: string }> = [];
  for (const choice of choices) {
    if (choice && typeof choice === "object" && !Array.isArray(choice)) {
      const value: unknown = Reflect.get(choice, "value");
      const label: unknown = Reflect.get(choice, "label");
      if (typeof value === "string" && value) {
        options.push({ value, label: typeof label === "string" && label.trim() ? label : value });
      }
    }
  }
  return options;
}

