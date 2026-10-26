/**
 * The browser's check of one answer before a step advances: the same shape
 * rules the server applies on submit (helpers/customFieldValidation.ts), so a
 * person learns about a mistyped phone number, NPI or email on the step where
 * they typed it, not after paying. The server stays the authority.
 */
import { fieldFormatError, isFieldFormat } from "@convexpress-website/backend/generated/fieldFormats";

/** The format, autocomplete token and limits a field's settings declare. */
export type AnswerRules = {
  format?: string;
  autocomplete?: string;
  maxLength?: number;
  min?: number;
  max?: number;
};

export function answerRules(settings: string): AnswerRules {
  try {
    const parsed: unknown = JSON.parse(settings);
    if (!parsed || typeof parsed !== "object") return {};
    const rules: AnswerRules = {};
    const read = (key: string): unknown => Reflect.get(parsed, key);
    const format = read("format");
    if (typeof format === "string") rules.format = format;
    const autocomplete = read("autocomplete");
    if (typeof autocomplete === "string") rules.autocomplete = autocomplete;
    for (const key of ["maxLength", "min", "max"] as const) {
      const value = read(key);
      const number = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
      if (Number.isFinite(number)) rules[key] = number;
    }
    return rules;
  } catch {
    return {};
  }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Why a non-empty answer would be refused, or null. Empty answers are the required rule's concern. */
export function answerError(type: string, value: string, rules: AnswerRules): string | null {
  const answer = value.trim();
  if (answer === "") return null;
  switch (type) {
    case "email":
      return EMAIL.test(answer) ? null : "Enter an email address like name@example.com.";
    case "url":
      // The input completes "example.com" to https://example.com when it loses focus.
      try {
        const url = new URL(answer);
        return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.includes(".") ? null : "Enter a web address like https://example.com.";
      } catch {
        return "Enter a web address like https://example.com.";
      }
    case "number": {
      const number = Number(answer);
      if (!Number.isFinite(number)) return "Enter a number.";
      if (rules.min !== undefined && number < rules.min) return `Enter ${rules.min} or more.`;
      if (rules.max !== undefined && number > rules.max) return `Enter ${rules.max} or less.`;
      return null;
    }
    case "text":
      if (rules.maxLength !== undefined && rules.maxLength > 0 && answer.length > rules.maxLength) {
        return `Use ${rules.maxLength} characters or fewer.`;
      }
      return isFieldFormat(rules.format) ? fieldFormatError(rules.format, answer) : null;
    default:
      return null;
  }
}
