/**
 * TimeFormatPreview - Live preview of a time format string.
 *
 * Shows the current time formatted using the given format string
 * and timezone. Updates every second.
 *
 * Uses a simple format implementation. Falls back gracefully on invalid formats.
 */

import * as React from "react";

interface TimeFormatPreviewProps {
  /** The time format string (uses common tokens) */
  format: string;
  /** The selected IANA timezone (currently informational) */
  timezone?: string;
}

/**
 * Get time components in a specific timezone using Intl.DateTimeFormat.
 * Falls back to local time if the timezone is invalid.
 */
function getTimePartsInTimezone(
  date: Date,
  timezone?: string,
): { hours24: number; minutes: number; seconds: number } {
  try {
    const options: Intl.DateTimeFormatOptions = {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      ...(timezone ? { timeZone: timezone } : {}),
    };
    const formatter = new Intl.DateTimeFormat("en-US", options);
    const parts = formatter.formatToParts(date);

    const hours24 = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
    const minutes = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
    const seconds = parseInt(parts.find((p) => p.type === "second")?.value ?? "0", 10);

    return { hours24, minutes, seconds };
  } catch {
    // Fallback to local time if timezone is invalid
    return {
      hours24: date.getHours(),
      minutes: date.getMinutes(),
      seconds: date.getSeconds(),
    };
  }
}

/**
 * Simple time formatter using common format tokens.
 * Supports: HH, H, hh, h, mm, m, ss, s, a
 * Renders in the specified timezone via Intl.DateTimeFormat.
 */
function formatTime(date: Date, formatStr: string, timezone?: string): string {
  try {
    const { hours24, minutes, seconds } = getTimePartsInTimezone(date, timezone);
    const hours12 = hours24 % 12 || 12;
    const ampm = hours24 >= 12 ? "PM" : "AM";

    let result = formatStr;

    // Replace tokens (order matters - longest first)
    result = result.replace(/HH/g, String(hours24).padStart(2, "0"));
    result = result.replace(/(?<![Hh])H(?![Hh])/g, String(hours24));
    result = result.replace(/hh/g, String(hours12).padStart(2, "0"));
    result = result.replace(/(?<![Hh])h(?![Hh])/g, String(hours12));
    result = result.replace(/mm/g, String(minutes).padStart(2, "0"));
    result = result.replace(/(?<![ms])m(?![ms])/g, String(minutes));
    result = result.replace(/ss/g, String(seconds).padStart(2, "0"));
    result = result.replace(/(?<![ms])s(?![ms])/g, String(seconds));
    result = result.replace(/a/g, ampm);

    return result;
  } catch {
    return "Invalid format";
  }
}

export function TimeFormatPreview({
  format,
  timezone,
}: TimeFormatPreviewProps) {
  const [now, setNow] = React.useState(new Date());

  // Update every second for time formats
  React.useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!format) return null;

  const formatted = formatTime(now, format, timezone);

  return (
    <span className="text-xs text-muted-foreground font-mono">
      {formatted}
    </span>
  );
}
