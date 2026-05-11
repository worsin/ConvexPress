/**
 * PageChildrenList - Displays child pages of the current page
 *
 * Renders a list of direct child pages below the page content.
 * Used for parent pages that serve as section landing pages
 * (e.g., "Services" page listing its sub-pages).
 */

import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChildPage {
  _id: string;
  title: string;
  slug: string;
  path: string;
}

interface PageChildrenListProps {
  children: ChildPage[];
  className?: string;
}

export function PageChildrenList({ children, className }: PageChildrenListProps) {
  if (!children || children.length === 0) {
    return null;
  }

  return (
    <nav
      data-slot="page-children-list"
      className={cn("border-t border-border pt-6", className)}
    >
      <h2 className="mb-3 text-sm font-semibold">Pages in this section</h2>
      <ul className="flex flex-col gap-1">
        {children.map((child) => (
          <li key={child._id}>
	            <Link
	              to={`/page${child.path}`}
	              className="group flex items-center gap-2 py-2 text-xs transition-colors hover:text-primary"
            >
              <ChevronRight className="size-3 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              {child.title}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
