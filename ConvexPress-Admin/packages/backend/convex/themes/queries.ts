/**
 * Theme System Queries
 *
 * Provides theme data for the public website.
 * Returns default theme configuration until full theme management is implemented.
 */

import { query } from "../_generated/server";

/**
 * Get the active theme for the website.
 * Returns a default theme configuration.
 */
export const getActive = query({
  args: {},
  handler: async () => {
    // Return default theme until full theme management is implemented
    return {
      _id: "default-theme",
      _creationTime: Date.now(),
      name: "Default Theme",
      slug: "default",
      description: "SmithHarper default theme",
      version: "1.0.0",
      author: "SmithHarper",
      screenshot: null,
      isActive: true,
      isDefault: true,
      supports: {
        layout: {
          contentSize: "800px",
          wideSize: "1200px",
        },
      },
      globalStyles: {
        settings: {
          color: {
            palette: [
              { slug: "primary", name: "Primary", color: "#3b82f6" },
              { slug: "secondary", name: "Secondary", color: "#64748b" },
              { slug: "background", name: "Background", color: "#0a0a0a" },
              { slug: "foreground", name: "Foreground", color: "#fafafa" },
              { slug: "muted", name: "Muted", color: "#27272a" },
            ],
            gradients: [],
            defaultPalette: true,
            background: true,
            text: true,
            link: true,
          },
          typography: {
            fontFamilies: [
              {
                slug: "system",
                name: "System Font",
                fontFamily:
                  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              },
            ],
            fontSizes: [
              { slug: "small", name: "Small", size: "0.875rem" },
              { slug: "medium", name: "Medium", size: "1rem" },
              { slug: "large", name: "Large", size: "1.25rem" },
              { slug: "x-large", name: "Extra Large", size: "1.5rem" },
            ],
            customFontSize: true,
            lineHeight: true,
            fontWeight: true,
            letterSpacing: true,
            textTransform: true,
          },
          spacing: {
            padding: true,
            margin: true,
            blockGap: "1.5rem",
            units: ["px", "rem", "em", "%"],
            spacingSizes: [
              { slug: "small", name: "Small", size: "0.5rem" },
              { slug: "medium", name: "Medium", size: "1rem" },
              { slug: "large", name: "Large", size: "2rem" },
            ],
          },
          layout: {
            contentSize: "800px",
            wideSize: "1200px",
          },
          border: {
            color: true,
            radius: true,
            style: true,
            width: true,
          },
        },
        styles: {
          color: {
            background: "#0a0a0a",
            text: "#fafafa",
          },
          typography: {
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            fontSize: "1rem",
            lineHeight: "1.6",
          },
        },
      },
      customizer: {
        siteIdentity: {
          displaySiteTitle: true,
          displayTagline: true,
        },
        header: {
          templatePartSlug: "header-default",
          sticky: false,
          transparent: false,
        },
        footer: {
          templatePartSlug: "footer-default",
          copyrightText: `© ${new Date().getFullYear()} SmithHarper. All rights reserved.`,
          showPoweredBy: false,
        },
        sidebar: {
          position: "none",
        },
      },
      templateAssignments: {
        index: "index",
        home: "home",
        single: "single",
        page: "page",
        archive: "archive",
        search: "search",
        notFound: "404",
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  },
});

/**
 * Get compiled global styles for the website.
 * Returns default CSS and style settings.
 */
export const getGlobalStyles = query({
  args: {},
  handler: async () => {
    return {
      settings: {
        color: {
          palette: [
            { slug: "primary", name: "Primary", color: "#3b82f6" },
            { slug: "secondary", name: "Secondary", color: "#64748b" },
            { slug: "background", name: "Background", color: "#0a0a0a" },
            { slug: "foreground", name: "Foreground", color: "#fafafa" },
            { slug: "muted", name: "Muted", color: "#27272a" },
          ],
          gradients: [],
          defaultPalette: true,
          background: true,
          text: true,
          link: true,
        },
        typography: {
          fontFamilies: [
            {
              slug: "system",
              name: "System Font",
              fontFamily:
                '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            },
          ],
          fontSizes: [
            { slug: "small", name: "Small", size: "0.875rem" },
            { slug: "medium", name: "Medium", size: "1rem" },
            { slug: "large", name: "Large", size: "1.25rem" },
            { slug: "x-large", name: "Extra Large", size: "1.5rem" },
          ],
          customFontSize: true,
          lineHeight: true,
          fontWeight: true,
          letterSpacing: true,
          textTransform: true,
        },
        spacing: {
          padding: true,
          margin: true,
          blockGap: "1.5rem",
          units: ["px", "rem", "em", "%"],
          spacingSizes: [
            { slug: "small", name: "Small", size: "0.5rem" },
            { slug: "medium", name: "Medium", size: "1rem" },
            { slug: "large", name: "Large", size: "2rem" },
          ],
        },
        layout: {
          contentSize: "800px",
          wideSize: "1200px",
        },
        border: {
          color: true,
          radius: true,
          style: true,
          width: true,
        },
      },
      styles: {
        color: {
          background: "#0a0a0a",
          text: "#fafafa",
        },
        typography: {
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          fontSize: "1rem",
          lineHeight: "1.6",
        },
      },
      cssProperties: `
        :root {
          --color-primary: #3b82f6;
          --color-secondary: #64748b;
          --color-background: #0a0a0a;
          --color-foreground: #fafafa;
          --color-muted: #27272a;
          --font-family-base: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          --font-size-base: 1rem;
          --line-height-base: 1.6;
          --content-size: 800px;
          --wide-size: 1200px;
        }
      `.trim(),
      customCss: "",
      googleFontUrls: [],
    };
  },
});
