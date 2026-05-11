/**
 * @deprecated 2026-05-11 — Legacy in-admin Theme/Template Builder.
 *
 * STATUS:  Frozen. Hidden from active nav. Do NOT extend or fix issues here.
 * REASON:  A pre-built section enum + preset theme picker limits what each
 *          site can look like. Replaced by AI-generated React components,
 *          one per route, generated per site by the design:* skill kit.
 * REPLACEMENT:  See ConvexPress-Website/design-kit/README.md
 * REMOVAL:  Safe to delete once at least one site is fully shipped via the
 *           skill kit and nothing else references this file.
 */
/**
 * HeaderPreview - Real-time visual preview of header configuration.
 *
 * Renders a mock header inside a bordered preview container,
 * reflecting all enabled sections and layout options from HeaderConfig.
 */

import {
  Search,
  Moon,
  Sun,
  Menu,
  ChevronDown,
  User,
  Mail,
  Phone,
  Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { HeaderConfig } from "./types";

interface HeaderPreviewProps {
  config: HeaderConfig;
}

// ─── Mock nav items ─────────────────────────────────

const NAV_ITEMS = ["Home", "Blog", "About", "Services", "Contact"];

// ─── Sub-Components ─────────────────────────────────

function TopBarPreview({ config }: { config: HeaderConfig }) {
  if (!config.topBar.enabled) return null;

  function renderContent(slot: "contact" | "announcement" | "social" | "none") {
    switch (slot) {
      case "contact":
        return (
          <div className="flex items-center gap-3 text-[10px]">
            {config.topBar.email && (
              <span className="flex items-center gap-1">
                <Mail className="size-2.5" />
                {config.topBar.email || "email@site.com"}
              </span>
            )}
            {config.topBar.phone && (
              <span className="flex items-center gap-1">
                <Phone className="size-2.5" />
                {config.topBar.phone || "(555) 000-0000"}
              </span>
            )}
            {!config.topBar.email && !config.topBar.phone && (
              <span className="flex items-center gap-1">
                <Mail className="size-2.5" />
                email@site.com
              </span>
            )}
          </div>
        );
      case "announcement":
        return (
          <span className="text-[10px] font-medium">
            {config.topBar.announcementText || "Announcement text here"}
          </span>
        );
      case "social":
        return (
          <div className="flex items-center gap-2">
            {[Globe, Globe, Globe].map((Icon, i) => (
              <Icon key={i} className="size-2.5" />
            ))}
          </div>
        );
      case "none":
      default:
        return null;
    }
  }

  return (
    <div className="flex items-center justify-between px-3 py-1 bg-foreground/5 border-b border-foreground/10 text-muted-foreground">
      <div>{renderContent(config.topBar.leftContent)}</div>
      <div>{renderContent(config.topBar.rightContent)}</div>
    </div>
  );
}

function LogoPreview({ config }: { config: HeaderConfig }) {
  if (!config.logo.enabled) return null;

  const sizeClasses = {
    small: "gap-1.5",
    medium: "gap-2",
    large: "gap-2.5",
  };

  const logoSizeClasses = {
    small: "size-5",
    medium: "size-6",
    large: "size-8",
  };

  const titleSizeClasses = {
    small: "text-xs",
    medium: "text-sm",
    large: "text-base",
  };

  return (
    <div className={cn("flex items-center", sizeClasses[config.logo.size])}>
      {config.logo.showImage && (
        <div
          className={cn(
            "rounded bg-primary/20 flex items-center justify-center",
            logoSizeClasses[config.logo.size],
          )}
        >
          <Globe
            className={cn(
              "text-primary",
              config.logo.size === "small"
                ? "size-3"
                : config.logo.size === "large"
                  ? "size-5"
                  : "size-3.5",
            )}
          />
        </div>
      )}
      <div className="flex flex-col">
        {config.logo.showTitle && (
          <span
            className={cn(
              "font-semibold text-foreground leading-tight",
              titleSizeClasses[config.logo.size],
            )}
          >
            MySite
          </span>
        )}
        {config.logo.showTagline && (
          <span className="text-[9px] text-muted-foreground leading-tight">
            Your tagline here
          </span>
        )}
      </div>
    </div>
  );
}

function NavPreview({ config }: { config: HeaderConfig }) {
  if (!config.navigation.enabled) return null;

  const styleClasses = {
    inline:
      "text-[10px] text-muted-foreground hover:text-foreground transition-colors",
    pills:
      "text-[10px] px-2 py-0.5 rounded-full bg-foreground/5 text-muted-foreground",
    underline:
      "text-[10px] text-muted-foreground border-b border-transparent hover:border-foreground",
  };

  return (
    <nav className="flex items-center gap-1.5">
      {NAV_ITEMS.map((item) => (
        <span key={item} className={styleClasses[config.navigation.style]}>
          {item}
        </span>
      ))}
    </nav>
  );
}

function SearchPreview({ config }: { config: HeaderConfig }) {
  if (!config.search.enabled) return null;

  switch (config.search.variant) {
    case "inline":
      return (
        <div className="flex items-center gap-1.5 rounded-full bg-foreground/5 px-2 py-1">
          <Search className="size-2.5 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground">
            {config.search.placeholder || "Search..."}
          </span>
        </div>
      );
    case "expandable":
      return (
        <div className="flex items-center gap-1 rounded-full bg-foreground/5 px-2 py-1">
          <Search className="size-2.5 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground w-12">
            {config.search.placeholder || "Search..."}
          </span>
        </div>
      );
    case "icon":
    default:
      return <Search className="size-3.5 text-muted-foreground" />;
  }
}

function CtaPreview({ config }: { config: HeaderConfig }) {
  if (!config.cta.enabled) return null;

  const styleClasses = {
    filled: "bg-primary text-primary-foreground",
    outline: "border border-primary text-primary",
    ghost: "text-primary",
  };

  return (
    <span
      className={cn(
        "text-[10px] px-2.5 py-1 rounded-full font-medium",
        styleClasses[config.cta.style],
      )}
    >
      {config.cta.label || "Get Started"}
    </span>
  );
}

function UserMenuPreview({ config }: { config: HeaderConfig }) {
  if (!config.userMenu.enabled) return null;

  return (
    <div className="flex items-center gap-1.5">
      <div className="size-5 rounded-full bg-foreground/10 flex items-center justify-center">
        <User className="size-3 text-muted-foreground" />
      </div>
      {config.userMenu.loggedInDisplay !== "avatar-only" && (
        <ChevronDown className="size-2.5 text-muted-foreground" />
      )}
    </div>
  );
}

function DarkModePreview({ config }: { config: HeaderConfig }) {
  if (!config.darkModeToggle.enabled) return null;

  if (config.darkModeToggle.variant === "switch") {
    return (
      <div className="flex items-center gap-1">
        <Sun className="size-2.5 text-muted-foreground" />
        <div className="w-6 h-3 rounded-full bg-foreground/10 relative">
          <div className="absolute left-0.5 top-0.5 size-2 rounded-full bg-primary" />
        </div>
        <Moon className="size-2.5 text-muted-foreground" />
      </div>
    );
  }

  return <Moon className="size-3.5 text-muted-foreground" />;
}

function MobileMenuIcon() {
  return <Menu className="size-3.5 text-muted-foreground" />;
}

// ─── Layout Renderers ───────────────────────────────

function StandardLayout({ config }: { config: HeaderConfig }) {
  return (
    <div className="flex items-center justify-between w-full">
      <LogoPreview config={config} />
      <NavPreview config={config} />
      <div className="flex items-center gap-2.5">
        <SearchPreview config={config} />
        <CtaPreview config={config} />
        <UserMenuPreview config={config} />
        <DarkModePreview config={config} />
        <MobileMenuIcon />
      </div>
    </div>
  );
}

function CenteredLayout({ config }: { config: HeaderConfig }) {
  return (
    <div className="flex flex-col items-center gap-2 w-full">
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-2.5">
          <SearchPreview config={config} />
        </div>
        <LogoPreview config={config} />
        <div className="flex items-center gap-2.5">
          <CtaPreview config={config} />
          <UserMenuPreview config={config} />
          <DarkModePreview config={config} />
          <MobileMenuIcon />
        </div>
      </div>
      <NavPreview config={config} />
    </div>
  );
}

function SplitLayout({ config }: { config: HeaderConfig }) {
  const midpoint = Math.ceil(NAV_ITEMS.length / 2);
  const leftItems = NAV_ITEMS.slice(0, midpoint);
  const rightItems = NAV_ITEMS.slice(midpoint);

  const styleClasses = {
    inline: "text-[10px] text-muted-foreground",
    pills:
      "text-[10px] px-2 py-0.5 rounded-full bg-foreground/5 text-muted-foreground",
    underline: "text-[10px] text-muted-foreground border-b border-transparent",
  };

  return (
    <div className="flex items-center justify-between w-full">
      <nav className="flex items-center gap-1.5">
        {config.navigation.enabled &&
          leftItems.map((item) => (
            <span
              key={item}
              className={styleClasses[config.navigation.style]}
            >
              {item}
            </span>
          ))}
      </nav>
      <LogoPreview config={config} />
      <div className="flex items-center gap-2.5">
        {config.navigation.enabled && (
          <nav className="flex items-center gap-1.5">
            {rightItems.map((item) => (
              <span
                key={item}
                className={styleClasses[config.navigation.style]}
              >
                {item}
              </span>
            ))}
          </nav>
        )}
        <SearchPreview config={config} />
        <CtaPreview config={config} />
        <UserMenuPreview config={config} />
        <DarkModePreview config={config} />
        <MobileMenuIcon />
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────

export function HeaderPreview({ config }: HeaderPreviewProps) {
  const heightClasses = {
    compact: "px-3 py-1.5",
    normal: "px-4 py-2.5",
    tall: "px-4 py-4",
  };

  const bgClasses = {
    solid: "bg-card",
    transparent: "bg-transparent",
    glass: "bg-card/60 backdrop-blur-sm",
  };

  const borderClasses = {
    subtle: "border-b border-border/50",
    bold: "border-b-2 border-border",
    none: "",
    shadow: "shadow-md",
  };

  return (
    <div className="rounded-lg border border-border overflow-hidden bg-muted/30">
      {/* Top Bar */}
      <TopBarPreview config={config} />

      {/* Main Header */}
      <div
        className={cn(
          bgClasses[config.layout.background],
          borderClasses[config.layout.bottomBorder],
          heightClasses[config.layout.height],
        )}
      >
        {config.layout.style === "standard" && (
          <StandardLayout config={config} />
        )}
        {config.layout.style === "centered" && (
          <CenteredLayout config={config} />
        )}
        {config.layout.style === "split" && <SplitLayout config={config} />}
      </div>
    </div>
  );
}
