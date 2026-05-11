# Shell Builder Design — Header & Footer Composers

**Date:** 2026-04-06
**Status:** Approved
**Mockup:** `docs/superpowers/mockups/shell-builder-mockup.html`
**Related:** `docs/superpowers/specs/2026-04-06-layout-system-design.md` (content layouts)

---

## Overview

The Shell Builder gives admins a composer interface — same pattern as the Layout System — for configuring the global site header and footer. Each builder has a left panel of togglable, configurable sections and a right panel with a real-time preview. Configs are stored as JSON in the settings table. Per-page overrides allow hiding the header/footer on specific pages (landing pages, funnels, etc.).

The header and footer are **global** — one config each, applied site-wide. They are NOT part of content layouts. The Layout System controls the content area; the Shell Builder controls the frame around it.

## Architecture

### Storage: Settings Table

Header and footer configs live in the existing `settings` table as two new sections:

```typescript
// Added to settings section union
v.literal("header")
v.literal("footer")
```

These are single-document configs (not a library of saved variants like layouts). One header config, one footer config, applied globally. This keeps it simple — you're not choosing between multiple headers, you're building THE header for your site.

### Why Settings, Not a Separate Table?

- There's only one header and one footer config (global, not per-page)
- The settings system already handles section-based JSON storage, validation, defaults, auth, and events
- Consistent with how other site-wide config works (General, Reading, Permalinks, etc.)
- The Layout System uses a separate table because layouts are a *library* of reusable configs; header/footer are singletons

## Header Builder

### Sections

| Section | Purpose | Key Options |
|---------|---------|-------------|
| **Header Layout** | Overall structure | Layout: Standard / Centered / Split. Sticky: Always / On Scroll Up / Not Sticky. Background: Solid / Transparent / Glass Blur. Height: Compact / Normal / Tall. Bottom border: Subtle / Bold / None / Shadow |
| **Top Bar** | Slim bar above main header | Left content: Contact Info / Announcement / Social / None. Right content: same options. Contact fields (email, phone). Announcement text |
| **Logo & Branding** | Site identity | Show logo image (bool). Show site title (bool). Show tagline (bool). Logo size: Small / Medium / Large. Logo/title/tagline values pulled from Settings > General |
| **Main Navigation** | Primary nav menu | Menu source: Primary Menu / Secondary Menu / Custom. Style: Inline Links / Pill Buttons / Underline. Dropdown style: Flyout / Mega Menu. Menu items managed in Appearance > Menus (Menu System) |
| **Search** | Search in header | Variant: Inline Bar / Icon Only / Expandable / None. Placeholder text |
| **CTA Button** | Call-to-action | Label, URL, Style: Filled / Outline / Ghost |
| **User / Profile Menu** | Auth-aware user area | Guest display: Login+Register Links / Login Button Only / Hidden. Logged-in display: Avatar+Dropdown / Name+Dropdown / Avatar Only. Dropdown items: preset sets or custom |
| **Dark Mode Toggle** | Theme switcher | Variant: Icon / Switch |
| **Mobile Menu** | Mobile navigation | Variant: Slide-in Drawer / Full Screen / Dropdown. Drawer side: Left / Right |

### Header Config Shape

```typescript
{
  layout: {
    style: "standard" | "centered" | "split",
    sticky: "always" | "scroll-up" | "none",
    background: "solid" | "transparent" | "glass",
    height: "compact" | "normal" | "tall",
    bottomBorder: "subtle" | "bold" | "none" | "shadow",
  },
  topBar: {
    enabled: boolean,
    leftContent: "contact" | "announcement" | "social" | "none",
    rightContent: "contact" | "announcement" | "social" | "none",
    email: string,
    phone: string,
    announcementText: string,
  },
  logo: {
    enabled: boolean, // can disable, but why would you
    showImage: boolean,
    showTitle: boolean,
    showTagline: boolean,
    size: "small" | "medium" | "large",
  },
  navigation: {
    enabled: boolean,
    menuSource: "primary" | "secondary" | "custom",
    style: "inline" | "pills" | "underline",
    dropdownStyle: "flyout" | "mega",
  },
  search: {
    enabled: boolean,
    variant: "inline" | "icon" | "expandable",
    placeholder: string,
  },
  cta: {
    enabled: boolean,
    label: string,
    url: string,
    style: "filled" | "outline" | "ghost",
  },
  userMenu: {
    enabled: boolean,
    guestDisplay: "login-register" | "login-only" | "hidden",
    loggedInDisplay: "avatar-dropdown" | "name-dropdown" | "avatar-only",
    dropdownPreset: "dashboard-profile-logout" | "profile-settings-logout" | "custom",
  },
  darkModeToggle: {
    enabled: boolean,
    variant: "icon" | "switch",
  },
  mobileMenu: {
    variant: "drawer" | "fullscreen" | "dropdown",
    drawerSide: "left" | "right",
  },
}
```

### Header Layout Variants

**Standard** — Logo left, nav center/right, actions far right. The classic.
```
[Logo]  [Home] [Blog] [About] [Services] [Contact]  [Search] [CTA] [Avatar] [Moon]
```

**Centered** — Logo centered above nav, actions split left/right.
```
                    [Logo]
[Search]  [Home] [Blog] [About] [Services] [Contact]  [CTA] [Avatar] [Moon]
```

**Split** — Logo center, nav split on both sides.
```
[Home] [Blog] [About]    [Logo]    [Services] [Contact]  [Search] [CTA] [Avatar]
```

## Footer Builder

### Sections

| Section | Purpose | Key Options |
|---------|---------|-------------|
| **Footer Layout** | Column structure | Columns: 1 / 2 / 3 / 4 / Centered / Minimal. Background: Dark / Match Site / Accent / Image. Top border: Subtle / Bold / Accent / None. Padding: Compact / Normal / Spacious |
| **Branding Column** | Logo + description + social | Show logo (bool). Show description (bool). Description text. Social links: Show / Hide |
| **Navigation Columns** | Link columns | Number of columns (1-3). Per column: heading text, menu source (Footer Menu 1/2/3 or auto from pages) |
| **Newsletter Signup** | Email capture | Heading, subtext, button text. Integrates with email system |
| **Contact Info** | Address, phone, email | Each field optional. Shown in its own block |
| **Bottom Bar** | Copyright strip | Copyright text (site name auto-inserted with year). Legal links: Privacy+Terms / Privacy Only / Custom / None. Powered By badge: Show / Hide |

### Footer Config Shape

```typescript
{
  layout: {
    columns: "1" | "2" | "3" | "4" | "centered" | "minimal",
    background: "dark" | "match-site" | "accent" | "image",
    backgroundImageId: string | null, // when background === "image"
    topBorder: "subtle" | "bold" | "accent" | "none",
    padding: "compact" | "normal" | "spacious",
  },
  branding: {
    enabled: boolean,
    showLogo: boolean,
    showDescription: boolean,
    description: string,
    showSocial: boolean,
  },
  navColumns: {
    enabled: boolean,
    columns: Array<{
      heading: string,
      menuSource: "footer-1" | "footer-2" | "footer-3" | "auto-pages" | "custom",
    }>,
  },
  newsletter: {
    enabled: boolean,
    heading: string,
    subtext: string,
    buttonText: string,
  },
  contactInfo: {
    enabled: boolean,
    address: string,
    phone: string,
    email: string,
  },
  bottomBar: {
    enabled: boolean,
    copyrightText: string, // site name; year auto-prepended
    legalLinks: "privacy-terms" | "privacy-only" | "custom" | "none",
    poweredBy: boolean,
  },
}
```

### Footer Layout Variants

**4 Columns** (default) — Brand | Nav 1 | Nav 2 | Newsletter
**3 Columns** — Brand | Nav 1 | Nav 2 (newsletter moves under brand or is hidden)
**2 Columns** — Brand+Social | All nav links combined
**1 Column** — Everything stacked vertically, centered
**Centered** — Logo centered, nav links as a horizontal row, social below
**Minimal** — Just copyright + legal links in a single line

## Defaults

### Header Defaults

```typescript
HEADER_DEFAULTS = {
  layout: { style: "standard", sticky: "always", background: "solid", height: "normal", bottomBorder: "subtle" },
  topBar: { enabled: false, leftContent: "contact", rightContent: "social", email: "", phone: "", announcementText: "" },
  logo: { enabled: true, showImage: true, showTitle: true, showTagline: false, size: "medium" },
  navigation: { enabled: true, menuSource: "primary", style: "inline", dropdownStyle: "flyout" },
  search: { enabled: true, variant: "inline", placeholder: "Search..." },
  cta: { enabled: false, label: "Get Started", url: "/register", style: "filled" },
  userMenu: { enabled: true, guestDisplay: "login-register", loggedInDisplay: "avatar-dropdown", dropdownPreset: "dashboard-profile-logout" },
  darkModeToggle: { enabled: true, variant: "icon" },
  mobileMenu: { variant: "drawer", drawerSide: "right" },
}
```

### Footer Defaults

```typescript
FOOTER_DEFAULTS = {
  layout: { columns: "4", background: "dark", backgroundImageId: null, topBorder: "subtle", padding: "normal" },
  branding: { enabled: true, showLogo: true, showDescription: true, description: "", showSocial: true },
  navColumns: { enabled: true, columns: [{ heading: "Company", menuSource: "footer-1" }, { heading: "Resources", menuSource: "footer-2" }] },
  newsletter: { enabled: true, heading: "Stay Updated", subtext: "Get the latest posts delivered to your inbox.", buttonText: "Subscribe" },
  contactInfo: { enabled: false, address: "", phone: "", email: "" },
  bottomBar: { enabled: true, copyrightText: "", legalLinks: "privacy-terms", poweredBy: true },
}
```

## Admin UI

### Routes

- `/admin/appearance/header` — Header Builder (composer)
- `/admin/appearance/footer` — Footer Builder (composer)

These sit under an **Appearance** section in the admin sidebar (alongside Menus and the Layout Library). This mirrors WordPress's Appearance menu.

### Composer Pattern

Same composer pattern as the Layout System:
- Left panel: section list with toggles, variant pickers, option controls
- Right panel: real-time preview that updates on every change
- Device toggle: Desktop / Tablet / Mobile widths
- Save button persists to settings
- Reset to Default button restores HEADER_DEFAULTS / FOOTER_DEFAULTS

### Real-Time Preview

Same approach as Layout System — pure React state. Each option change re-renders the preview instantly. The preview uses actual component variants to approximate the website output.

## Website Integration

### Header Rendering

The website's `SiteHeader` component reads the header config from settings (via `useSetting("header")` or the autoloaded settings context) and renders accordingly:

```typescript
function SiteHeader() {
  const headerConfig = useHeaderConfig(); // from settings context

  return (
    <header>
      {headerConfig.topBar.enabled && <TopBar config={headerConfig.topBar} />}
      <MainHeader config={headerConfig} />
    </header>
  );
}

function MainHeader({ config }) {
  const LayoutComponent = {
    standard: StandardHeader,
    centered: CenteredHeader,
    split: SplitHeader,
  }[config.layout.style];

  return <LayoutComponent config={config} />;
}
```

Each header layout component renders the enabled sections (logo, nav, search, CTA, user menu, dark mode toggle) in the appropriate arrangement.

### Footer Rendering

Same pattern — `SiteFooter` reads footer config and renders:

```typescript
function SiteFooter() {
  const footerConfig = useFooterConfig();

  return (
    <footer>
      <FooterMain config={footerConfig} />
      {footerConfig.bottomBar.enabled && <FooterBottomBar config={footerConfig.bottomBar} />}
    </footer>
  );
}
```

### Per-Page Hide

Already defined in the Layout System spec: posts/pages get `hideHeader` and `hideFooter` boolean fields. The `_marketing.tsx` layout route conditionally renders:

```typescript
{!post?.hideHeader && <SiteHeader />}
{/* content / LayoutRenderer */}
{!post?.hideFooter && <SiteFooter />}
```

### Replacing Hardcoded Components

The existing `SiteHeader.tsx` and `SiteFooter.tsx` currently render a single hardcoded layout. They become config-driven:
- Read config from settings context
- Dispatch to the appropriate layout variant component
- The existing template-parts (DefaultHeader, CenteredHeader, MinimalHeader, DefaultFooter, ColumnsFooter, MinimalFooter) that are currently unused can be adapted or replaced by the new config-driven components

## Scope Boundaries

**In scope:**
- Header config schema + defaults + validation
- Footer config schema + defaults + validation
- New settings sections ("header", "footer")
- Header builder admin UI (composer with real-time preview)
- Footer builder admin UI (composer with real-time preview)
- Config-driven SiteHeader and SiteFooter on the website
- 3 header layout variants (standard, centered, split)
- 6 footer layout variants (1-4 columns, centered, minimal)
- Per-page hide header/footer (shared with Layout System)

**Out of scope (future):**
- Saved header/footer presets (library of multiple configs — for now, one global config each)
- Visual drag-and-drop reordering of header elements
- Custom CSS injection per header/footer section
- Mega menu builder (complex dropdown layouts — uses simple flyout for now)
- Footer widget areas (arbitrary content blocks — keep it structured for now)
- AI generation of header/footer configs (same pattern as layouts, but implement after core)

## File Impact

### New Files
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/appearance/header.tsx` — Header builder route
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/appearance/footer.tsx` — Footer builder route
- `ConvexPress-Admin/apps/web/src/components/appearance/HeaderComposer.tsx` — Header composer component
- `ConvexPress-Admin/apps/web/src/components/appearance/FooterComposer.tsx` — Footer composer component
- `ConvexPress-Admin/apps/web/src/components/appearance/HeaderPreview.tsx` — Real-time header preview
- `ConvexPress-Admin/apps/web/src/components/appearance/FooterPreview.tsx` — Real-time footer preview
- `ConvexPress-Admin/apps/web/src/components/appearance/SectionControl.tsx` — Reusable section toggle/options component (shared with Layout composer)
- `ConvexPress-Website/apps/web/src/components/header/` — Config-driven header variant components
  - `StandardHeader.tsx`
  - `CenteredHeader.tsx`
  - `SplitHeader.tsx`
  - `TopBar.tsx`
  - `HeaderSearch.tsx`
  - `HeaderCta.tsx`
  - `UserMenu.tsx`
  - `MobileMenu.tsx`
- `ConvexPress-Website/apps/web/src/components/footer/` — Config-driven footer variant components
  - `FooterMain.tsx`
  - `FooterBottomBar.tsx`
  - `BrandingColumn.tsx`
  - `NavColumn.tsx`
  - `NewsletterBlock.tsx`
  - `ContactBlock.tsx`

### Modified Files
- `ConvexPress-Admin/packages/backend/convex/schema/settings.ts` — Add "header" and "footer" sections
- `ConvexPress-Admin/packages/backend/convex/settings/defaults.ts` — Add HEADER_DEFAULTS + FOOTER_DEFAULTS
- `ConvexPress-Admin/packages/backend/convex/settings/validators.ts` — Add header/footer validators
- `ConvexPress-Admin/packages/backend/convex/settings/validation.ts` — Add header/footer validation
- `ConvexPress-Admin/apps/web/src/components/layout/AdminSidebar.tsx` — Add Appearance section with Header, Footer, Menus, Layouts
- `ConvexPress-Website/apps/web/src/components/layout/SiteHeader.tsx` — Refactor to config-driven
- `ConvexPress-Website/apps/web/src/components/layout/SiteFooter.tsx` — Refactor to config-driven
- `ConvexPress-Website/apps/web/src/routes/_marketing.tsx` — Conditional header/footer rendering for per-page hide
