/**
 * The Stripe card form in the site's own look (upstream PR 062): Elements'
 * Appearance built from the theme's tokens (colours, radius, body font), the
 * body font loaded inside Stripe's frame, and payment errors in plain words.
 *
 * Stripe takes concrete values, so the page reads its tokens once mounted
 * (`readStripeTheme`) and converts every colour to sRGB hex; a token it can't
 * read is left to Stripe's default rather than guessed.
 */
import type { Appearance, StripeElementsOptions } from "@stripe/stripe-js";

export interface StripeTheme {
  primary?: string;
  background?: string;
  text?: string;
  mutedText?: string;
  danger?: string;
  border?: string;
  /** CSS length, e.g. "10px". */
  radius?: string;
  /** The first family of the body font, e.g. "Inter". */
  fontFamily?: string;
}

const HEX = /^#[0-9a-f]{6}$/i;

/** Stripe's Appearance for the theme: its variables, and inputs that match the site's fields. */
export function stripeAppearance(theme: StripeTheme): Appearance {
  const variables: NonNullable<Appearance["variables"]> = { spacingUnit: "4px" };
  if (theme.primary && HEX.test(theme.primary)) variables.colorPrimary = theme.primary;
  if (theme.background && HEX.test(theme.background)) variables.colorBackground = theme.background;
  if (theme.text && HEX.test(theme.text)) variables.colorText = theme.text;
  if (theme.mutedText && HEX.test(theme.mutedText)) variables.colorTextSecondary = theme.mutedText;
  if (theme.danger && HEX.test(theme.danger)) variables.colorDanger = theme.danger;
  if (theme.radius) variables.borderRadius = theme.radius;
  if (theme.fontFamily) variables.fontFamily = `${theme.fontFamily}, system-ui, sans-serif`;
  const border = theme.border && HEX.test(theme.border) ? theme.border : undefined;
  const ring = variables.colorPrimary ? `${variables.colorPrimary}33` : undefined;
  return {
    theme: "stripe",
    variables,
    rules: {
      ".Input": { boxShadow: "none", ...(border ? { border: `1px solid ${border}` } : {}) },
      ".Input:focus": { ...(variables.colorPrimary ? { borderColor: variables.colorPrimary } : {}), ...(ring ? { boxShadow: `0 0 0 3px ${ring}` } : {}) },
      ".Label": { fontWeight: "600" },
    },
  };
}

/** The body font inside Stripe's frame, from Google Fonts (the site's own copy isn't reachable there). */
export function stripeFonts(fontFamily: string | undefined): NonNullable<StripeElementsOptions["fonts"]> {
  if (!fontFamily || !/^[A-Za-z0-9 ]{1,60}$/.test(fontFamily)) return [];
  return [{ cssSrc: `https://fonts.googleapis.com/css2?family=${fontFamily.trim().replace(/ /g, "+")}:wght@400;500;600&display=swap` }];
}

/** What a payment error from Stripe means for the buyer, and what to do. */
export function paymentErrorMessage(error: { type?: string; code?: string; decline_code?: string; message?: string }, fallback: string): string {
  const code = error.decline_code ?? error.code;
  switch (code) {
    case "insufficient_funds":
      return "Your card has insufficient funds. Try another card.";
    case "expired_card":
      return "Your card has expired. Check the expiry date or use another card.";
    case "incorrect_cvc":
    case "invalid_cvc":
      return "The security code doesn't match. Check the three or four digits on your card.";
    case "incorrect_number":
    case "invalid_number":
      return "The card number isn't valid. Check it and try again.";
    case "payment_intent_authentication_failure":
    case "setup_intent_authentication_failure":
    case "authentication_required":
      return "Your bank couldn't confirm the payment. Try again and complete your bank's check, or use another card.";
    case "processing_error":
      return "Something went wrong while processing your card. Please try again in a moment.";
    case "card_declined":
    case "generic_decline":
    case "do_not_honor":
      return "Your card was declined. Try another card, or ask your bank why.";
  }
  if (error.type === "card_error" && error.message) return error.message;
  if (error.type === "validation_error" && error.message) return error.message;
  return fallback;
}

/** A colour the page uses, as sRGB hex: drawn on a canvas pixel, so any CSS colour syntax works. */
function toHex(color: string, canvas: CanvasRenderingContext2D): string | undefined {
  if (!color) return undefined;
  canvas.clearRect(0, 0, 1, 1);
  canvas.fillStyle = "#000000";
  canvas.fillStyle = color;
  canvas.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0, a = 0] = canvas.getImageData(0, 0, 1, 1).data;
  if (a === 0) return undefined;
  return `#${[r, g, b].map((part) => part.toString(16).padStart(2, "0")).join("")}`;
}

/** The theme's tokens as the page renders them now (call only in the browser). */
export function readStripeTheme(root: HTMLElement): StripeTheme {
  const style = getComputedStyle(root);
  const token = (name: string) => style.getPropertyValue(name).trim();
  const canvas = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  const color = (name: string) => (canvas ? toHex(token(name), canvas) : undefined);
  const radius = token("--radius");
  const remPx = Number.parseFloat(style.fontSize) || 16;
  const radiusPx = radius.endsWith("rem") ? `${Math.round(Number.parseFloat(radius) * remPx)}px` : radius.endsWith("px") ? radius : undefined;
  const family = getComputedStyle(document.body).fontFamily.split(",")[0]?.trim().replace(/^["']|["']$/g, "");
  return {
    primary: color("--primary"),
    background: color("--background"),
    text: color("--foreground"),
    mutedText: color("--muted-foreground"),
    danger: color("--destructive"),
    border: color("--border"),
    radius: radiusPx,
    fontFamily: family || undefined,
  };
}
