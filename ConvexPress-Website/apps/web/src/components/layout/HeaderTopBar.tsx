import { Mail, Phone } from "lucide-react";
import type { HeaderConfig } from "@/lib/layout/types";
import { cn } from "@/lib/utils";
import { SocialLinks } from "./SocialLinks";

/** Preserve both authored slots, including when they select the same content. */
export function HeaderTopBar({ config, className, icons = true }: {
  config: HeaderConfig["topBar"];
  className?: string;
  icons?: boolean;
}) {
  return (
    <div data-slot="header-top-bar" className={cn("grid min-w-0 grid-cols-2 items-center gap-3 py-1.5", className)}>
      <div data-slot="top-bar-left" data-customize="header.topBar.leftContent" className="min-w-0 text-left">
        <Content type={config.leftContent} config={config} icons={icons} />
      </div>
      <div data-slot="top-bar-right" data-customize="header.topBar.rightContent" className="min-w-0 text-right [&>div]:justify-end">
        <Content type={config.rightContent} config={config} icons={icons} />
      </div>
    </div>
  );
}

function Content({ type, config, icons }: {
  type: HeaderConfig["topBar"]["leftContent"];
  config: HeaderConfig["topBar"];
  icons: boolean;
}) {
  if (type === "announcement" && config.announcementText) {
    return <p className="min-w-0 [overflow-wrap:anywhere]">{config.announcementText}</p>;
  }
  if (type === "social") return <SocialLinks iconSize="sm" className="flex-wrap" />;
  if (type !== "contact") return null;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 normal-case tracking-normal">
      {config.email && (
        <a href={`mailto:${config.email}`} className="inline-flex min-w-0 max-w-full items-center gap-1.5 transition-colors hover:text-foreground">
          {icons && <Mail className="size-3 shrink-0" aria-hidden="true" />}
          <span className="min-w-0 [overflow-wrap:anywhere]">{config.email}</span>
        </a>
      )}
      {config.phone && (
        <a href={`tel:${config.phone}`} className="inline-flex min-w-0 max-w-full items-center gap-1.5 transition-colors hover:text-foreground">
          {icons && <Phone className="size-3 shrink-0" aria-hidden="true" />}
          <span className="min-w-0 [overflow-wrap:anywhere]">{config.phone}</span>
        </a>
      )}
    </div>
  );
}
