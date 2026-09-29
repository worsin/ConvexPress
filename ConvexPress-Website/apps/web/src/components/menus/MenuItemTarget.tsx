import { Link } from "@tanstack/react-router";
import type { HTMLAttributes } from "react";
import type { ResolvedMenuItem } from "@/lib/layout/types";
import { cn } from "@/lib/utils";

type Props = HTMLAttributes<HTMLElement> & {
  item: ResolvedMenuItem;
  target?: string;
  rel?: string;
  activeProps?: Pick<HTMLAttributes<HTMLElement>, "className" | "aria-current">;
  separatorOrientation?: "horizontal" | "vertical";
  onToggle?: () => void;
};

/** The resolved item kind owns its semantics, including when its URL is absent.
 * Heading disclosure is optional; static headings never acquire a dummy link.
 * Separator labels are editor descriptions, not visitor navigation text. */
export function MenuItemTarget({ item, separatorOrientation = "horizontal", onToggle, activeProps, children, ...props }: Props) {
  if (item.isOrphaned) return null;
  if (item.type === "separator") {
    return separatorOrientation === "vertical"
      ? <span role="separator" aria-orientation="vertical" className={cn("mx-2 block h-5 shrink-0 border-l border-border", item.cssClasses)} />
      : <hr className={cn("my-2 w-full border-border", item.cssClasses)} />;
  }
  const content = children ?? item.label;
  if (item.type === "heading") {
    return onToggle
      ? <button type="button" className={props.className} style={props.style} onClick={onToggle} onKeyDown={props.onKeyDown} aria-expanded={props["aria-expanded"]}>{content}</button>
      : <span className={props.className} style={props.style}>{content}</span>;
  }
  const linkProps = { target: item.target, rel: item.rel, ...props };
  return /^https?:\/\//i.test(item.url)
    ? <a href={item.url} {...linkProps}>{content}</a>
    : <Link to={item.url} activeProps={activeProps} {...linkProps}>{content}</Link>;
}
