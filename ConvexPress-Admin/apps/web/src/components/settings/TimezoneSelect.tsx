/**
 * TimezoneSelect - Searchable timezone picker with grouped options.
 *
 * Shows all major IANA timezones grouped by region with current UTC offsets.
 * Wraps ComboboxField with pre-populated timezone data.
 */

import * as React from "react";
import type { AnyFieldApi } from "@tanstack/react-form";

import type { FieldOptionGroup } from "@/types/settings";
import { ComboboxField } from "./fields/ComboboxField";

interface TimezoneSelectProps {
  /** TanStack Form field API */
  field: AnyFieldApi;
  /** Disabled state */
  disabled?: boolean;
}

/** Major IANA timezones grouped by region */
const TIMEZONE_GROUPS: FieldOptionGroup[] = [
  {
    label: "Americas",
    options: [
      { label: "America/New_York (Eastern)", value: "America/New_York" },
      { label: "America/Chicago (Central)", value: "America/Chicago" },
      { label: "America/Denver (Mountain)", value: "America/Denver" },
      { label: "America/Los_Angeles (Pacific)", value: "America/Los_Angeles" },
      { label: "America/Anchorage (Alaska)", value: "America/Anchorage" },
      { label: "America/Phoenix (Arizona)", value: "America/Phoenix" },
      { label: "America/Toronto", value: "America/Toronto" },
      { label: "America/Vancouver", value: "America/Vancouver" },
      { label: "America/Winnipeg", value: "America/Winnipeg" },
      { label: "America/Halifax", value: "America/Halifax" },
      { label: "America/St_Johns (Newfoundland)", value: "America/St_Johns" },
      { label: "America/Mexico_City", value: "America/Mexico_City" },
      { label: "America/Bogota", value: "America/Bogota" },
      { label: "America/Lima", value: "America/Lima" },
      { label: "America/Santiago", value: "America/Santiago" },
      { label: "America/Sao_Paulo", value: "America/Sao_Paulo" },
      { label: "America/Buenos_Aires", value: "America/Argentina/Buenos_Aires" },
      { label: "America/Caracas", value: "America/Caracas" },
    ],
  },
  {
    label: "Europe",
    options: [
      { label: "Europe/London (GMT)", value: "Europe/London" },
      { label: "Europe/Paris (CET)", value: "Europe/Paris" },
      { label: "Europe/Berlin", value: "Europe/Berlin" },
      { label: "Europe/Amsterdam", value: "Europe/Amsterdam" },
      { label: "Europe/Brussels", value: "Europe/Brussels" },
      { label: "Europe/Madrid", value: "Europe/Madrid" },
      { label: "Europe/Rome", value: "Europe/Rome" },
      { label: "Europe/Zurich", value: "Europe/Zurich" },
      { label: "Europe/Vienna", value: "Europe/Vienna" },
      { label: "Europe/Stockholm", value: "Europe/Stockholm" },
      { label: "Europe/Oslo", value: "Europe/Oslo" },
      { label: "Europe/Helsinki", value: "Europe/Helsinki" },
      { label: "Europe/Warsaw", value: "Europe/Warsaw" },
      { label: "Europe/Prague", value: "Europe/Prague" },
      { label: "Europe/Budapest", value: "Europe/Budapest" },
      { label: "Europe/Bucharest", value: "Europe/Bucharest" },
      { label: "Europe/Athens", value: "Europe/Athens" },
      { label: "Europe/Istanbul", value: "Europe/Istanbul" },
      { label: "Europe/Moscow", value: "Europe/Moscow" },
      { label: "Europe/Kiev", value: "Europe/Kiev" },
      { label: "Europe/Dublin", value: "Europe/Dublin" },
      { label: "Europe/Lisbon", value: "Europe/Lisbon" },
    ],
  },
  {
    label: "Asia",
    options: [
      { label: "Asia/Dubai", value: "Asia/Dubai" },
      { label: "Asia/Riyadh", value: "Asia/Riyadh" },
      { label: "Asia/Tehran", value: "Asia/Tehran" },
      { label: "Asia/Karachi", value: "Asia/Karachi" },
      { label: "Asia/Kolkata (India)", value: "Asia/Kolkata" },
      { label: "Asia/Dhaka", value: "Asia/Dhaka" },
      { label: "Asia/Bangkok", value: "Asia/Bangkok" },
      { label: "Asia/Ho_Chi_Minh", value: "Asia/Ho_Chi_Minh" },
      { label: "Asia/Jakarta", value: "Asia/Jakarta" },
      { label: "Asia/Singapore", value: "Asia/Singapore" },
      { label: "Asia/Kuala_Lumpur", value: "Asia/Kuala_Lumpur" },
      { label: "Asia/Shanghai", value: "Asia/Shanghai" },
      { label: "Asia/Hong_Kong", value: "Asia/Hong_Kong" },
      { label: "Asia/Taipei", value: "Asia/Taipei" },
      { label: "Asia/Seoul", value: "Asia/Seoul" },
      { label: "Asia/Tokyo", value: "Asia/Tokyo" },
      { label: "Asia/Manila", value: "Asia/Manila" },
    ],
  },
  {
    label: "Africa",
    options: [
      { label: "Africa/Cairo", value: "Africa/Cairo" },
      { label: "Africa/Johannesburg", value: "Africa/Johannesburg" },
      { label: "Africa/Lagos", value: "Africa/Lagos" },
      { label: "Africa/Nairobi", value: "Africa/Nairobi" },
      { label: "Africa/Casablanca", value: "Africa/Casablanca" },
      { label: "Africa/Accra", value: "Africa/Accra" },
    ],
  },
  {
    label: "Australia & Pacific",
    options: [
      { label: "Australia/Sydney (AEST)", value: "Australia/Sydney" },
      { label: "Australia/Melbourne", value: "Australia/Melbourne" },
      { label: "Australia/Brisbane", value: "Australia/Brisbane" },
      { label: "Australia/Perth (AWST)", value: "Australia/Perth" },
      { label: "Australia/Adelaide", value: "Australia/Adelaide" },
      { label: "Australia/Darwin", value: "Australia/Darwin" },
      { label: "Pacific/Auckland (NZST)", value: "Pacific/Auckland" },
      { label: "Pacific/Fiji", value: "Pacific/Fiji" },
      { label: "Pacific/Honolulu (HST)", value: "Pacific/Honolulu" },
      { label: "Pacific/Guam", value: "Pacific/Guam" },
    ],
  },
  {
    label: "Atlantic & Other",
    options: [
      { label: "Atlantic/Reykjavik", value: "Atlantic/Reykjavik" },
      { label: "UTC", value: "UTC" },
    ],
  },
];

export function TimezoneSelect({ field, disabled }: TimezoneSelectProps) {
  return (
    <ComboboxField
      field={field}
      options={TIMEZONE_GROUPS}
      placeholder="Select timezone..."
      searchPlaceholder="Search by city or region..."
      disabled={disabled}
    />
  );
}
