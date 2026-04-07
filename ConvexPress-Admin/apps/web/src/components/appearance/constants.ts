import type {
  HeaderConfig,
  FooterConfig,
  ComposerSectionDef,
} from "./types";

// ─── Header Defaults ────────────────────────────────

export const HEADER_DEFAULTS: HeaderConfig = {
  layout: {
    style: "standard",
    sticky: "always",
    background: "solid",
    height: "normal",
    bottomBorder: "subtle",
  },
  topBar: {
    enabled: false,
    leftContent: "contact",
    rightContent: "social",
    email: "",
    phone: "",
    announcementText: "",
  },
  logo: {
    enabled: true,
    showImage: true,
    showTitle: true,
    showTagline: false,
    size: "medium",
  },
  navigation: {
    enabled: true,
    menuSource: "primary",
    style: "inline",
    dropdownStyle: "flyout",
  },
  search: {
    enabled: true,
    variant: "icon",
    placeholder: "Search...",
  },
  cta: {
    enabled: false,
    label: "Get Started",
    url: "/register",
    style: "filled",
  },
  userMenu: {
    enabled: true,
    guestDisplay: "login-register",
    loggedInDisplay: "avatar-dropdown",
    dropdownPreset: "dashboard-profile-logout",
  },
  darkModeToggle: {
    enabled: true,
    variant: "icon",
  },
  mobileMenu: {
    variant: "drawer",
    drawerSide: "right",
  },
};

// ─── Footer Defaults ────────────────────────────────

export const FOOTER_DEFAULTS: FooterConfig = {
  layout: {
    columns: "4",
    background: "dark",
    backgroundImageId: null,
    topBorder: "subtle",
    padding: "normal",
  },
  branding: {
    enabled: true,
    showLogo: true,
    showDescription: true,
    description: "A modern content management system built for speed and scale.",
    showSocial: true,
  },
  navColumns: {
    enabled: true,
    columns: [
      { heading: "Product", menuSource: "footer-1" },
      { heading: "Company", menuSource: "footer-2" },
      { heading: "Resources", menuSource: "footer-3" },
    ],
  },
  newsletter: {
    enabled: false,
    heading: "Stay Updated",
    subtext: "Get the latest news and updates delivered to your inbox.",
    buttonText: "Subscribe",
  },
  contactInfo: {
    enabled: false,
    address: "",
    phone: "",
    email: "",
  },
  bottomBar: {
    enabled: true,
    copyrightText: "\u00a9 {year} {siteName}. All rights reserved.",
    legalLinks: "privacy-terms",
    poweredBy: true,
  },
};

// ─── Header Section Definitions ─────────────────────

export const HEADER_SECTIONS: ComposerSectionDef[] = [
  {
    id: "layout",
    label: "Header Layout",
    hint: "Overall header structure and behavior",
    hasToggle: false,
    fields: [
      {
        id: "style",
        label: "Layout Style",
        type: "variant-grid",
        columns: 3,
        options: [
          { value: "standard", label: "Standard" },
          { value: "centered", label: "Centered" },
          { value: "split", label: "Split" },
        ],
      },
      {
        id: "sticky",
        label: "Sticky Behavior",
        type: "select",
        options: [
          { value: "always", label: "Always" },
          { value: "scroll-up", label: "On Scroll Up" },
          { value: "none", label: "Not Sticky" },
        ],
      },
      {
        id: "background",
        label: "Background Style",
        type: "select",
        options: [
          { value: "solid", label: "Solid" },
          { value: "transparent", label: "Transparent" },
          { value: "glass", label: "Glass Blur" },
        ],
      },
      {
        id: "height",
        label: "Height",
        type: "select",
        options: [
          { value: "compact", label: "Compact" },
          { value: "normal", label: "Normal" },
          { value: "tall", label: "Tall" },
        ],
      },
      {
        id: "bottomBorder",
        label: "Bottom Border",
        type: "select",
        options: [
          { value: "subtle", label: "Subtle" },
          { value: "bold", label: "Bold" },
          { value: "none", label: "None" },
          { value: "shadow", label: "Shadow" },
        ],
      },
    ],
  },
  {
    id: "topBar",
    label: "Top Bar",
    hint: "Optional bar above the main header",
    hasToggle: true,
    fields: [
      {
        id: "leftContent",
        label: "Left Content",
        type: "select",
        options: [
          { value: "contact", label: "Contact Info" },
          { value: "announcement", label: "Announcement" },
          { value: "social", label: "Social Links" },
          { value: "none", label: "None" },
        ],
      },
      {
        id: "rightContent",
        label: "Right Content",
        type: "select",
        options: [
          { value: "contact", label: "Contact Info" },
          { value: "announcement", label: "Announcement" },
          { value: "social", label: "Social Links" },
          { value: "none", label: "None" },
        ],
      },
      { id: "email", label: "Email", type: "text" },
      { id: "phone", label: "Phone", type: "text" },
      { id: "announcementText", label: "Announcement Text", type: "text" },
    ],
  },
  {
    id: "logo",
    label: "Logo & Branding",
    hint: "Site logo, title, and tagline display",
    hasToggle: true,
    fields: [
      { id: "showImage", label: "Show Logo Image", type: "toggle" },
      { id: "showTitle", label: "Show Site Title", type: "toggle" },
      { id: "showTagline", label: "Show Tagline", type: "toggle" },
      {
        id: "size",
        label: "Logo Size",
        type: "select",
        options: [
          { value: "small", label: "Small" },
          { value: "medium", label: "Medium" },
          { value: "large", label: "Large" },
        ],
      },
    ],
  },
  {
    id: "navigation",
    label: "Main Navigation",
    hint: "Primary navigation menu display",
    hasToggle: true,
    fields: [
      {
        id: "menuSource",
        label: "Menu Source",
        type: "select",
        options: [
          { value: "primary", label: "Primary Menu" },
          { value: "secondary", label: "Secondary Menu" },
          { value: "custom", label: "Custom" },
        ],
      },
      {
        id: "style",
        label: "Link Style",
        type: "select",
        options: [
          { value: "inline", label: "Inline Links" },
          { value: "pills", label: "Pill Buttons" },
          { value: "underline", label: "Underline" },
        ],
      },
      {
        id: "dropdownStyle",
        label: "Dropdown Style",
        type: "select",
        options: [
          { value: "flyout", label: "Flyout" },
          { value: "mega", label: "Mega Menu" },
        ],
      },
    ],
  },
  {
    id: "search",
    label: "Search",
    hint: "Search bar or icon in the header",
    hasToggle: true,
    fields: [
      {
        id: "variant",
        label: "Search Variant",
        type: "variant-grid",
        columns: 3,
        options: [
          { value: "inline", label: "Inline Bar" },
          { value: "icon", label: "Icon Only" },
          { value: "expandable", label: "Expandable" },
        ],
      },
      { id: "placeholder", label: "Placeholder Text", type: "text" },
    ],
  },
  {
    id: "cta",
    label: "CTA Button",
    hint: "Call-to-action button in the header",
    hasToggle: true,
    fields: [
      { id: "label", label: "Button Label", type: "text" },
      { id: "url", label: "Button URL", type: "text" },
      {
        id: "style",
        label: "Button Style",
        type: "select",
        options: [
          { value: "filled", label: "Filled" },
          { value: "outline", label: "Outline" },
          { value: "ghost", label: "Ghost" },
        ],
      },
    ],
  },
  {
    id: "userMenu",
    label: "User / Profile Menu",
    hint: "Login links and user dropdown",
    hasToggle: true,
    fields: [
      {
        id: "guestDisplay",
        label: "Guest Display",
        type: "select",
        options: [
          { value: "login-register", label: "Login + Register Links" },
          { value: "login-only", label: "Login Button Only" },
          { value: "hidden", label: "Hidden" },
        ],
      },
      {
        id: "loggedInDisplay",
        label: "Logged-In Display",
        type: "select",
        options: [
          { value: "avatar-dropdown", label: "Avatar + Dropdown" },
          { value: "name-dropdown", label: "Name + Dropdown" },
          { value: "avatar-only", label: "Avatar Only" },
        ],
      },
      {
        id: "dropdownPreset",
        label: "Dropdown Preset",
        type: "select",
        options: [
          {
            value: "dashboard-profile-logout",
            label: "Dashboard / Profile / Logout",
          },
          {
            value: "profile-settings-logout",
            label: "Profile / Settings / Logout",
          },
          { value: "custom", label: "Custom" },
        ],
      },
    ],
  },
  {
    id: "darkModeToggle",
    label: "Dark Mode Toggle",
    hint: "Theme switcher control",
    hasToggle: true,
    fields: [
      {
        id: "variant",
        label: "Toggle Variant",
        type: "variant-grid",
        columns: 2,
        options: [
          { value: "icon", label: "Icon" },
          { value: "switch", label: "Switch" },
        ],
      },
    ],
  },
  {
    id: "mobileMenu",
    label: "Mobile Menu",
    hint: "Mobile navigation behavior",
    hasToggle: false,
    fields: [
      {
        id: "variant",
        label: "Menu Style",
        type: "variant-grid",
        columns: 3,
        options: [
          { value: "drawer", label: "Slide-in Drawer" },
          { value: "fullscreen", label: "Full Screen" },
          { value: "dropdown", label: "Dropdown" },
        ],
      },
      {
        id: "drawerSide",
        label: "Drawer Side",
        type: "select",
        options: [
          { value: "left", label: "Left" },
          { value: "right", label: "Right" },
        ],
      },
    ],
  },
];

// ─── Footer Section Definitions ─────────────────────

export const FOOTER_SECTIONS: ComposerSectionDef[] = [
  {
    id: "layout",
    label: "Footer Layout",
    hint: "Column structure and overall style",
    hasToggle: false,
    fields: [
      {
        id: "columns",
        label: "Column Layout",
        type: "variant-grid",
        columns: 3,
        options: [
          { value: "1", label: "1 Column" },
          { value: "2", label: "2 Columns" },
          { value: "3", label: "3 Columns" },
          { value: "4", label: "4 Columns" },
          { value: "centered", label: "Centered" },
          { value: "minimal", label: "Minimal" },
        ],
      },
      {
        id: "background",
        label: "Background",
        type: "select",
        options: [
          { value: "dark", label: "Dark" },
          { value: "match-site", label: "Match Site" },
          { value: "accent", label: "Accent" },
          { value: "image", label: "Image" },
        ],
      },
      {
        id: "topBorder",
        label: "Top Border",
        type: "select",
        options: [
          { value: "subtle", label: "Subtle" },
          { value: "bold", label: "Bold" },
          { value: "accent", label: "Accent" },
          { value: "none", label: "None" },
        ],
      },
      {
        id: "padding",
        label: "Padding",
        type: "select",
        options: [
          { value: "compact", label: "Compact" },
          { value: "normal", label: "Normal" },
          { value: "spacious", label: "Spacious" },
        ],
      },
    ],
  },
  {
    id: "branding",
    label: "Branding Column",
    hint: "Logo, description, and social links",
    hasToggle: true,
    fields: [
      { id: "showLogo", label: "Show Logo", type: "toggle" },
      { id: "showDescription", label: "Show Description", type: "toggle" },
      { id: "description", label: "Description", type: "text" },
      { id: "showSocial", label: "Show Social Links", type: "toggle" },
    ],
  },
  {
    id: "navColumns",
    label: "Navigation Columns",
    hint: "Footer link columns with headings",
    hasToggle: true,
    fields: [],
  },
  {
    id: "newsletter",
    label: "Newsletter Signup",
    hint: "Email subscription form",
    hasToggle: true,
    fields: [
      { id: "heading", label: "Heading", type: "text" },
      { id: "subtext", label: "Subtext", type: "text" },
      { id: "buttonText", label: "Button Text", type: "text" },
    ],
  },
  {
    id: "contactInfo",
    label: "Contact Info",
    hint: "Address, phone, and email",
    hasToggle: true,
    fields: [
      { id: "address", label: "Address", type: "text" },
      { id: "phone", label: "Phone", type: "text" },
      { id: "email", label: "Email", type: "text" },
    ],
  },
  {
    id: "bottomBar",
    label: "Bottom Bar",
    hint: "Copyright, legal links, and branding",
    hasToggle: true,
    fields: [
      { id: "copyrightText", label: "Copyright Text", type: "text" },
      {
        id: "legalLinks",
        label: "Legal Links",
        type: "select",
        options: [
          { value: "privacy-terms", label: "Privacy + Terms" },
          { value: "privacy-only", label: "Privacy Only" },
          { value: "custom", label: "Custom" },
          { value: "none", label: "None" },
        ],
      },
      { id: "poweredBy", label: "Show Powered By Badge", type: "toggle" },
    ],
  },
];
