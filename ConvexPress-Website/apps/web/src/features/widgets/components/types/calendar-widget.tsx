/**
 * Calendar Widget - Website Renderer
 *
 * Displays a simple calendar showing the current month.
 * Days with published posts can link to the day's archive.
 */

import { useEffect, useState } from "react";

/** Compute calendar data for a given date */
function computeCalendarData(date: Date) {
  const y = date.getFullYear();
  const m = date.getMonth();

  const firstDay = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  const daysList: (number | null)[] = [];
  // Pad with nulls for days before the 1st
  for (let i = 0; i < firstDay; i++) {
    daysList.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    daysList.push(d);
  }

  return {
    month: date.toLocaleString("en-US", { month: "long" }),
    year: y,
    days: daysList,
    today: date.getDate(),
    dayNames: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const,
  };
}

/** SSR-safe fallback date (February 2026) to avoid hydration mismatch */
const FALLBACK_DATE = new Date(2026, 1, 24); // Feb 24, 2026

export function CalendarWidget({
  config: _config,
}: {
  config: Record<string, unknown>;
}) {
  // SSR-safe: use fallback date initially, update to real date on client
  const [calendarData, setCalendarData] = useState(() =>
    computeCalendarData(FALLBACK_DATE)
  );

  useEffect(() => {
    setCalendarData(computeCalendarData(new Date()));
  }, []);

  const { month, year, days, today, dayNames } = calendarData;

  return (
    <div className="text-center">
      <div className="text-sm font-medium mb-2">
        {month} {year}
      </div>
      <div className="grid grid-cols-7 gap-0">
        {dayNames.map((d) => (
          <div
            key={d}
            className="text-[10px] text-muted-foreground font-medium py-1"
          >
            {d}
          </div>
        ))}
        {days.map((day, i) => (
          <div
            key={i}
            className={`text-xs py-1 ${
              day === today
                ? "font-bold bg-muted"
                : day
                  ? "text-foreground/70"
                  : ""
            }`}
          >
            {day || ""}
          </div>
        ))}
      </div>
    </div>
  );
}
