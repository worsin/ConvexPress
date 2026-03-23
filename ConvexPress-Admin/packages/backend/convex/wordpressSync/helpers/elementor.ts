/**
 * Elementor Data Parser
 *
 * Parses Elementor page builder JSON data stored in WordPress post meta
 * (_elementor_data). Extracts text content for search/display and
 * remaps image URLs after media import.
 *
 * Elementor Structure:
 *   - Elements are hierarchical (sections contain columns contain widgets)
 *   - Each element has: id, elType, settings, elements (children)
 *   - Widgets have a widgetType that determines their content structure
 *   - Settings contain all widget configuration including text, images, etc.
 */

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ElementorElement {
  id: string;
  elType: "container" | "section" | "column" | "widget";
  widgetType?: string;
  settings: ElementorSettings;
  elements: ElementorElement[];
  isInner?: boolean;
}

export interface ElementorSettings {
  // Text content
  title?: string;
  editor?: string; // Rich text content (HTML)
  text?: string;
  heading?: string;
  description?: string;
  html?: string;
  content?: string;
  caption?: string;

  // Images
  image?: ElementorImage;
  background_image?: ElementorImage;
  gallery?: ElementorImage[];
  slides?: ElementorSlide[];

  // Links
  link?: ElementorLink;
  url?: ElementorLink;
  button_link?: ElementorLink;

  // Video
  video?: ElementorVideo;
  youtube_url?: string;
  vimeo_url?: string;

  // Icon
  selected_icon?: ElementorIcon;

  // Allow any other settings
  [key: string]: unknown;
}

export interface ElementorImage {
  id?: number;
  url?: string;
  alt?: string;
  source?: string;
  size?: string;
}

export interface ElementorSlide {
  image?: ElementorImage;
  title?: string;
  description?: string;
  button_text?: string;
  link?: ElementorLink;
}

export interface ElementorLink {
  url?: string;
  is_external?: boolean;
  nofollow?: boolean;
  custom_attributes?: string;
}

export interface ElementorVideo {
  url?: string;
  id?: string;
  provider?: string;
}

export interface ElementorIcon {
  value?: string;
  library?: string;
}

export interface ElementorData {
  content: ElementorElement[];
  page_settings?: Record<string, unknown>;
  version?: string;
}

// ─── Parsing ───────────────────────────────────────────────────────────────

/**
 * Parse Elementor JSON data from _elementor_data postmeta.
 *
 * @param rawData - JSON string from WordPress postmeta
 * @returns Parsed Elementor data or null if invalid
 */
export function parseElementorData(rawData: string): ElementorData | null {
  if (!rawData || typeof rawData !== "string") {
    return null;
  }

  try {
    // Handle double-encoded JSON (sometimes WordPress does this)
    let data = rawData;
    if (data.startsWith('"') && data.endsWith('"')) {
      data = JSON.parse(data) as string;
    }

    const parsed = JSON.parse(data);

    // Elementor data is an array of top-level elements
    if (Array.isArray(parsed)) {
      return {
        content: parsed as ElementorElement[],
      };
    }

    // Or it might be an object with a content array
    if (parsed && typeof parsed === "object" && "content" in parsed) {
      return parsed as ElementorData;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Check if a string looks like Elementor data.
 */
export function isElementorData(data: string): boolean {
  if (!data || typeof data !== "string") {
    return false;
  }

  try {
    const parsed = JSON.parse(data);

    if (Array.isArray(parsed) && parsed.length > 0) {
      // Check if first element has Elementor structure
      const first = parsed[0];
      return (
        typeof first === "object" &&
        first !== null &&
        "id" in first &&
        "elType" in first
      );
    }

    return false;
  } catch {
    return false;
  }
}

// ─── Text Extraction ───────────────────────────────────────────────────────

/**
 * Extract plain text content from Elementor data for searchability.
 * Strips HTML and concatenates all text content.
 *
 * @param data - Parsed Elementor data
 * @returns Plain text content
 */
export function extractTextFromElementor(data: ElementorData): string {
  const textParts: string[] = [];

  function walkElements(elements: ElementorElement[]): void {
    for (const el of elements) {
      extractTextFromElement(el, textParts);

      // Recurse into children
      if (el.elements && el.elements.length > 0) {
        walkElements(el.elements);
      }
    }
  }

  walkElements(data.content);

  // Join with double newlines and clean up
  return textParts
    .filter(Boolean)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractTextFromElement(el: ElementorElement, parts: string[]): void {
  const settings = el.settings || {};

  // Only extract from widgets (not containers/sections/columns)
  if (el.elType !== "widget") {
    return;
  }

  switch (el.widgetType) {
    case "heading":
    case "heading-style":
      if (settings.title) {
        parts.push(stripHtml(String(settings.title)));
      }
      break;

    case "text-editor":
    case "text":
      if (settings.editor) {
        parts.push(stripHtml(String(settings.editor)));
      }
      break;

    case "button":
      if (settings.text) {
        parts.push(stripHtml(String(settings.text)));
      }
      break;

    case "icon-box":
    case "image-box":
      if (settings.title_text) {
        parts.push(stripHtml(String(settings.title_text)));
      }
      if (settings.description_text) {
        parts.push(stripHtml(String(settings.description_text)));
      }
      break;

    case "call-to-action":
      if (settings.title) {
        parts.push(stripHtml(String(settings.title)));
      }
      if (settings.description) {
        parts.push(stripHtml(String(settings.description)));
      }
      if (settings.button) {
        parts.push(stripHtml(String(settings.button)));
      }
      break;

    case "testimonial":
      if (settings.testimonial_content) {
        parts.push(stripHtml(String(settings.testimonial_content)));
      }
      if (settings.testimonial_name) {
        parts.push(stripHtml(String(settings.testimonial_name)));
      }
      if (settings.testimonial_job) {
        parts.push(stripHtml(String(settings.testimonial_job)));
      }
      break;

    case "accordion":
    case "toggle":
      if (settings.tabs && Array.isArray(settings.tabs)) {
        for (const tab of settings.tabs) {
          if (tab.tab_title) {
            parts.push(stripHtml(String(tab.tab_title)));
          }
          if (tab.tab_content) {
            parts.push(stripHtml(String(tab.tab_content)));
          }
        }
      }
      break;

    case "tabs":
      if (settings.tabs && Array.isArray(settings.tabs)) {
        for (const tab of settings.tabs) {
          if (tab.tab_title) {
            parts.push(stripHtml(String(tab.tab_title)));
          }
          if (tab.tab_content) {
            parts.push(stripHtml(String(tab.tab_content)));
          }
        }
      }
      break;

    case "price-table":
      if (settings.heading) {
        parts.push(stripHtml(String(settings.heading)));
      }
      if (settings.sub_heading) {
        parts.push(stripHtml(String(settings.sub_heading)));
      }
      if (settings.price) {
        parts.push(String(settings.price));
      }
      if (settings.features_list && Array.isArray(settings.features_list)) {
        for (const feature of settings.features_list) {
          if (feature.item_text) {
            parts.push(stripHtml(String(feature.item_text)));
          }
        }
      }
      break;

    case "counter":
      if (settings.title) {
        parts.push(stripHtml(String(settings.title)));
      }
      break;

    case "alert":
      if (settings.alert_title) {
        parts.push(stripHtml(String(settings.alert_title)));
      }
      if (settings.alert_description) {
        parts.push(stripHtml(String(settings.alert_description)));
      }
      break;

    case "html":
      if (settings.html) {
        parts.push(stripHtml(String(settings.html)));
      }
      break;

    case "slides":
      if (settings.slides && Array.isArray(settings.slides)) {
        for (const slide of settings.slides) {
          if (slide.heading) {
            parts.push(stripHtml(String(slide.heading)));
          }
          if (slide.description) {
            parts.push(stripHtml(String(slide.description)));
          }
          if (slide.button_text) {
            parts.push(stripHtml(String(slide.button_text)));
          }
        }
      }
      break;

    default:
      // Try common text fields for unknown widgets
      for (const key of ["title", "text", "content", "description", "heading"]) {
        if (settings[key] && typeof settings[key] === "string") {
          parts.push(stripHtml(settings[key] as string));
        }
      }
  }
}

// ─── Image URL Extraction and Remapping ────────────────────────────────────

/**
 * Extract all image URLs from Elementor data for media downloading.
 *
 * @param data - Parsed Elementor data
 * @returns Array of unique image URLs
 */
export function extractImageUrls(data: ElementorData): string[] {
  const urls = new Set<string>();

  function walkElements(elements: ElementorElement[]): void {
    for (const el of elements) {
      extractUrlsFromSettings(el.settings, urls);

      if (el.elements && el.elements.length > 0) {
        walkElements(el.elements);
      }
    }
  }

  walkElements(data.content);
  return Array.from(urls);
}

function extractUrlsFromSettings(
  settings: ElementorSettings,
  urls: Set<string>
): void {
  // Direct image field
  if (settings.image?.url) {
    urls.add(settings.image.url);
  }

  // Background image
  if (settings.background_image?.url) {
    urls.add(settings.background_image.url);
  }

  // Gallery
  if (settings.gallery && Array.isArray(settings.gallery)) {
    for (const img of settings.gallery) {
      if (img.url) {
        urls.add(img.url);
      }
    }
  }

  // Slides
  if (settings.slides && Array.isArray(settings.slides)) {
    for (const slide of settings.slides) {
      if (slide.image?.url) {
        urls.add(slide.image.url);
      }
    }
  }

  // Check for image URLs in any _image or *_src fields
  for (const [key, value] of Object.entries(settings)) {
    if (key.includes("image") || key.endsWith("_src")) {
      if (typeof value === "object" && value !== null && "url" in value) {
        const img = value as ElementorImage;
        if (img.url) {
          urls.add(img.url);
        }
      } else if (typeof value === "string" && isImageUrl(value)) {
        urls.add(value);
      }
    }
  }
}

/**
 * Remap image URLs in Elementor data after media import.
 * Returns a new copy with URLs replaced.
 *
 * @param data - Parsed Elementor data
 * @param urlMapping - Map of old URL -> new URL
 * @returns New Elementor data with remapped URLs
 */
export function remapElementorImageUrls(
  data: ElementorData,
  urlMapping: Map<string, string>
): ElementorData {
  // Deep clone the data
  const remapped = JSON.parse(JSON.stringify(data)) as ElementorData;

  function walkElements(elements: ElementorElement[]): void {
    for (const el of elements) {
      remapUrlsInSettings(el.settings, urlMapping);

      if (el.elements && el.elements.length > 0) {
        walkElements(el.elements);
      }
    }
  }

  walkElements(remapped.content);
  return remapped;
}

function remapUrlsInSettings(
  settings: ElementorSettings,
  urlMapping: Map<string, string>
): void {
  // Direct image field
  if (settings.image?.url && urlMapping.has(settings.image.url)) {
    settings.image.url = urlMapping.get(settings.image.url)!;
  }

  // Background image
  if (settings.background_image?.url && urlMapping.has(settings.background_image.url)) {
    settings.background_image.url = urlMapping.get(settings.background_image.url)!;
  }

  // Gallery
  if (settings.gallery && Array.isArray(settings.gallery)) {
    for (const img of settings.gallery) {
      if (img.url && urlMapping.has(img.url)) {
        img.url = urlMapping.get(img.url)!;
      }
    }
  }

  // Slides
  if (settings.slides && Array.isArray(settings.slides)) {
    for (const slide of settings.slides) {
      if (slide.image?.url && urlMapping.has(slide.image.url)) {
        slide.image.url = urlMapping.get(slide.image.url)!;
      }
    }
  }

  // Check all other fields for image URLs
  for (const [key, value] of Object.entries(settings)) {
    if (key === "image" || key === "background_image" || key === "gallery" || key === "slides") {
      continue; // Already handled
    }

    if (typeof value === "object" && value !== null && "url" in value) {
      const img = value as ElementorImage;
      if (img.url && urlMapping.has(img.url)) {
        img.url = urlMapping.get(img.url)!;
      }
    } else if (typeof value === "string" && urlMapping.has(value)) {
      (settings as Record<string, unknown>)[key] = urlMapping.get(value)!;
    }
  }
}

// ─── Utility Functions ─────────────────────────────────────────────────────

/**
 * Strip HTML tags from a string.
 */
export function stripHtml(html: string): string {
  if (!html) return "";

  return html
    // Remove HTML tags
    .replace(/<[^>]*>/g, " ")
    // Decode common HTML entities
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    // Clean up whitespace
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Check if a string looks like an image URL.
 */
function isImageUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false;

  // Check for common image extensions
  const imageExtensions = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)(\?.*)?$/i;
  if (imageExtensions.test(url)) return true;

  // Check for WordPress media URLs
  if (url.includes("/wp-content/uploads/")) return true;

  return false;
}

/**
 * Get a summary of Elementor content for preview purposes.
 */
export function getElementorSummary(data: ElementorData): {
  elementCount: number;
  widgetTypes: string[];
  imageCount: number;
  textLength: number;
} {
  let elementCount = 0;
  const widgetTypes = new Set<string>();
  let imageCount = 0;

  function walkElements(elements: ElementorElement[]): void {
    for (const el of elements) {
      elementCount++;

      if (el.widgetType) {
        widgetTypes.add(el.widgetType);
      }

      // Count images
      if (el.settings?.image?.url) imageCount++;
      if (el.settings?.background_image?.url) imageCount++;
      if (el.settings?.gallery) imageCount += el.settings.gallery.length;

      if (el.elements && el.elements.length > 0) {
        walkElements(el.elements);
      }
    }
  }

  walkElements(data.content);

  const text = extractTextFromElementor(data);

  return {
    elementCount,
    widgetTypes: Array.from(widgetTypes),
    imageCount,
    textLength: text.length,
  };
}
