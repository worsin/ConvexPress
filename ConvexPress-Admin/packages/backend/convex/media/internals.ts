/**
 * Media System - Internal Functions
 *
 * Functions not callable by clients. Used for system-level processing:
 *   processImage       - Image processing (EXIF extraction, size registration, dimensions)
 *   processImageAction - Action that fetches the image blob, extracts metadata, then
 *                        calls mutations to create size records and update status
 *   cleanupExpiredMedia - Garbage collection of stuck/failed/orphaned media
 *   setMeta            - Internal mutation to set a mediaMeta key-value pair
 *   deleteMeta         - Internal mutation to delete all mediaMeta for a media item
 *
 * Image processing architecture:
 *   1. `create` mutation schedules `processImageAction` (an internalAction)
 *   2. The action fetches the blob from Convex storage
 *   3. Parses image dimensions from binary headers (PNG/JPEG/GIF/WebP/BMP)
 *   4. Extracts EXIF metadata from JPEG files (camera, exposure, GPS, etc.)
 *   5. Registers WordPress-standard size variants (thumbnail, medium, medium_large, large)
 *      Each size record stores the original storageId with target dimensions, since
 *      actual pixel resizing requires sharp (native addon not available in Convex runtime).
 *      The sizes are "registered" -- consumers use the width/height for responsive srcset
 *      and CSS sizing, while the URL points to the full-resolution original.
 *   6. Calls mutations to persist all metadata and transition status to "active"
 *
 * The processImage internalMutation is kept as a lightweight fallback that simply
 * marks the media as active (used for non-image types or if the action fails to schedule).
 */

import { v } from "convex/values";
import { internalMutation, internalAction, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";

// ─── EXIF Parsing Helpers (Pure JS, no native dependencies) ─────────────────

/**
 * Read a 16-bit unsigned integer from a DataView at the given offset.
 * Supports both big-endian and little-endian byte order.
 */
function readUint16(view: DataView, offset: number, littleEndian: boolean): number {
  return view.getUint16(offset, littleEndian);
}

/**
 * Read a 32-bit unsigned integer from a DataView at the given offset.
 */
function readUint32(view: DataView, offset: number, littleEndian: boolean): number {
  return view.getUint32(offset, littleEndian);
}

/**
 * Read a rational value (two 32-bit unsigned ints) as a decimal number.
 */
function readRational(view: DataView, offset: number, littleEndian: boolean): number {
  const numerator = readUint32(view, offset, littleEndian);
  const denominator = readUint32(view, offset + 4, littleEndian);
  return denominator === 0 ? 0 : numerator / denominator;
}

/**
 * Read a signed rational value (two 32-bit signed ints) as a decimal number.
 */
function readSignedRational(view: DataView, offset: number, littleEndian: boolean): number {
  const numerator = view.getInt32(offset, littleEndian);
  const denominator = view.getInt32(offset + 4, littleEndian);
  return denominator === 0 ? 0 : numerator / denominator;
}

/**
 * Read a null-terminated ASCII string from an ArrayBuffer.
 */
function readAsciiString(buffer: ArrayBuffer, offset: number, length: number): string {
  const bytes = new Uint8Array(buffer, offset, length);
  let str = "";
  for (let i = 0; i < length; i++) {
    if (bytes[i] === 0) break;
    str += String.fromCharCode(bytes[i]);
  }
  return str.trim();
}

/** EXIF tag IDs we care about */
const EXIF_TAGS: Record<number, string> = {
  0x010f: "camera_make",
  0x0110: "camera_model",
  0x0112: "orientation",
  0x011a: "x_resolution",
  0x011b: "y_resolution",
  0x0128: "resolution_unit",
  0x0131: "software",
  0x0132: "datetime",
  0x0213: "ycbcr_positioning",
  0x8769: "exif_ifd_pointer",    // Pointer to Exif sub-IFD
  0x8825: "gps_ifd_pointer",     // Pointer to GPS sub-IFD
  // Exif sub-IFD tags
  0x829a: "exposure_time",
  0x829d: "f_number",
  0x8827: "iso_speed",
  0x9000: "exif_version",
  0x9003: "date_original",
  0x9004: "date_digitized",
  0x9209: "flash",
  0x920a: "focal_length",
  0xa001: "color_space",
  0xa002: "pixel_x_dimension",
  0xa003: "pixel_y_dimension",
  0xa405: "focal_length_35mm",
};

/** GPS tag IDs */
const GPS_TAGS: Record<number, string> = {
  0x0001: "gps_latitude_ref",
  0x0002: "gps_latitude",
  0x0003: "gps_longitude_ref",
  0x0004: "gps_longitude",
  0x0005: "gps_altitude_ref",
  0x0006: "gps_altitude",
};

interface ExifData {
  [key: string]: string | number;
}

/**
 * Parse EXIF data from a JPEG file's ArrayBuffer.
 * Returns an object of key-value pairs for known EXIF fields.
 * Returns empty object if no EXIF data is found or parsing fails.
 */
function parseExifFromJpeg(buffer: ArrayBuffer): ExifData {
  const result: ExifData = {};

  try {
    const view = new DataView(buffer);
    const length = buffer.byteLength;

    // Verify JPEG SOI marker
    if (length < 2 || view.getUint8(0) !== 0xff || view.getUint8(1) !== 0xd8) {
      return result;
    }

    // Scan for APP1 marker (0xFFE1) containing EXIF
    let offset = 2;
    while (offset < length - 4) {
      const marker = view.getUint16(offset, false);
      if (marker === 0xffe1) {
        // Found APP1 segment
        const segmentLength = view.getUint16(offset + 2, false);

        // Check for "Exif\0\0" header
        const exifHeader = readAsciiString(buffer, offset + 4, 4);
        if (exifHeader !== "Exif") {
          // Not EXIF APP1, skip
          offset += 2 + segmentLength;
          continue;
        }

        // TIFF header starts at offset + 10 (after marker + length + "Exif\0\0")
        const tiffStart = offset + 10;
        if (tiffStart + 8 > length) return result;

        // Determine byte order
        const byteOrder = view.getUint16(tiffStart, false);
        const littleEndian = byteOrder === 0x4949; // "II" = Intel = little-endian
        if (byteOrder !== 0x4949 && byteOrder !== 0x4d4d) return result;

        // Verify TIFF magic number (42)
        if (readUint16(view, tiffStart + 2, littleEndian) !== 42) return result;

        // Get offset to first IFD (relative to TIFF header)
        const ifd0Offset = readUint32(view, tiffStart + 4, littleEndian);

        // Parse IFD0 (main image tags)
        let exifIfdOffset: number | null = null;
        let gpsIfdOffset: number | null = null;
        parseIfd(view, buffer, tiffStart, ifd0Offset, littleEndian, EXIF_TAGS, result, length,
          (tag, value) => {
            if (tag === 0x8769) exifIfdOffset = value as number;
            if (tag === 0x8825) gpsIfdOffset = value as number;
          });

        // Parse Exif sub-IFD if present
        if (exifIfdOffset !== null) {
          parseIfd(view, buffer, tiffStart, exifIfdOffset, littleEndian, EXIF_TAGS, result, length);
        }

        // Parse GPS sub-IFD if present
        if (gpsIfdOffset !== null) {
          parseGpsIfd(view, buffer, tiffStart, gpsIfdOffset, littleEndian, result, length);
        }

        break; // Done with EXIF
      } else if ((marker & 0xff00) === 0xff00) {
        // Other JPEG marker, skip
        if (offset + 3 >= length) break;
        const segLen = view.getUint16(offset + 2, false);
        offset += 2 + segLen;
      } else {
        break; // Not a valid marker, stop scanning
      }
    }
  } catch {
    // EXIF parsing is best-effort -- return whatever we got
  }

  return result;
}

/**
 * Parse an IFD (Image File Directory) and extract known tags.
 */
function parseIfd(
  view: DataView,
  buffer: ArrayBuffer,
  tiffStart: number,
  ifdOffset: number,
  littleEndian: boolean,
  tagMap: Record<number, string>,
  result: ExifData,
  bufferLength: number,
  onSpecialTag?: (tag: number, value: number) => void,
): void {
  const absOffset = tiffStart + ifdOffset;
  if (absOffset + 2 > bufferLength) return;

  const entryCount = readUint16(view, absOffset, littleEndian);
  if (absOffset + 2 + entryCount * 12 > bufferLength) return;

  for (let i = 0; i < entryCount; i++) {
    const entryOffset = absOffset + 2 + i * 12;
    const tag = readUint16(view, entryOffset, littleEndian);
    const type = readUint16(view, entryOffset + 2, littleEndian);
    const count = readUint32(view, entryOffset + 4, littleEndian);
    const valueOffset = entryOffset + 8;

    const tagName = tagMap[tag];

    // Handle IFD pointer tags
    if (tag === 0x8769 || tag === 0x8825) {
      const ptrValue = readUint32(view, valueOffset, littleEndian);
      if (onSpecialTag) onSpecialTag(tag, ptrValue);
      continue;
    }

    if (!tagName) continue;

    try {
      const value = readTagValue(view, buffer, tiffStart, type, count, valueOffset, littleEndian, bufferLength);
      if (value !== null && value !== undefined) {
        result[`_exif_${tagName}`] = value;
      }
    } catch {
      // Skip unreadable tags
    }
  }
}

/**
 * Parse a GPS IFD and extract latitude/longitude as decimal degrees.
 */
function parseGpsIfd(
  view: DataView,
  buffer: ArrayBuffer,
  tiffStart: number,
  ifdOffset: number,
  littleEndian: boolean,
  result: ExifData,
  bufferLength: number,
): void {
  const absOffset = tiffStart + ifdOffset;
  if (absOffset + 2 > bufferLength) return;

  const entryCount = readUint16(view, absOffset, littleEndian);
  if (absOffset + 2 + entryCount * 12 > bufferLength) return;

  let latRef = "";
  let lonRef = "";
  let latDeg = 0, latMin = 0, latSec = 0;
  let lonDeg = 0, lonMin = 0, lonSec = 0;
  let altRef = 0;
  let altitude = 0;
  let hasLat = false, hasLon = false, hasAlt = false;

  for (let i = 0; i < entryCount; i++) {
    const entryOffset = absOffset + 2 + i * 12;
    const tag = readUint16(view, entryOffset, littleEndian);
    const type = readUint16(view, entryOffset + 2, littleEndian);
    const count = readUint32(view, entryOffset + 4, littleEndian);
    const valueOffset = entryOffset + 8;

    try {
      switch (tag) {
        case 0x0001: // GPSLatitudeRef
          latRef = readAsciiString(buffer, valueOffset, Math.min(count, 2));
          break;
        case 0x0002: // GPSLatitude (3 rationals)
          if (type === 5 && count === 3) {
            const dataOffset = tiffStart + readUint32(view, valueOffset, littleEndian);
            if (dataOffset + 24 <= bufferLength) {
              latDeg = readRational(view, dataOffset, littleEndian);
              latMin = readRational(view, dataOffset + 8, littleEndian);
              latSec = readRational(view, dataOffset + 16, littleEndian);
              hasLat = true;
            }
          }
          break;
        case 0x0003: // GPSLongitudeRef
          lonRef = readAsciiString(buffer, valueOffset, Math.min(count, 2));
          break;
        case 0x0004: // GPSLongitude (3 rationals)
          if (type === 5 && count === 3) {
            const dataOffset = tiffStart + readUint32(view, valueOffset, littleEndian);
            if (dataOffset + 24 <= bufferLength) {
              lonDeg = readRational(view, dataOffset, littleEndian);
              lonMin = readRational(view, dataOffset + 8, littleEndian);
              lonSec = readRational(view, dataOffset + 16, littleEndian);
              hasLon = true;
            }
          }
          break;
        case 0x0005: // GPSAltitudeRef
          altRef = view.getUint8(valueOffset);
          break;
        case 0x0006: // GPSAltitude (1 rational)
          if (type === 5 && count === 1) {
            const dataOffset = tiffStart + readUint32(view, valueOffset, littleEndian);
            if (dataOffset + 8 <= bufferLength) {
              altitude = readRational(view, dataOffset, littleEndian);
              hasAlt = true;
            }
          }
          break;
      }
    } catch {
      // Skip unreadable GPS tags
    }
  }

  // Convert DMS to decimal degrees
  if (hasLat) {
    let lat = latDeg + latMin / 60 + latSec / 3600;
    if (latRef === "S") lat = -lat;
    result["_exif_gps_latitude"] = Math.round(lat * 1000000) / 1000000;
  }
  if (hasLon) {
    let lon = lonDeg + lonMin / 60 + lonSec / 3600;
    if (lonRef === "W") lon = -lon;
    result["_exif_gps_longitude"] = Math.round(lon * 1000000) / 1000000;
  }
  if (hasAlt) {
    result["_exif_gps_altitude"] = altRef === 1 ? -altitude : altitude;
  }
}

/**
 * Read a single EXIF tag value based on its type.
 */
function readTagValue(
  view: DataView,
  buffer: ArrayBuffer,
  tiffStart: number,
  type: number,
  count: number,
  valueOffset: number,
  littleEndian: boolean,
  bufferLength: number,
): string | number | null {
  // Types: 1=BYTE, 2=ASCII, 3=SHORT, 4=LONG, 5=RATIONAL, 7=UNDEFINED,
  //        9=SLONG, 10=SRATIONAL

  const valueSize = getTypeSize(type) * count;
  let dataOffset = valueOffset;

  // If value is larger than 4 bytes, the valueOffset field contains
  // a pointer to the actual data (relative to TIFF header)
  if (valueSize > 4) {
    dataOffset = tiffStart + readUint32(view, valueOffset, littleEndian);
    if (dataOffset + valueSize > bufferLength) return null;
  }

  switch (type) {
    case 1: // BYTE
      return view.getUint8(dataOffset);
    case 2: // ASCII
      return readAsciiString(buffer, dataOffset, count);
    case 3: // SHORT
      return readUint16(view, dataOffset, littleEndian);
    case 4: // LONG
      return readUint32(view, dataOffset, littleEndian);
    case 5: // RATIONAL
      return Math.round(readRational(view, dataOffset, littleEndian) * 10000) / 10000;
    case 7: // UNDEFINED (often version strings)
      if (count <= 4) {
        return readAsciiString(buffer, dataOffset, count);
      }
      return readAsciiString(buffer, dataOffset, Math.min(count, 32));
    case 9: // SLONG
      return view.getInt32(dataOffset, littleEndian);
    case 10: // SRATIONAL
      return Math.round(readSignedRational(view, dataOffset, littleEndian) * 10000) / 10000;
    default:
      return null;
  }
}

/** Get the byte size of an EXIF data type */
function getTypeSize(type: number): number {
  switch (type) {
    case 1: return 1;  // BYTE
    case 2: return 1;  // ASCII
    case 3: return 2;  // SHORT
    case 4: return 4;  // LONG
    case 5: return 8;  // RATIONAL
    case 7: return 1;  // UNDEFINED
    case 8: return 2;  // SSHORT
    case 9: return 4;  // SLONG
    case 10: return 8; // SRATIONAL
    default: return 1;
  }
}

// ─── Image Dimension Parsing (Pure JS, binary header parsing) ───────────────

interface ImageDimensions {
  width: number;
  height: number;
}

/**
 * Parse image dimensions from binary headers.
 * Supports JPEG, PNG, GIF, WebP, and BMP.
 * Returns null if the format is unrecognized or the header is malformed.
 */
function parseImageDimensions(buffer: ArrayBuffer, mimeType: string): ImageDimensions | null {
  const view = new DataView(buffer);
  const length = buffer.byteLength;

  try {
    // PNG: first 8 bytes are signature, IHDR chunk starts at byte 8
    if (mimeType === "image/png" && length >= 24) {
      const sig = view.getUint8(0) === 0x89 && view.getUint8(1) === 0x50;
      if (sig) {
        return {
          width: view.getUint32(16, false),
          height: view.getUint32(20, false),
        };
      }
    }

    // GIF: "GIF87a" or "GIF89a", dimensions at bytes 6-9 (little-endian)
    if (mimeType === "image/gif" && length >= 10) {
      const g = view.getUint8(0) === 0x47; // 'G'
      if (g) {
        return {
          width: view.getUint16(6, true),
          height: view.getUint16(8, true),
        };
      }
    }

    // BMP: "BM" header, dimensions at bytes 18-25
    if (mimeType === "image/bmp" && length >= 26) {
      const b = view.getUint8(0) === 0x42 && view.getUint8(1) === 0x4d;
      if (b) {
        return {
          width: view.getInt32(18, true),
          height: Math.abs(view.getInt32(22, true)),
        };
      }
    }

    // WebP: "RIFF....WEBP" header
    if (mimeType === "image/webp" && length >= 30) {
      // Check RIFF header
      const riff =
        view.getUint8(0) === 0x52 && // R
        view.getUint8(1) === 0x49 && // I
        view.getUint8(2) === 0x46 && // F
        view.getUint8(3) === 0x46;   // F
      if (riff) {
        // Check for VP8 (lossy), VP8L (lossless), or VP8X (extended)
        const chunk = readAsciiString(buffer, 12, 4);
        if (chunk === "VP8 " && length >= 30) {
          // Lossy: dimensions at bytes 26-29
          return {
            width: view.getUint16(26, true) & 0x3fff,
            height: view.getUint16(28, true) & 0x3fff,
          };
        }
        if (chunk === "VP8L" && length >= 25) {
          // Lossless: packed into 4 bytes at offset 21
          const bits = view.getUint32(21, true);
          return {
            width: (bits & 0x3fff) + 1,
            height: ((bits >> 14) & 0x3fff) + 1,
          };
        }
        if (chunk === "VP8X" && length >= 30) {
          // Extended: canvas size at bytes 24-29
          const w = (view.getUint8(24) | (view.getUint8(25) << 8) | (view.getUint8(26) << 16)) + 1;
          const h = (view.getUint8(27) | (view.getUint8(28) << 8) | (view.getUint8(29) << 16)) + 1;
          return { width: w, height: h };
        }
      }
    }

    // JPEG: scan for SOF0/SOF2 markers
    if ((mimeType === "image/jpeg" || mimeType === "image/jpg") && length >= 2) {
      if (view.getUint8(0) !== 0xff || view.getUint8(1) !== 0xd8) return null;

      let offset = 2;
      while (offset < length - 9) {
        if (view.getUint8(offset) !== 0xff) {
          offset++;
          continue;
        }

        const marker = view.getUint8(offset + 1);

        // SOF markers (Start of Frame) contain image dimensions
        // SOF0 = 0xC0 (baseline), SOF2 = 0xC2 (progressive)
        if (
          marker === 0xc0 || marker === 0xc1 || marker === 0xc2 || marker === 0xc3 ||
          marker === 0xc5 || marker === 0xc6 || marker === 0xc7 ||
          marker === 0xc9 || marker === 0xca || marker === 0xcb ||
          marker === 0xcd || marker === 0xce || marker === 0xcf
        ) {
          if (offset + 9 <= length) {
            return {
              height: view.getUint16(offset + 5, false),
              width: view.getUint16(offset + 7, false),
            };
          }
        }

        // Skip to next marker
        if (marker === 0xd9) break; // EOI
        if (marker === 0xda) break; // SOS - start of scan data, no more metadata
        if (offset + 3 >= length) break;

        const segmentLen = view.getUint16(offset + 2, false);
        offset += 2 + segmentLen;
      }
    }
  } catch {
    // Dimension parsing is best-effort
  }

  return null;
}

// ─── WordPress-Standard Size Definitions ────────────────────────────────────

interface SizeConfig {
  name: string;
  maxWidth: number;
  maxHeight: number | null; // null = proportional
  crop: boolean;
}

/**
 * Default WordPress-standard size definitions.
 * These are used as fallback when no Settings System "media" section exists.
 * When settings are available, the sizes are built from stored configuration.
 */
const DEFAULT_WORDPRESS_SIZES: SizeConfig[] = [
  { name: "thumbnail", maxWidth: 150, maxHeight: 150, crop: true },
  { name: "medium", maxWidth: 300, maxHeight: null, crop: false },
  { name: "medium_large", maxWidth: 768, maxHeight: null, crop: false },
  { name: "large", maxWidth: 1024, maxHeight: null, crop: false },
];

/**
 * Internal query to read media size configuration from the Settings System.
 * Returns the SizeConfig[] array built from stored settings, or the defaults.
 */
export const getImageSizeConfig = internalQuery({
  args: {},
  handler: async (ctx): Promise<SizeConfig[]> => {
    try {
      const doc = await ctx.db
        .query("settings")
        .withIndex("by_section", (q) => q.eq("section", "media"))
        .unique();

      if (doc && doc.values && typeof doc.values === "object") {
        const s = doc.values as Record<string, unknown>;
        return [
          {
            name: "thumbnail",
            maxWidth: typeof s.thumbnailWidth === "number" ? s.thumbnailWidth : 150,
            maxHeight: typeof s.thumbnailHeight === "number" ? s.thumbnailHeight : 150,
            crop: typeof s.thumbnailCrop === "boolean" ? s.thumbnailCrop : true,
          },
          {
            name: "medium",
            maxWidth: typeof s.mediumWidth === "number" ? s.mediumWidth : 300,
            maxHeight: typeof s.mediumMaxHeight === "number" && s.mediumMaxHeight > 0
              ? s.mediumMaxHeight : null,
            crop: false,
          },
          {
            name: "medium_large",
            maxWidth: typeof s.mediumLargeWidth === "number" ? s.mediumLargeWidth : 768,
            maxHeight: typeof s.mediumLargeMaxHeight === "number" && s.mediumLargeMaxHeight > 0
              ? s.mediumLargeMaxHeight : null,
            crop: false,
          },
          {
            name: "large",
            maxWidth: typeof s.largeWidth === "number" ? s.largeWidth : 1024,
            maxHeight: typeof s.largeMaxHeight === "number" && s.largeMaxHeight > 0
              ? s.largeMaxHeight : null,
            crop: false,
          },
        ];
      }
    } catch {
      // Settings section doesn't exist yet - use defaults
    }

    return DEFAULT_WORDPRESS_SIZES;
  },
});

/**
 * Calculate the target dimensions for a given size configuration.
 * Returns null if the image is smaller than the target (no upscaling).
 */
function calculateTargetDimensions(
  originalWidth: number,
  originalHeight: number,
  config: SizeConfig,
): { width: number; height: number } | null {
  if (config.crop && config.maxHeight !== null) {
    // Hard crop: use exact dimensions (but don't upscale)
    if (originalWidth < config.maxWidth && originalHeight < config.maxHeight) {
      return null; // Image is smaller than target, skip
    }
    return {
      width: Math.min(originalWidth, config.maxWidth),
      height: Math.min(originalHeight, config.maxHeight),
    };
  }

  // Proportional resize: scale down to maxWidth, maintaining aspect ratio
  if (originalWidth <= config.maxWidth) {
    return null; // Image is already smaller than this size
  }

  const ratio = config.maxWidth / originalWidth;
  return {
    width: config.maxWidth,
    height: Math.round(originalHeight * ratio),
  };
}

// ─── Internal Get Media Query ────────────────────────────────────────────────

/**
 * Get a media record with its metadata, without requiring auth.
 * Internal-only: used by processImageAction (which runs without user context).
 */
export const getMediaInternal = internalQuery({
  args: {
    mediaId: v.id("media"),
  },
  handler: async (ctx, args) => {
    const media = await ctx.db.get("media", args.mediaId);
    if (!media) return null;

    // Fetch metadata
    const meta = await ctx.db
      .query("mediaMeta")
      .withIndex("by_media", (q) => q.eq("mediaId", args.mediaId))
      .collect();

    // Build meta map
    const metaMap: Record<string, string> = {};
    for (const m of meta) {
      metaMap[m.key] = m.value;
    }

    // Resolve fresh URL
    const freshUrl = await ctx.storage.getUrl(media.storageId);

    return {
      ...media,
      url: freshUrl ?? media.url,
      metaMap,
    };
  },
});

// ─── Internal List Query (for HTTP API) ──────────────────────────────────────

/**
 * List media items without requiring auth context.
 * Internal-only: used by HTTP API handlers that authenticate via API key.
 */
export const getMediaInternal_list = internalQuery({
  args: {
    mediaType: v.optional(v.union(
      v.literal("image"),
      v.literal("video"),
      v.literal("audio"),
      v.literal("document"),
      v.literal("archive"),
      v.literal("other"),
    )),
    search: v.optional(v.string()),
    numItems: v.number(),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    let items;

    if (args.search && args.search.trim().length > 0) {
      // Search path
      let searchQuery = ctx.db
        .query("media")
        .withSearchIndex("search_media", (q) => {
          let sq = q.search("title", args.search!);
          if (args.mediaType) {
            sq = sq.eq("mediaType", args.mediaType);
          }
          return sq;
        });

      const allResults = await searchQuery.collect();
      const cursorIndex = args.cursor ? parseInt(args.cursor, 10) : 0;
      items = allResults.slice(cursorIndex, cursorIndex + args.numItems);

      return {
        items,
        total: allResults.length,
      };
    }

    // Filtered path
    if (args.mediaType) {
      items = await ctx.db
        .query("media")
        .withIndex("by_type_created", (q) => q.eq("mediaType", args.mediaType!))
        .order("desc")
        .take(args.numItems);
    } else {
      items = await ctx.db
        .query("media")
        .withIndex("by_created")
        .order("desc")
        .take(args.numItems);
    }

    return {
      items,
      total: items.length,
    };
  },
});

// ─── Internal Delete (for HTTP API) ──────────────────────────────────────────

/**
 * Delete a media item without requiring auth context.
 * Internal-only: used by HTTP API handlers that authenticate via API key.
 */
export const deleteMediaInternal = internalMutation({
  args: {
    mediaId: v.id("media"),
  },
  handler: async (ctx, args) => {
    const media = await ctx.db.get("media", args.mediaId);
    if (!media) return;

    // Delete original storage file
    try {
      await ctx.storage.delete(media.storageId);
    } catch {
      // Orphaned storage file
    }

    // Delete all generated sizes and their storage files
    const sizes = await ctx.db
      .query("mediaSizes")
      .withIndex("by_media", (q) => q.eq("mediaId", args.mediaId))
      .collect();

    for (const size of sizes) {
      if (size.storageId !== media.storageId) {
        try {
          await ctx.storage.delete(size.storageId);
        } catch {
          // Orphaned
        }
      }
      await ctx.db.delete("mediaSizes", size._id);
    }

    // Delete all mediaMeta records
    const metaRecords = await ctx.db
      .query("mediaMeta")
      .withIndex("by_media", (q) => q.eq("mediaId", args.mediaId))
      .collect();

    for (const meta of metaRecords) {
      await ctx.db.delete("mediaMeta", meta._id);
    }

    // Clear featuredImageId from posts/pages referencing this media
    const postsWithFeatured = await ctx.db
      .query("posts")
      .filter((q) => q.eq(q.field("featuredImageId"), args.mediaId))
      .collect();

    for (const post of postsWithFeatured) {
      await ctx.db.patch("posts", post._id, {
        featuredImageId: undefined,
        updatedAt: Date.now(),
      });
    }

    // Emit media.deleted event (LOW #21 fix)
    const { emitEvent } = await import("../helpers/events");
    const { MEDIA_EVENTS, SYSTEM } = await import("../events/constants");

    await emitEvent(ctx, MEDIA_EVENTS.DELETED, SYSTEM.MEDIA, {
      mediaId: args.mediaId,
      fileName: media.fileName,
      mediaType: media.mediaType,
      fileSize: media.fileSize,
    });

    // Delete the media record itself
    await ctx.db.delete("media", args.mediaId);
  },
});

// ─── Check Media Edit Capability ─────────────────────────────────────────────

/**
 * Verify the current user has permission to edit a media item.
 * Internal mutation callable from actions to enforce capability checks.
 *
 * Checks:
 *   1. User is authenticated and has `media.update` capability
 *   2. User owns the media OR has Editor-level role (80+)
 *
 * Returns the user's identifier on success. Throws on failure.
 */
export const checkEditCapability = internalMutation({
  args: {
    mediaId: v.id("media"),
  },
  handler: async (ctx, args) => {
    const { requireCan } = await import("../helpers/permissions");
    const { checkMediaCapability } = await import("./mediaAuth");

    const user = await requireCan(ctx, "media.update");

    const media = await ctx.db.get("media", args.mediaId);
    if (!media) {
      throw new (await import("convex/values")).ConvexError({
        code: "NOT_FOUND",
        message: "Media item not found",
      });
    }

    await checkMediaCapability(ctx, user, media, "edit");

    const { getUserIdentifier } = await import("../helpers/permissions");
    return { workosUserId: getUserIdentifier(user), userId: user._id };
  },
});

// ─── Emit Media Edited Event (M10) ──────────────────────────────────────────

/**
 * Emit a media.updated event for image editing operations.
 * Internal-only: called by image editing actions (crop, rotate, flip, scale, revert)
 * instead of using the workaround of calling the public update mutation with
 * unchanged data just to trigger an event.
 */
export const emitMediaEditedEvent = internalMutation({
  args: {
    mediaId: v.id("media"),
    editAction: v.string(),
    changes: v.optional(v.array(v.object({
      field: v.string(),
      oldValue: v.any(),
      newValue: v.any(),
    }))),
  },
  handler: async (ctx, args) => {
    // Import lazily to avoid circular deps
    const { emitEvent } = await import("../helpers/events");
    const { MEDIA_EVENTS, SYSTEM } = await import("../events/constants");

    await emitEvent(ctx, MEDIA_EVENTS.UPDATED, SYSTEM.MEDIA, {
      mediaId: args.mediaId,
      editAction: args.editAction,
      changes: args.changes ?? [{ field: "imageEdit", oldValue: null, newValue: args.editAction }],
    });
  },
});

// ─── Process Image Action ───────────────────────────────────────────────────

/**
 * Process a newly uploaded image: extract dimensions, EXIF data, register size variants.
 *
 * This is an internalAction because it needs to:
 *   1. Fetch the image blob from Convex storage (requires action context)
 *   2. Parse binary data (ArrayBuffer operations)
 *   3. Call mutations to create size records and metadata
 *
 * Called via scheduler from the create mutation.
 */
export const processImageAction = internalAction({
  args: {
    mediaId: v.id("media"),
  },
  handler: async (ctx, args) => {
    // Fetch the media record using the internal (no-auth) query
    const media = await ctx.runQuery(internal.media.internals.getMediaInternal, {
      mediaId: args.mediaId,
    });

    if (!media) {
      // Media was deleted before processing. Nothing to do.
      return;
    }

    // Only process images in "processing" status
    if (media.status !== "processing" || media.mediaType !== "image") {
      return;
    }

    try {
      // ── 1. Fetch the original image blob ────────────────────────────────
      const blob = await ctx.storage.get(media.storageId);
      if (!blob) {
        await ctx.runMutation(internal.media.mutations.updateStatus, {
          mediaId: args.mediaId,
          status: "failed",
          processingError: "Original file not found in Convex storage",
        });
        return;
      }

      const buffer = await blob.arrayBuffer();

      // ── 2. Parse image dimensions ───────────────────────────────────────
      const dimensions = parseImageDimensions(buffer, media.mimeType);
      let imageWidth = media.width ?? 0;
      let imageHeight = media.height ?? 0;

      if (dimensions) {
        imageWidth = dimensions.width;
        imageHeight = dimensions.height;
      }

      // Update the media record with parsed dimensions if they were missing
      if (imageWidth > 0 && imageHeight > 0 && (!media.width || !media.height)) {
        await ctx.runMutation(internal.media.internals.updateDimensions, {
          mediaId: args.mediaId,
          width: imageWidth,
          height: imageHeight,
        });
      }

      // ── 3. Extract EXIF metadata (JPEG only) ───────────────────────────
      if (media.mimeType === "image/jpeg" || media.mimeType === "image/jpg") {
        const exifData = parseExifFromJpeg(buffer);
        const exifKeys = Object.keys(exifData);

        if (exifKeys.length > 0) {
          // Store each EXIF field as a separate mediaMeta record
          for (const key of exifKeys) {
            await ctx.runMutation(internal.media.internals.setMeta, {
              mediaId: args.mediaId,
              key,
              value: String(exifData[key]),
            });
          }
        }
      }

      // Store basic image info as meta regardless of format
      await ctx.runMutation(internal.media.internals.setMeta, {
        mediaId: args.mediaId,
        key: "_image_width",
        value: String(imageWidth),
      });
      await ctx.runMutation(internal.media.internals.setMeta, {
        mediaId: args.mediaId,
        key: "_image_height",
        value: String(imageHeight),
      });
      await ctx.runMutation(internal.media.internals.setMeta, {
        mediaId: args.mediaId,
        key: "_file_size",
        value: String(media.fileSize),
      });

      // ── 4. Register WordPress-standard size variants ────────────────────
      // Read configurable image sizes from the Settings System (#18).
      // Falls back to defaults if no "media" settings section exists yet.
      //
      // Since sharp is not available in the Convex runtime, we register sizes
      // with the target dimensions but pointing to the original file URL.
      // This allows consumers to use responsive srcset with correct width
      // descriptors. The original full-resolution image serves all sizes --
      // browsers handle downscaling efficiently via CSS and srcset.
      //
      // When sharp becomes available (via Convex Node.js action runtime or
      // external processing), these records will be updated with actual
      // resized storage entries.

      if (imageWidth > 0 && imageHeight > 0) {
        const url = media.url;
        const storageId = media.storageId;

        // Read configurable sizes from Settings System (or defaults)
        const imageSizes = await ctx.runQuery(
          internal.media.internals.getImageSizeConfig,
          {},
        );

        for (const sizeConfig of imageSizes) {
          const target = calculateTargetDimensions(imageWidth, imageHeight, sizeConfig);
          if (!target) continue; // Image is smaller than this size

          await ctx.runMutation(internal.media.mutations.addSize, {
            mediaId: args.mediaId,
            sizeName: sizeConfig.name,
            storageId: storageId,
            url: url,
            width: target.width,
            height: target.height,
            fileSize: media.fileSize, // Same file, actual resized file would be smaller
            mimeType: media.mimeType,
            crop: sizeConfig.crop,
          });
        }
      }

      // ── 5. Mark as active ───────────────────────────────────────────────
      await ctx.runMutation(internal.media.mutations.updateStatus, {
        mediaId: args.mediaId,
        status: "active",
      });
    } catch (error: unknown) {
      // Processing failed -- mark with error so the UI can show a warning
      await ctx.runMutation(internal.media.mutations.updateStatus, {
        mediaId: args.mediaId,
        status: "failed",
        processingError: error instanceof Error ? error.message : "Unknown processing error",
      });
    }
  },
});

// ─── Process Image (Mutation Fallback) ──────────────────────────────────────

/**
 * Lightweight fallback: simply transitions media from "processing" to "active".
 *
 * This is kept as a safety net. The primary processing path is processImageAction.
 * This mutation is also used for non-image types that accidentally end up in
 * "processing" status.
 */
export const processImage = internalMutation({
  args: {
    mediaId: v.id("media"),
  },
  handler: async (ctx, args) => {
    const media = await ctx.db.get("media", args.mediaId);
    if (!media) return;

    if (media.status !== "processing") return;

    if (media.mediaType !== "image") {
      await ctx.db.patch("media", args.mediaId, {
        status: "active" as const,
        updatedAt: Date.now(),
      });
      return;
    }

    // For images, schedule the full action-based processing
    await ctx.scheduler.runAfter(0, internal.media.internals.processImageAction, {
      mediaId: args.mediaId,
    });
  },
});

// ─── Set Meta ───────────────────────────────────────────────────────────────

/**
 * Set a mediaMeta key-value pair. Creates or updates the record.
 * Internal-only: called by processImageAction and image editing actions.
 */
export const setMeta = internalMutation({
  args: {
    mediaId: v.id("media"),
    key: v.string(),
    value: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if this key already exists for this media
    const existing = await ctx.db
      .query("mediaMeta")
      .withIndex("by_media_key", (q) =>
        q.eq("mediaId", args.mediaId).eq("key", args.key),
      )
      .unique();

    if (existing) {
      await ctx.db.patch("mediaMeta", existing._id, { value: args.value });
    } else {
      await ctx.db.insert("mediaMeta", {
        mediaId: args.mediaId,
        key: args.key,
        value: args.value,
      });
    }
  },
});

// ─── Delete Meta ────────────────────────────────────────────────────────────

/**
 * Delete a specific mediaMeta key for a media item.
 * Internal-only: used by image editing revert.
 */
export const deleteMeta = internalMutation({
  args: {
    mediaId: v.id("media"),
    key: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("mediaMeta")
      .withIndex("by_media_key", (q) =>
        q.eq("mediaId", args.mediaId).eq("key", args.key),
      )
      .unique();

    if (existing) {
      await ctx.db.delete("mediaMeta", existing._id);
    }
  },
});

// ─── Update Dimensions ─────────────────────────────────────────────────────

/**
 * Update the width/height on a media record after parsing from binary headers.
 * Internal-only: called by processImageAction.
 */
export const updateDimensions = internalMutation({
  args: {
    mediaId: v.id("media"),
    width: v.number(),
    height: v.number(),
  },
  handler: async (ctx, args) => {
    const media = await ctx.db.get("media", args.mediaId);
    if (!media) return;

    await ctx.db.patch("media", args.mediaId, {
      width: args.width,
      height: args.height,
      updatedAt: Date.now(),
    });
  },
});

// ─── Update Storage Id ──────────────────────────────────────────────────────

/**
 * Update the storageId and URL on a media record after image editing.
 * Internal-only: called by image editing actions.
 */
export const updateStorageId = internalMutation({
  args: {
    mediaId: v.id("media"),
    storageId: v.id("_storage"),
    url: v.string(),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const media = await ctx.db.get("media", args.mediaId);
    if (!media) return;

    const patch: Record<string, unknown> = {
      storageId: args.storageId,
      url: args.url,
      updatedAt: Date.now(),
    };
    if (args.width !== undefined) patch.width = args.width;
    if (args.height !== undefined) patch.height = args.height;

    await ctx.db.patch("media", args.mediaId, patch);
  },
});

// ─── Delete All Sizes ───────────────────────────────────────────────────────

/**
 * Delete all size records for a media item (used before regenerating sizes).
 * Does NOT delete storage files (the action handles that).
 */
export const deleteAllSizes = internalMutation({
  args: {
    mediaId: v.id("media"),
  },
  handler: async (ctx, args) => {
    const sizes = await ctx.db
      .query("mediaSizes")
      .withIndex("by_media", (q) => q.eq("mediaId", args.mediaId))
      .collect();

    for (const size of sizes) {
      await ctx.db.delete("mediaSizes", size._id);
    }

    return sizes.length;
  },
});

// ─── Schedule Reprocess ─────────────────────────────────────────────────────

/**
 * Schedule reprocessing of a media item (used after revert to regenerate sizes).
 * Sets status back to "processing" and schedules the processImageAction.
 */
export const scheduleReprocess = internalMutation({
  args: {
    mediaId: v.id("media"),
  },
  handler: async (ctx, args) => {
    const media = await ctx.db.get("media", args.mediaId);
    if (!media) return;

    // Set status to processing so the action can pick it up
    await ctx.db.patch("media", args.mediaId, {
      status: "processing" as const,
      processingError: undefined,
      updatedAt: Date.now(),
    });

    // Schedule the processing action
    await ctx.scheduler.runAfter(0, internal.media.internals.processImageAction, {
      mediaId: args.mediaId,
    });
  },
});

// ─── Cleanup Expired Media ──────────────────────────────────────────────────

/**
 * Garbage collect stuck and failed media items.
 *
 * Phase 1: Mark stuck "processing" items as "failed" (older than 2 hours)
 * Phase 2: Permanently delete "failed" items older than 30 days
 *          (removes storage files, size records, meta records, and the media record)
 *
 * Designed to be called via a daily cron job. Processes in batches to
 * avoid exceeding Convex mutation time limits.
 */
export const cleanupExpiredMedia = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let cleaned = 0;
    let markedFailed = 0;

    // ── Phase 1: Mark stuck "processing" items as failed ────────────────
    const stuckThreshold = now - 2 * 60 * 60 * 1000; // 2 hours

    const processingItems = await ctx.db
      .query("media")
      .withIndex("by_status", (q) => q.eq("status", "processing"))
      .take(200);

    for (const item of processingItems) {
      if (item.createdAt < stuckThreshold) {
        await ctx.db.patch("media", item._id, {
          status: "failed" as const,
          processingError: "Processing timed out after 2 hours",
          updatedAt: now,
        });
        markedFailed++;
      }
      // Safety: limit batch size
      if (markedFailed >= 50) break;
    }

    // ── Phase 2: Delete old "failed" items ──────────────────────────────
    const failedThreshold = now - 30 * 24 * 60 * 60 * 1000; // 30 days

    const failedItems = await ctx.db
      .query("media")
      .withIndex("by_status", (q) => q.eq("status", "failed"))
      .take(200);

    for (const item of failedItems) {
      if (item.createdAt >= failedThreshold) continue; // Not old enough
      if (cleaned >= 50) break; // Batch limit

      // Delete the original storage file
      try {
        await ctx.storage.delete(item.storageId);
      } catch {
        // Storage file may already be gone
      }

      // Delete all generated sizes and their storage files
      const sizes = await ctx.db
        .query("mediaSizes")
        .withIndex("by_media", (q) => q.eq("mediaId", item._id))
        .collect();

      for (const size of sizes) {
        // Only delete storage if it's different from the original
        if (size.storageId !== item.storageId) {
          try {
            await ctx.storage.delete(size.storageId);
          } catch {
            // Orphaned storage file
          }
        }
        await ctx.db.delete("mediaSizes", size._id);
      }

      // Delete all mediaMeta records
      const metaRecords = await ctx.db
        .query("mediaMeta")
        .withIndex("by_media", (q) => q.eq("mediaId", item._id))
        .collect();

      for (const meta of metaRecords) {
        await ctx.db.delete("mediaMeta", meta._id);
      }

      // Delete the media record itself
      await ctx.db.delete("media", item._id);
      cleaned++;
    }

    return { markedFailed, cleaned };
  },
});
