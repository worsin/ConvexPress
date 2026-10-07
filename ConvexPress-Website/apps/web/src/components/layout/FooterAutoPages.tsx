import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";

interface PageNode {
  _id: string;
  title: string;
  path: string;
  children: PageNode[];
}

/** Published, discoverable pages in menu order, including nested destinations. */
export function FooterAutoPages({ heading }: { heading?: string }) {
  const { data } = useSuspenseQuery(convexQuery(api.pages.queries.getTree, { status: "publish" }));
  const flatten = (nodes: PageNode[]): PageNode[] => nodes.flatMap(node => [node, ...flatten(node.children)]);
  const pages = flatten(data);
  if (!pages.length) return null;
  return (
    <nav data-slot="footer-nav" aria-label={heading || "Pages"}>
      {heading && <h3 className="mb-4 text-sm font-semibold text-foreground">{heading}</h3>}
      <ul className="flex flex-col gap-2">
        {pages.map(page => <li key={page._id}><Link to={page.path} className="text-sm text-muted-foreground transition-colors hover:text-foreground">{page.title}</Link></li>)}
      </ul>
    </nav>
  );
}
