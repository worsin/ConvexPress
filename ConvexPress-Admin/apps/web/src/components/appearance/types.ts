/**
 * Type contracts for the Header/Footer composers in Admin and the
 * `useHeaderConfig` / `useFooterConfig` hooks on the public Website.
 *
 * The shape mirrors the `header` / `footer` settings sections in Convex.
 */
// ─── Header Config ──────────────────────────────────

export interface HeaderConfig {
  layout: {
    style: "standard" | "centered" | "split";
    sticky: "always" | "scroll-up" | "none";
    background: "solid" | "transparent" | "glass";
    height: "compact" | "normal" | "tall";
    bottomBorder: "subtle" | "bold" | "none" | "shadow";
  };
  topBar: {
    enabled: boolean;
    leftContent: "contact" | "announcement" | "social" | "none";
    rightContent: "contact" | "announcement" | "social" | "none";
    email: string;
    phone: string;
    announcementText: string;
  };
  logo: {
    enabled: boolean;
    showImage: boolean;
    showTitle: boolean;
    showTagline: boolean;
    size: "small" | "medium" | "large";
  };
  navigation: {
    enabled: boolean;
    menuSource: "primary" | "secondary" | "custom";
    customLocation?: string;
    style: "inline" | "pills" | "underline";
    dropdownStyle: "flyout" | "mega";
  };
  search: {
    enabled: boolean;
    variant: "inline" | "icon" | "expandable";
    placeholder: string;
  };
  cta: {
    enabled: boolean;
    label: string;
    url: string;
    style: "filled" | "outline" | "ghost";
  };
  userMenu: {
    enabled: boolean;
    guestDisplay: "login-register" | "login-only" | "hidden";
    loggedInDisplay: "avatar-dropdown" | "name-dropdown" | "avatar-only";
    dropdownPreset:
      | "dashboard-profile-logout"
      | "profile-settings-logout"
      | "custom";
  };
  darkModeToggle: {
    enabled: boolean;
    variant: "icon" | "switch";
  };
  mobileMenu: {
    variant: "drawer" | "fullscreen" | "dropdown";
    drawerSide: "left" | "right";
  };
}

// ─── Footer Config (legacy section-toggle shape + v2 rows builder) ──────────

export type FooterCellType =
  | "brand"
  | "contact"
  | "copyright"
  | "divider"
  | "html"
  | "image"
  | "links"
  | "nav"
  | "newsletter"
  | "payments"
  | "social"
  | "text";

export type FooterAlignment = "left" | "center" | "right";

export interface FooterCellBase {
  type: FooterCellType;
  heading?: string;
  alignment?: FooterAlignment;
}

export interface FooterTextCell extends FooterCellBase {
  type: "text";
  body: string;
}
export interface FooterLinksCell extends FooterCellBase {
  type: "links";
  items: Array<{
    label: string;
    url: string;
    target?: "_self" | "_blank";
    rel?: string;
  }>;
}
export interface FooterNavCell extends FooterCellBase {
  type: "nav";
  menuLocation: string;
}
export interface FooterImageCell extends FooterCellBase {
  type: "image";
  mediaId: string | null;
  alt: string;
  href?: string;
  width?: number;
}
export interface FooterSocialCell extends FooterCellBase {
  type: "social";
  style: "icons" | "icons-and-labels" | "labels";
}
export interface FooterNewsletterCell extends FooterCellBase {
  type: "newsletter";
  subtext: string;
  buttonText: string;
  audienceId?: string;
}
export interface FooterContactCell extends FooterCellBase {
  type: "contact";
  address: string;
  phone: string;
  email: string;
  showIcons: boolean;
}
export interface FooterBrandCell extends FooterCellBase {
  type: "brand";
  showLogo: boolean;
  showTagline: boolean;
  showDescription: boolean;
  description: string;
}
export interface FooterHtmlCell extends FooterCellBase {
  type: "html";
  rawHtml: string;
}
export interface FooterDividerCell extends FooterCellBase {
  type: "divider";
  thickness: "thin" | "medium" | "thick";
}
export interface FooterCopyrightCell extends FooterCellBase {
  type: "copyright";
  text: string;
  insertYear: boolean;
}
export interface FooterPaymentsCell extends FooterCellBase {
  type: "payments";
  methods: string[];
}

export type FooterCell =
  | FooterTextCell
  | FooterLinksCell
  | FooterNavCell
  | FooterImageCell
  | FooterSocialCell
  | FooterNewsletterCell
  | FooterContactCell
  | FooterBrandCell
  | FooterHtmlCell
  | FooterDividerCell
  | FooterCopyrightCell
  | FooterPaymentsCell;

export interface FooterColumn {
  id: string;
  width?: number;
  alignment?: FooterAlignment;
  cell: FooterCell;
}

export interface FooterRow {
  id: string;
  heading?: string;
  background: "default" | "muted" | "accent" | "contrast" | "transparent";
  padding: "none" | "compact" | "normal" | "spacious";
  container: "narrow" | "default" | "wide" | "full";
  alignment?: FooterAlignment;
  topBorder?: "none" | "subtle" | "bold" | "accent";
  columns: FooterColumn[];
}

export interface FooterConfig {
  /** v2 rows builder. Empty array = render legacy section-toggle shape. */
  rows: FooterRow[];

  // ── Legacy fields (still rendered when rows is empty) ───────────────────
  layout: {
    columns: "1" | "2" | "3" | "4" | "centered" | "minimal";
    background: "dark" | "match-site" | "accent" | "image";
    backgroundImageId: string | null;
    topBorder: "subtle" | "bold" | "accent" | "none";
    padding: "compact" | "normal" | "spacious";
  };
  branding: {
    enabled: boolean;
    showLogo: boolean;
    showDescription: boolean;
    description: string;
    showSocial: boolean;
  };
  navColumns: {
    enabled: boolean;
    columns: Array<{
      heading: string;
      menuSource:
        | "footer-1"
        | "footer-2"
        | "footer-3"
        | "auto-pages"
        | "custom";
    }>;
  };
  newsletter: {
    enabled: boolean;
    heading: string;
    subtext: string;
    buttonText: string;
  };
  contactInfo: {
    enabled: boolean;
    address: string;
    phone: string;
    email: string;
  };
  bottomBar: {
    enabled: boolean;
    copyrightText: string;
    legalLinks: "privacy-terms" | "privacy-only" | "custom" | "none";
    poweredBy: boolean;
  };
}

// ─── Section Definitions ────────────────────────────

export interface ComposerSectionDef {
  id: string;
  label: string;
  hint: string;
  hasToggle: boolean;
  fields: ComposerField[];
}

export interface ComposerField {
  id: string;
  label: string;
  type: "select" | "toggle" | "text" | "variant-grid";
  options?: { value: string; label: string }[];
  columns?: 2 | 3;
}
