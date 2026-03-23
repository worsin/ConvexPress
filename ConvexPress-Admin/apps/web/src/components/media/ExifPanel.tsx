/**
 * EXIF Data Panel
 *
 * Collapsible panel showing EXIF metadata from mediaMeta records.
 * Only renders for images that have EXIF data stored.
 */

import { useState } from "react";
import { ChevronDownIcon, ChevronRightIcon, MapPinIcon } from "lucide-react";

interface ExifPanelProps {
  /** Meta map from the media.get query (key -> value pairs). */
  metaMap: Record<string, string>;
}

/** Known EXIF meta key display labels.
 * Keys match what the backend stores in mediaMeta (see internals.ts EXIF_TAGS/GPS_TAGS).
 */
const EXIF_LABELS: Record<string, string> = {
  // Camera / device
  _exif_camera_make: "Camera Make",
  _exif_camera_model: "Camera Model",
  _exif_software: "Software",
  // Exposure
  _exif_exposure_time: "Exposure Time",
  _exif_f_number: "Aperture (f/)",
  _exif_iso_speed: "ISO",
  _exif_focal_length: "Focal Length",
  _exif_focal_length_35mm: "Focal Length (35mm)",
  _exif_flash: "Flash",
  // Image
  _exif_orientation: "Orientation",
  _exif_x_resolution: "X Resolution",
  _exif_y_resolution: "Y Resolution",
  _exif_resolution_unit: "Resolution Unit",
  _exif_color_space: "Color Space",
  _exif_pixel_x_dimension: "Pixel Width",
  _exif_pixel_y_dimension: "Pixel Height",
  _exif_ycbcr_positioning: "YCbCr Positioning",
  // Dates
  _exif_datetime: "Date/Time",
  _exif_date_original: "Date Original",
  _exif_date_digitized: "Date Digitized",
  // Version
  _exif_exif_version: "EXIF Version",
  // GPS
  _exif_gps_latitude: "GPS Latitude",
  _exif_gps_longitude: "GPS Longitude",
  _exif_gps_altitude: "GPS Altitude",
};

export function ExifPanel({ metaMap }: ExifPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Filter for EXIF keys only
  const exifEntries = Object.entries(metaMap).filter(([key]) =>
    key.startsWith("_exif_"),
  );

  if (exifEntries.length === 0) return null;

  const hasGps = metaMap._exif_gps_latitude && metaMap._exif_gps_longitude;
  const gpsUrl = hasGps
    ? `https://maps.google.com/?q=${metaMap._exif_gps_latitude},${metaMap._exif_gps_longitude}`
    : null;

  return (
    <div className="border border-border bg-card">
      {/* Header (clickable to expand/collapse) */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-muted/30 transition-colors"
      >
        <h3 className="text-sm font-semibold text-foreground">EXIF Data</h3>
        {isExpanded ? (
          <ChevronDownIcon className="size-4 text-muted-foreground" />
        ) : (
          <ChevronRightIcon className="size-4 text-muted-foreground" />
        )}
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-border pt-3">
          <dl className="space-y-2">
            {exifEntries.map(([key, value]) => {
              // Skip GPS coordinates from the list (shown separately with map link)
              if (key === "_exif_gps_latitude" || key === "_exif_gps_longitude")
                return null;

              const label = EXIF_LABELS[key] || key.replace("_exif_", "");
              let displayValue = value;

              // Parse keywords JSON array
              if (key === "_exif_keywords") {
                try {
                  const keywords = JSON.parse(value);
                  displayValue = Array.isArray(keywords)
                    ? keywords.join(", ")
                    : value;
                } catch {
                  displayValue = value;
                }
              }

              return (
                <div key={key} className="flex justify-between text-xs">
                  <dt className="text-muted-foreground">{label}:</dt>
                  <dd className="text-foreground font-medium text-right max-w-[60%] truncate">
                    {displayValue}
                  </dd>
                </div>
              );
            })}
          </dl>

          {/* GPS Map Link */}
          {gpsUrl && (
            <div className="mt-3 pt-3 border-t border-border">
              <a
                href={gpsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
              >
                <MapPinIcon className="size-3" />
                View on Map
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
