/**
 * DateFormatPreview - Live preview of a date format string.
 *
 * Shows the current date formatted using the given format string
 * and timezone. Updates every minute.
 *
 * Uses a simple format implementation since date-fns/date-fns-tz
 * may not be installed yet. Falls back gracefully on invalid formats.
 */

import * as React from "react";

interface DateFormatPreviewProps {
  /** The date format string (uses common tokens) */
  format: string;
  /** The selected IANA timezone (currently informational) */
  timezone?: string;
}

/**
 * Get date components in a specific timezone using Intl.DateTimeFormat.
 * Falls back to local time if the timezone is invalid.
 */
function getDatePartsInTimezone(
  date: Date,
  timezone?: string,
): { year: number; month: number; day: number } {
  try {
    const options: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      ...(timezone ? { timeZone: timezone } : {}),
    };
    const formatter = new Intl.DateTimeFormat("en-US", options);
    const parts = formatter.formatToParts(date);

    const year = parseInt(parts.find((p) => p.type === "year")?.value ?? "0", 10);
    const month = parseInt(parts.find((p) => p.type === "month")?.value ?? "1", 10) - 1;
    const day = parseInt(parts.find((p) => p.type === "day")?.value ?? "1", 10);

    return { year, month, day };
  } catch {
    // Fallback to local time if timezone is invalid
    return {
      year: date.getFullYear(),
      month: date.getMonth(),
      day: date.getDate(),
    };
  }
}

/**
 * Simple date formatter using common format tokens.
 * Supports: MMMM, MMM, MM, M, dd, d, yyyy, yy
 * Renders in the specified timezone via Intl.DateTimeFormat.
 */
function formatDate(date: Date, formatStr: string, timezone?: string): string {
  try {
    const months = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];
    const monthsShort = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];

    const { year: y, month: m, day: d } = getDatePartsInTimezone(date, timezone);

    let result = formatStr;

    // Replace tokens (order matters - longest first)
    result = result.replace(/MMMM/g, months[m]);
    result = result.replace(/MMM/g, monthsShort[m]);
    result = result.replace(/MM/g, String(m + 1).padStart(2, "0"));
    result = result.replace(/(?<![Md])M(?![Md])/g, String(m + 1));
    result = result.replace(/dd/g, String(d).padStart(2, "0"));
    result = result.replace(/(?<![Md])d(?![Md])/g, String(d));
    result = result.replace(/yyyy/g, String(y));
    result = result.replace(/yy/g, String(y).slice(-2));

    return result;
  } catch {
    return "Invalid format";
  }
}

export function DateFormatPreview({
  format,
  timezone,
}: DateFormatPreviewProps) {
  const [now, setNow] = React.useState(new Date());

  // Update every 60 seconds
  React.useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  if (!format) return null;

  const formatted = formatDate(now, format, timezone);

  return (
    <span className="text-xs text-muted-foreground font-mono">
      {formatted}
    </span>
  );
}
