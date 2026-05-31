/**
 * ConvexPress Forms — Calculation & Pricing core: number formatting (display)
 *
 * CANONICAL SOURCE (authored once, mirrored byte-identically). See grammar.ts.
 * MIRRORS:
 *   - Admin FE: apps/web/src/components/forms/calc/format.ts
 *   - Website:  ConvexPress-Website/apps/web/src/lib/forms/calc/format.ts
 *
 * DISPLAY ONLY. `formatNumber(value, numberFormat)` renders a number for a human.
 * Authoritative money is computed/stored in integer minor units (cents); when
 * `fromMinorUnits` is set the formatter divides by 10^decimals before display.
 * Pure: no Intl dependency required for the integer/decimal path (we hand-roll
 * grouping) so the three mirrors behave identically across runtimes.
 */

export interface NumberFormat {
  style?: "decimal" | "currency" | "percent";
  currency?: string;
  decimals?: number;
  thousandsSeparator?: boolean;
  prefix?: string;
  suffix?: string;
}

/** A few common currency symbols; unknown codes fall back to a "CODE " prefix. */
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  CAD: "$",
  AUD: "$",
};

/** Group the integer part with commas: "1234567" -> "1,234,567". */
function groupThousands(intDigits: string): string {
  let out = "";
  let count = 0;
  for (let i = intDigits.length - 1; i >= 0; i--) {
    out = intDigits[i] + out;
    count += 1;
    if (count % 3 === 0 && i > 0) out = "," + out;
  }
  return out;
}

/**
 * Format a number per a NumberFormat config. Optionally treats `value` as integer
 * minor units (cents) and scales by `decimals` first.
 */
export function formatNumber(
  value: number,
  numberFormat?: NumberFormat,
  fromMinorUnits = false,
): string {
  const fmt = numberFormat ?? {};
  const style = fmt.style ?? "decimal";
  const decimals = clampDecimals(fmt.decimals);
  const thousands = fmt.thousandsSeparator ?? true;

  let n = Number.isFinite(value) ? value : 0;
  if (fromMinorUnits) {
    n = n / Math.pow(10, decimals);
  }
  if (style === "percent") {
    n = n * 100;
  }

  const abs = Math.abs(n);

  // Fixed-decimal string, then split into integer + fraction.
  const fixed = abs.toFixed(decimals);
  const [intPart, fracPart] = fixed.split(".");

  // Sign is derived from the ROUNDED magnitude, not the raw value: a value like
  // -0.001 rounds to 0.00 at 2dp, so it must render "$0.00" — never "-$0.00".
  const negative = n < 0 && Number(fixed) !== 0;
  const groupedInt = thousands ? groupThousands(intPart ?? "0") : (intPart ?? "0");
  const numberStr = fracPart ? `${groupedInt}.${fracPart}` : groupedInt;

  // Compose prefix/suffix per style.
  let body = numberStr;
  if (style === "currency") {
    const symbol = currencySymbol(fmt.currency ?? "USD");
    body = `${symbol}${numberStr}`;
  } else if (style === "percent") {
    body = `${numberStr}%`;
  }

  const prefix = fmt.prefix ?? "";
  const suffix = fmt.suffix ?? "";
  const signed = negative ? `-${body}` : body;
  return `${prefix}${signed}${suffix}`;
}

function clampDecimals(decimals: number | undefined): number {
  if (typeof decimals !== "number" || !Number.isFinite(decimals)) return 2;
  return Math.max(0, Math.min(4, Math.trunc(decimals)));
}

function currencySymbol(code: string): string {
  const upper = code.toUpperCase();
  return CURRENCY_SYMBOLS[upper] ?? `${upper} `;
}
