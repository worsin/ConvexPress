/**
 * Client-side helpers for the footer rows builder. Mirrors the backend
 * helpers in `convex/settings/footerRows.ts` — kept in sync by hand because
 * the backend file is a Convex runtime module that's awkward to import in
 * Vite client code.
 */

import type {
  FooterCell,
  FooterCellType,
  FooterColumn,
  FooterConfig,
  FooterRow,
} from "./types";

function makeId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function makeDefaultCell(type: FooterCellType): FooterCell {
  switch (type) {
    case "text":
      return { type, heading: "", body: "" };
    case "links":
      return { type, heading: "", items: [] };
    case "nav":
      return { type, heading: "", menuLocation: "footer-1" };
    case "image":
      return { type, mediaId: null, alt: "", width: 200 };
    case "social":
      return { type, heading: "Follow us", style: "icons", alignment: "left" };
    case "newsletter":
      return {
        type,
        heading: "Stay Updated",
        subtext: "Get the latest posts delivered to your inbox.",
        buttonText: "Subscribe",
      };
    case "contact":
      return {
        type,
        heading: "Contact",
        address: "",
        phone: "",
        email: "",
        showIcons: true,
      };
    case "brand":
      return {
        type,
        showLogo: true,
        showTagline: true,
        showDescription: true,
        description: "",
      };
    case "html":
      return { type, rawHtml: "" };
    case "divider":
      return { type, thickness: "thin" };
    case "copyright":
      return {
        type,
        text: "© {year} — All rights reserved.",
        insertYear: true,
      };
    case "payments":
      return {
        type,
        methods: ["visa", "mastercard", "amex"],
        alignment: "left",
      };
  }
}

export function makeColumn(cell: FooterCell, width?: number): FooterColumn {
  return { id: makeId("col"), width, cell };
}

export function makeRow(columns: FooterColumn[] = []): FooterRow {
  return {
    id: makeId("row"),
    background: "default",
    padding: "normal",
    container: "default",
    columns,
  };
}

/**
 * Given the user's existing legacy footer config (section toggles), build a
 * starter rows array that recreates the same visual content as v2 cells.
 */
export function convertLegacyFooterToRows(legacy: FooterConfig): FooterRow[] {
  const topColumns: FooterColumn[] = [];

  if (legacy.branding?.enabled) {
    topColumns.push(
      makeColumn({
        type: "brand",
        showLogo: legacy.branding.showLogo,
        showTagline: true,
        showDescription: legacy.branding.showDescription,
        description: legacy.branding.description,
      }),
    );
  }

  if (legacy.navColumns?.enabled) {
    for (const col of legacy.navColumns.columns) {
      topColumns.push(
        makeColumn({
          type: "nav",
          heading: col.heading,
          menuLocation:
            col.menuSource === "custom" || col.menuSource === "auto-pages"
              ? "footer-1"
              : col.menuSource,
        }),
      );
    }
  }

  if (legacy.newsletter?.enabled) {
    topColumns.push(
      makeColumn({
        type: "newsletter",
        heading: legacy.newsletter.heading,
        subtext: legacy.newsletter.subtext,
        buttonText: legacy.newsletter.buttonText,
      }),
    );
  }

  if (legacy.contactInfo?.enabled) {
    topColumns.push(
      makeColumn({
        type: "contact",
        heading: "Contact",
        address: legacy.contactInfo.address,
        phone: legacy.contactInfo.phone,
        email: legacy.contactInfo.email,
        showIcons: true,
      }),
    );
  }

  const rows: FooterRow[] = [];
  if (topColumns.length > 0) rows.push(makeRow(topColumns));

  if (legacy.bottomBar?.enabled) {
    rows.push({
      ...makeRow([
        makeColumn(
          {
            type: "copyright",
            text:
              legacy.bottomBar.copyrightText ||
              "© {year} — All rights reserved.",
            insertYear: true,
          },
          6,
        ),
        makeColumn(
          legacy.bottomBar.legalLinks === "none"
            ? makeDefaultCell("links")
            : {
                type: "links",
                items: [
                  {
                    label: "Privacy Policy",
                    url: "/privacy",
                    target: "_self",
                  },
                  ...(legacy.bottomBar.legalLinks === "privacy-terms"
                    ? [
                        {
                          label: "Terms of Service",
                          url: "/terms",
                          target: "_self" as const,
                        },
                      ]
                    : []),
                ],
                alignment: "right",
              },
          6,
        ),
      ]),
      topBorder: "subtle",
      padding: "compact",
    });
  }

  return rows;
}

export const FOOTER_CELL_CATALOG: Array<{
  type: FooterCellType;
  title: string;
  description: string;
}> = [
  { type: "brand", title: "Brand block", description: "Logo, tagline, description, and social row." },
  { type: "nav", title: "Menu", description: "Renders a menu by location (Footer 1, Footer 2, etc)." },
  { type: "links", title: "Custom links", description: "Hand-typed list of links." },
  { type: "text", title: "Text", description: "Heading + paragraph body." },
  { type: "newsletter", title: "Newsletter signup", description: "Inline form connected to your audience." },
  { type: "social", title: "Social row", description: "Pulls socials from site identity." },
  { type: "contact", title: "Contact block", description: "Address, phone, email." },
  { type: "image", title: "Image", description: "Single image, optionally linked." },
  { type: "copyright", title: "Copyright", description: "Auto-year copyright text." },
  { type: "payments", title: "Payments", description: "Payment-method icon grid." },
  { type: "divider", title: "Divider", description: "Horizontal rule between cells." },
  { type: "html", title: "Raw HTML", description: "Escape hatch. Admin-only field. Sanitized on render." },
];

export const FOOTER_ROW_BACKGROUND_OPTIONS = [
  { value: "default", label: "Default" },
  { value: "muted", label: "Muted" },
  { value: "accent", label: "Accent" },
  { value: "contrast", label: "Contrast" },
  { value: "transparent", label: "Transparent" },
] as const;

export const FOOTER_ROW_PADDING_OPTIONS = [
  { value: "none", label: "None" },
  { value: "compact", label: "Compact" },
  { value: "normal", label: "Normal" },
  { value: "spacious", label: "Spacious" },
] as const;

export const FOOTER_ROW_CONTAINER_OPTIONS = [
  { value: "narrow", label: "Narrow" },
  { value: "default", label: "Default" },
  { value: "wide", label: "Wide" },
  { value: "full", label: "Full" },
] as const;

export const FOOTER_ROW_BORDER_OPTIONS = [
  { value: "none", label: "None" },
  { value: "subtle", label: "Subtle" },
  { value: "bold", label: "Bold" },
  { value: "accent", label: "Accent" },
] as const;
