/** Aster House · home — an authored cover, followed by the site's own story. */
import { ArrowDown, ArrowUpRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useSiteIdentity } from "@/hooks/layout/useSiteIdentity";
import type { HomeSurfaceData } from "@/templates/packs/core/surfaces/home";
import type { SurfaceProps } from "@/templates/sdk/types";
import { Container, EmptyState, PostCard, Prose, SectionHeading, SkeletonBlock, SmallCaps } from "../parts";
import { Blocks } from "./page";

export default function AsterHome({ data }: SurfaceProps<HomeSurfaceData>) {
  const identity = useSiteIdentity();
  const { frontPage, latestPosts } = data;
  if (frontPage === undefined) return <Container className="space-y-8 py-16"><SkeletonBlock className="h-32 w-3/4" /><SkeletonBlock className="aspect-[21/10]" /></Container>;
  if (!frontPage) return <Container as="div" className="space-y-16 py-16"><SectionHeading level={1} eyebrow={identity?.title} title={identity?.tagline || "The journal"} />{latestPosts?.length ? <div className="grid gap-12 md:grid-cols-2">{latestPosts.map((post, index) => <PostCard key={post._id} post={post} variant={index === 0 ? "feature" : "default"} className={index === 0 ? "md:col-span-2" : ""} />)}</div> : <EmptyState title="The next story starts here." />}</Container>;
  const firstBlock = frontPage.contentMode === "blocks" ? frontPage.blocks?.[0]?.name : null;
  const authoredHero = firstBlock && ["core/hero", "core/hero-split", "core/hero-text-only", "blocks/page-banner"].includes(firstBlock);
  return <div data-pack="aster-house" data-slot="aster-home">
    {!authoredHero && <>
      <Container className="pb-10 pt-10 md:pb-14 md:pt-16">
        <div className="mb-7 flex items-center justify-between border-t border-border pt-4"><SmallCaps>{identity?.tagline || identity?.title}</SmallCaps><span aria-hidden="true" className="text-3xl text-primary">✳</span></div>
        <div className="grid gap-8 md:grid-cols-[minmax(0,4fr)_minmax(0,1fr)] md:items-end">
          <h1 className="max-w-[12ch] font-display text-[clamp(4rem,8.5vw,9.75rem)] leading-[0.86] tracking-[-0.045em] text-foreground">{frontPage.title}</h1>
          <div className="flex flex-col items-start gap-6 border-l border-primary pl-5 md:pb-3">
            {frontPage.excerpt && <p className="text-sm leading-7 text-muted-foreground">{frontPage.excerpt}</p>}
            <a href="#aster-story" className="inline-flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">Explore <ArrowDown className="size-4" aria-hidden="true" /></a>
          </div>
        </div>
      </Container>
      {frontPage.featuredImageUrl && <figure className="relative mx-5 overflow-hidden bg-muted sm:mx-10 lg:mx-16">
        <img src={frontPage.featuredImageUrl} alt={frontPage.featuredImageAlt || frontPage.title} className="h-[55vh] min-h-80 w-full object-cover md:h-[65vh]" loading="eager" fetchPriority="high" />
        <figcaption className="absolute bottom-0 left-0 flex max-w-[80%] items-center gap-5 bg-background px-6 py-4 text-xs text-foreground"><span className="font-display text-lg">{identity?.title}</span><span className="h-px w-10 bg-primary" aria-hidden="true" /><span className="text-[9px] uppercase tracking-[0.2em]">{frontPage.featuredImageAlt || "In the field"}</span></figcaption>
      </figure>}
    </>}
    <div id="aster-story" style={{ scrollMarginTop: "calc(var(--site-header-offset, 0px) + 1rem)" }}>{frontPage.contentMode === "blocks" ? <Blocks page={frontPage} /> : <Prose className="px-5 py-16"><Blocks page={frontPage} /></Prose>}</div>
    {frontPage.children && frontPage.children.length > 0 && <Container className="py-20"><nav aria-label="Explore more" className="divide-y divide-border border-y border-border">{frontPage.children.map((page, index) => <Link key={page._id} to={`/page${page.path}` as any} className="group flex items-center justify-between gap-6 py-8 text-foreground"><span className="text-xs text-primary">{String(index + 1).padStart(2, "0")}</span><span className="flex-1 font-display text-3xl md:text-5xl">{page.title}</span><ArrowUpRight className="size-7 transition-transform group-hover:-translate-y-1 group-hover:translate-x-1" aria-hidden="true" /></Link>)}</nav></Container>}
  </div>;
}
