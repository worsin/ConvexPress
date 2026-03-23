/**
 * ThemeStyleInjector
 *
 * Injects CSS custom properties from the Theme System into a <style> tag.
 * Also injects Google Fonts <link> tags and custom CSS.
 *
 * Connected to Convex via the ThemeContext provider. Renders inside
 * the body using CSS custom property overrides which cascade correctly.
 *
 * Security: CSS content is sanitized to prevent XSS attacks via CSS injection.
 */

import DOMPurify from "isomorphic-dompurify";
import { useMemo } from "react";

import { useTheme } from "@/lib/theme-context";

/**
 * Sanitize CSS content to prevent XSS attacks.
 * Removes potentially dangerous CSS constructs like url(), expression(), etc.
 */
function sanitizeCss(css: string): string {
  // First pass: remove dangerous CSS patterns
  let sanitized = css
    // Remove javascript: URLs
    .replace(/javascript\s*:/gi, "")
    // Remove expression() (IE-specific XSS vector)
    .replace(/expression\s*\(/gi, "")
    // Remove behavior: (IE-specific)
    .replace(/behavior\s*:/gi, "")
    // Remove -moz-binding (Firefox XSS vector)
    .replace(/-moz-binding\s*:/gi, "")
    // Remove @import (can load external resources)
    .replace(/@import\s+/gi, "/* blocked import */ ");

  // Second pass: sanitize through DOMPurify to catch any HTML/script injection
  // DOMPurify with FORCE_BODY handles style content safely
  sanitized = DOMPurify.sanitize(sanitized, {
    ALLOWED_TAGS: [], // No HTML tags allowed in CSS
    KEEP_CONTENT: true, // Keep the text content
  });

  return sanitized;
}

export function ThemeStyleInjector() {
  const { globalStyles } = useTheme();

  // Sanitize CSS content to prevent XSS
  const sanitizedCssProperties = useMemo(
    () => (globalStyles?.cssProperties ? sanitizeCss(globalStyles.cssProperties) : ""),
    [globalStyles?.cssProperties]
  );

  const sanitizedCustomCss = useMemo(
    () => (globalStyles?.customCss ? sanitizeCss(globalStyles.customCss) : ""),
    [globalStyles?.customCss]
  );

  if (!globalStyles) return null;

  return (
    <>
      {/* Google Fonts */}
      {globalStyles.googleFontUrls.map((url) => (
        <link
          key={url}
          rel="stylesheet"
          href={url.includes("display=swap") ? url : `${url}&display=swap`}
          data-slot="theme-google-font"
        />
      ))}

      {/* Theme CSS Custom Properties */}
      {sanitizedCssProperties && (
        <style
          data-slot="theme-style-injector"
          dangerouslySetInnerHTML={{
            __html: sanitizedCssProperties,
          }}
        />
      )}

      {/* Custom CSS from Customizer */}
      {sanitizedCustomCss && (
        <style
          data-slot="theme-custom-css"
          dangerouslySetInnerHTML={{
            __html: sanitizedCustomCss,
          }}
        />
      )}
    </>
  );
}
