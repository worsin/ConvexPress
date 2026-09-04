/**
 * Render a lucide icon from its kebab-case name at runtime.
 *
 * Dashboard registry pages, menu items, and widgets store icons as lucide
 * names (e.g. "shopping-bag") so the website can resolve them. The admin
 * renders the same names through lucide's code-split `DynamicIcon`, which
 * loads one small chunk per icon on first use.
 */

import { CircleDashed, type LucideProps } from "lucide-react";
import { DynamicIcon, iconNames, type IconName } from "lucide-react/dynamic";

const ICON_NAME_SET: ReadonlySet<string> = new Set<string>(iconNames);

/** Every lucide icon name, kebab-case, sorted — feeds the icon picker. */
export const LUCIDE_ICON_NAMES: readonly string[] = [...iconNames].sort();

export function isLucideIconName(name: string | undefined | null): name is IconName {
  return typeof name === "string" && ICON_NAME_SET.has(name);
}

interface LucideDynamicIconProps extends Omit<LucideProps, "ref"> {
  /** Kebab-case lucide name; unknown names render the fallback. */
  name: string | undefined | null;
  /** Rendered when `name` is empty or unknown. Defaults to a dashed circle. */
  fallback?: React.ReactNode;
}

export function LucideDynamicIcon({ name, fallback, className, ...props }: LucideDynamicIconProps) {
  if (!isLucideIconName(name)) {
    if (fallback !== undefined) return <>{fallback}</>;
    return <CircleDashed className={className} aria-hidden="true" {...props} />;
  }
  return (
    <DynamicIcon
      name={name}
      className={className}
      fallback={() => <span className={className} aria-hidden="true" />}
      {...props}
    />
  );
}
