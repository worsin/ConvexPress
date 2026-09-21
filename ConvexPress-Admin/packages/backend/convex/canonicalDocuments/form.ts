import { contactSourceAllowed } from "./contactSource";
import { readCompletedFormCount } from "../helpers/formSubmissionCounts";
import { streamQuery } from "convex-helpers/server/pagination";
import type { QueryCtx } from "../_generated/server";
import schema from "../schema";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { isPluginEnabled } from "../helpers/plugins";
import { evaluateMembershipAccess } from "../membership/access";
import { parseFormSettings, formEntryLimit, formRequiresLogin, evaluateFormTimeAvailability } from "../extensions/forms/builderCore";
import { loadSecuritySettings } from "../extensions/forms/spam";
import { CanonicalDataError, encodedBytes, DATA_LIMITS } from "./foundation/contracts";
import { formArgsSchema, formResultSchema, formFieldSchema, publicFormSettings, type FormArgs, type FormResult } from "./foundation/formContracts";

/** Only the canonical service supplies this reader. IDs come from the validated
 * saved tree; current plugin/publication/route policy is checked before fields. */
export async function readForm(ctx: QueryCtx, input: FormArgs, budget = new RequestReadLedger(), contactPassword?: string): Promise<FormResult> {
  const args = formArgsSchema.parse(input), asOf = Date.now();
  const missing: FormResult = { form: null, asOf, nextChangeAt: null };
  if (!args.form || !(await isPluginEnabled(ctx, "forms", budget))) return missing;
  const id = ctx.db.normalizeId("forms", args.form);
  if (!id) return missing;
  budget.beforeRead(); const form = budget.record(await ctx.db.get("forms", id));
  if (!form || form.status !== "published") return missing;
  if (!(await contactSourceAllowed(ctx, form, contactPassword, budget))) return missing;
  if (!(await evaluateMembershipAccess(ctx, { resourceType: "route", resourceIdOrKey: `/forms/${encodeURIComponent(form.slug)}` }, budget)).allowed) return missing;
  const settings = parseFormSettings(form.settings);
  const security = await loadSecuritySettings(ctx, budget);
  const time = evaluateFormTimeAvailability(settings, asOf);
  const limit = formEntryLimit(settings);
  const completeCount = limit !== null ? await readCompletedFormCount(ctx, id, budget) : 0;
  const countPending = completeCount === null;
  const entryLimitReached = limit !== null && completeCount !== null && completeCount >= limit;
  const fields: NonNullable<FormResult["form"]>["fields"] = [];
  if (form.fieldGroupId) {
    const rows = streamQuery(ctx, { schema, table: "fieldDefinitions", index: "by_group", order: "asc",
      startIndexKey: [form.fieldGroupId], startInclusive: true, endIndexKey: [form.fieldGroupId], endInclusive: true });
    try {
      while (true) {
        budget.beforeRead(); const next = await rows.next();
        if (next.done) break;
        const field = budget.record(next.value[0]);
        fields.push(formFieldSchema.parse({
          _id: field._id, label: field.label, name: field.name, key: field.key, type: field.type,
          instructions: field.instructions ?? null, required: field.required, defaultValue: field.defaultValue ?? null,
          settings: field.settings, conditionalLogic: field.conditionalLogic ?? null,
          parentFieldId: field.parentFieldId ?? null, menuOrder: field.menuOrder,
        }));
        // Stop before fetching another source once this result cannot fit. Never
        // silently remove fields or drop required validation to make a form fit.
        if (fields.length > 1000 || encodedBytes(fields) > DATA_LIMITS.resultBytes)
          throw new CanonicalDataError("RESULT_BUDGET", "forms.form", "This form exceeds the document's embedded form budget");
      }
    } finally { await rows.return(undefined); }
  }
  const startsAt = settings.scheduleStart ?? settings.schedule?.startsAt;
  const endsAt = settings.scheduleEnd ?? settings.schedule?.endsAt;
  const boundaries = [startsAt, typeof endsAt === "number" ? endsAt + 1 : null].filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > asOf);
  const result = formResultSchema.parse({
    asOf, nextChangeAt: boundaries.length ? Math.min(...boundaries) : null,
    form: {
      _id: id, title: form.title, slug: form.slug, description: form.description ?? null,
      settings: publicFormSettings(settings), fields,
      availability: { open: time.open && !countPending && !entryLimitReached, loginRequired: formRequiresLogin(settings), entryLimitReached,
        ...(!time.open ? { code: time.code, message: time.message } : countPending ? { code: "FORM_PREPARING", message: "This form is preparing its response count. Please try again shortly." } : entryLimitReached ? { code: "ENTRY_LIMIT_REACHED", message: "This form has reached its entry limit." } : {}),
      },
      security: { honeypotEnabled: security.honeypotEnabled, honeypotFieldName: security.honeypotFieldName,
        captchaEnabled: security.captchaEnabled, captchaProvider: security.captchaProvider,
        captchaSiteKey: security.captchaSiteKey ?? null, recaptchaMinScore: security.recaptchaMinScore },
    },
  });
  if (encodedBytes(result) > DATA_LIMITS.resultBytes) throw new CanonicalDataError("RESULT_BUDGET", "forms.form", "This form exceeds the document's embedded form budget");
  return result;
}
