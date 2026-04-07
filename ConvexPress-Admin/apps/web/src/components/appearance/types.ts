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

// ─── Footer Config ──────────────────────────────────

export interface FooterConfig {
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
