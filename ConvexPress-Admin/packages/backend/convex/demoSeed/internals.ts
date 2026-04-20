// @ts-nocheck
import { ConvexError, v } from "convex/values";
import { internalMutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { getDefaults } from "../settings/defaults";
import { DEFAULT_MENU_LOCATIONS } from "../menus/validators";

type AssetMap = Record<string, { mediaId: Id<"media">; url: string; altText?: string }>;
type AnyCtx = any;

type InlineNode = {
  type: "text";
  text: string;
};

type BlockNode = Record<string, unknown>;

function doc(content: BlockNode[]) {
  return JSON.stringify({
    type: "doc",
    content,
  });
}

function text(value: string): InlineNode {
  return { type: "text", text: value };
}

function paragraph(value: string): BlockNode {
  return {
    type: "paragraph",
    content: [text(value)],
  };
}

function heading(level: 1 | 2 | 3, value: string): BlockNode {
  return {
    type: "heading",
    attrs: { level },
    content: [text(value)],
  };
}

function image(src: string, alt: string, caption?: string): BlockNode {
  return {
    type: "image",
    attrs: {
      src,
      alt,
      caption,
    },
  };
}

function button(textValue: string, url: string, variant: "primary" | "secondary" | "outline" = "primary", alignment: "left" | "center" | "right" = "left"): BlockNode {
  return {
    type: "button",
    attrs: {
      text: textValue,
      url,
      variant,
      alignment,
    },
  };
}

function divider(style: "solid" | "dashed" | "dotted" | "double" = "solid"): BlockNode {
  return {
    type: "divider",
    attrs: { style },
  };
}

function spacer(height = 32): BlockNode {
  return {
    type: "spacer",
    attrs: { height },
  };
}

function bulletList(items: string[]): BlockNode {
  return {
    type: "bulletList",
    content: items.map((item) => ({
      type: "listItem",
      content: [paragraph(item)],
    })),
  };
}

function callout(type: "info" | "warning" | "error" | "success", lines: string[]): BlockNode {
  return {
    type: "callout",
    attrs: { type },
    content: lines.map((line) => paragraph(line)),
  };
}

function columns(...columnBlocks: BlockNode[][]): BlockNode {
  return {
    type: "columns",
    attrs: { count: columnBlocks.length },
    content: columnBlocks.map((blocks) => ({
      type: "column",
      content: blocks,
    })),
  };
}

function gallery(items: Array<{ src: string; alt: string; caption?: string }>): BlockNode {
  return {
    type: "gallery",
    attrs: { columns: Math.min(3, Math.max(2, items.length)) },
    content: items.map((item) => image(item.src, item.alt, item.caption)),
  };
}

async function getSeedUserId(ctx: AnyCtx): Promise<Id<"users">> {
  const users = await ctx.db.query("users").collect();
  const activeUser = users.find((user: { status?: string }) => user.status === "active") ?? users[0];

  if (!activeUser) {
    throw new ConvexError({
      code: "NOT_FOUND",
      message: "No active user found for demo seeding",
    });
  }

  return activeUser._id;
}

async function upsertSettingsSection(
  ctx: AnyCtx,
  section: string,
  values: Record<string, unknown>,
  userId: Id<"users">,
) {
  const defaults = getDefaults(section as Parameters<typeof getDefaults>[0]);
  const existing = await ctx.db
    .query("settings")
    .withIndex("by_section", (q: any) => q.eq("section", section))
    .unique();

  const nextValues = {
    ...defaults,
    ...(existing?.values ?? {}),
    ...values,
  };

  if (existing) {
    await ctx.db.patch("settings", existing._id, {
      values: nextValues,
      updatedAt: Date.now(),
      updatedBy: userId,
    });
    return existing._id;
  }

  return await ctx.db.insert("settings", {
    section,
    values: nextValues,
    updatedAt: Date.now(),
    updatedBy: userId,
  });
}

async function ensureMenuLocations(
  ctx: AnyCtx,
) {
  const existingLocations = await ctx.db.query("menuLocations").collect();
  const bySlug = new Map(existingLocations.map((location: { slug: string; _id: Id<"menuLocations"> }) => [location.slug, location]));
  const now = Date.now();

  for (const location of DEFAULT_MENU_LOCATIONS) {
    const existing = bySlug.get(location.slug);
    if (existing) {
      await ctx.db.patch("menuLocations", existing._id, {
        name: location.name,
        description: location.description,
        updatedAt: now,
      });
      continue;
    }

    await ctx.db.insert("menuLocations", {
      slug: location.slug,
      name: location.name,
      description: location.description,
      createdAt: now,
      updatedAt: now,
    });
  }
}

async function clearExistingContent(
  ctx: AnyCtx,
) {
  const posts = await ctx.db
    .query("posts")
    .withIndex("by_type_status", (q: any) => q.eq("type", "post"))
    .take(10_000);
  const pages = await ctx.db
    .query("posts")
    .withIndex("by_type_status", (q: any) => q.eq("type", "page"))
    .take(10_000);

  const contentIds = new Set<Id<"posts">>([...posts, ...pages].map((entry: { _id: Id<"posts"> }) => entry._id));
  const termRelationships = await ctx.db.query("termRelationships").collect();
  const revisions = await ctx.db.query("revisions").collect();
  const postMeta = await ctx.db.query("postMeta").collect();
  const comments = await ctx.db.query("comments").collect();
  const commentIdsToDelete = new Set(
    comments
      .filter((comment: { postId: Id<"posts"> }) => contentIds.has(comment.postId))
      .map((comment: { _id: Id<"comments"> }) => comment._id),
  );
  const commentMeta = await ctx.db.query("commentMeta").collect();
  const commentLikes = await ctx.db.query("commentLikes").collect();
  const commentFlags = await ctx.db.query("commentFlags").collect();
  const menuItems = await ctx.db.query("menuItems").collect();
  const menus = await ctx.db.query("menus").collect();
  const menuLocations = await ctx.db.query("menuLocations").collect();
  const terms = await ctx.db.query("terms").collect();

  for (const relationship of termRelationships) {
    if (contentIds.has(relationship.postId)) {
      await ctx.db.delete("termRelationships", relationship._id);
    }
  }

  for (const meta of postMeta) {
    if (contentIds.has(meta.postId)) {
      await ctx.db.delete("postMeta", meta._id);
    }
  }

  for (const revision of revisions) {
    if (contentIds.has(revision.parentId)) {
      await ctx.db.delete("revisions", revision._id);
    }
  }

  for (const flag of commentFlags) {
    if (commentIdsToDelete.has(flag.commentId)) {
      await ctx.db.delete("commentFlags", flag._id);
    }
  }

  for (const like of commentLikes) {
    if (commentIdsToDelete.has(like.commentId)) {
      await ctx.db.delete("commentLikes", like._id);
    }
  }

  for (const meta of commentMeta) {
    if (commentIdsToDelete.has(meta.commentId)) {
      await ctx.db.delete("commentMeta", meta._id);
    }
  }

  for (const comment of comments) {
    if (commentIdsToDelete.has(comment._id)) {
      await ctx.db.delete("comments", comment._id);
    }
  }

  for (const item of menuItems) {
    await ctx.db.delete("menuItems", item._id);
  }

  for (const menu of menus) {
    await ctx.db.delete("menus", menu._id);
  }

  for (const location of menuLocations) {
    await ctx.db.patch("menuLocations", location._id, {
      menuId: undefined,
      updatedAt: Date.now(),
    });
  }

  for (const term of terms) {
    await ctx.db.delete("terms", term._id);
  }

  for (const entry of [...posts, ...pages]) {
    await ctx.db.delete("posts", entry._id);
  }
}

function buildHomePageContent(assets: AssetMap) {
  return doc([
    heading(2, "Editorial websites for makers, kitchens, and modern brands"),
    paragraph("Lark & Ladle Studio helps food-led businesses publish with confidence. We shape strategy, stories, and visuals into a site that feels calm, current, and alive."),
    button("Explore services", "/page/services", "primary", "left"),
    button("Read the journal", "/blog", "outline", "left"),
    spacer(16),
    columns(
      [
        heading(3, "Editorial direction"),
        paragraph("Campaign concepts, launch narratives, and homepage positioning designed to feel intentional instead of generic."),
      ],
      [
        heading(3, "Content systems"),
        paragraph("Flexible page structures, reusable storytelling patterns, and publishing flows that keep teams moving without clutter."),
      ],
      [
        heading(3, "Visual polish"),
        paragraph("Photography, pacing, and block composition tuned so every page feels custom, not assembled from placeholders."),
      ],
    ),
    divider(),
    heading(2, "What a launch looks like"),
    gallery([
      {
        src: assets.home_hero.url,
        alt: assets.home_hero.altText ?? "Seasonal editorial table",
        caption: "An elevated homepage moment with warmth, texture, and space.",
      },
      {
        src: assets.services_studio.url,
        alt: assets.services_studio.altText ?? "Creative studio planning session",
        caption: "Strategic planning and positioning before the first page goes live.",
      },
      {
        src: assets.process_details.url,
        alt: assets.process_details.altText ?? "Styled kitchen details and notes",
        caption: "Story-rich details that help a brand feel lived-in and specific.",
      },
    ]),
    callout("success", [
      "Recent clients have used this same setup to launch editorial blogs, recipe libraries, seasonal campaigns, and customer education hubs.",
    ]),
    heading(2, "Built for ongoing publishing"),
    bulletList([
      "Pages for evergreen brand content and service detail",
      "Blog posts for campaigns, updates, and behind-the-scenes stories",
      "Menu-ready structure so navigation stays clean as the site grows",
      "Shared media library assets that can be reused across pages, posts, and recipes",
    ]),
  ]);
}

function buildHomePageSections(assets: AssetMap) {
  return [
    {
      id: "hero-home-seed",
      type: "hero",
      variant: "editorial",
      shell: { tone: "default", padding: "spacious", container: "wide" },
      data: {
        eyebrow: "Editorial websites for food-led brands",
        title: "A calm, polished homepage built from reusable sections",
        body:
          "Lark & Ladle Studio pairs strategy, content systems, and visual direction so a brand site feels designed from the first scroll. This homepage uses the new section composer instead of a one-off hardcoded layout.",
        primaryCtaLabel: "Explore services",
        primaryCtaUrl: "/page/services",
        secondaryCtaLabel: "Read the journal",
        secondaryCtaUrl: "/blog",
        mediaId: assets.home_hero.mediaId,
      },
    },
    {
      id: "features-home-seed",
      type: "feature-grid",
      shell: { tone: "muted", padding: "normal", container: "content" },
      data: {
        eyebrow: "What the system is doing",
        heading: "Structured sections without a bloated page builder",
        body:
          "Each section has a job, a layout shell, and constrained fields. Editors can reorder the page and fill in content without redesigning every screen.",
        items: [
          {
            title: "Template-aware editing",
            description: "Homepage templates expose section controls instead of the generic page body.",
          },
          {
            title: "Shared media system",
            description: "Section images pull from the same Media Center used everywhere else in ConvexPress.",
          },
          {
            title: "Site-ready output",
            description: "The public site renders the stored section stack directly, so the design system stays consistent.",
          },
        ],
      },
    },
    {
      id: "story-home-seed",
      type: "story-split",
      shell: { tone: "default", padding: "normal", container: "wide" },
      data: {
        eyebrow: "How this helps",
        heading: "Build pages in sections, then keep reusing the pattern",
        body:
          "This is the bridge between rigid templates and a full builder. You define the allowed sections, choose their order, and let the site render a polished composition that still feels custom.",
        ctaLabel: "See the process",
        ctaUrl: "/page/process",
        mediaId: assets.services_studio.mediaId,
      },
    },
    {
      id: "testimonials-home-seed",
      type: "testimonial-band",
      shell: { tone: "muted", padding: "normal", container: "wide" },
      data: {
        eyebrow: "Studio notes",
        heading: "The best part is that the layout stays clean as content grows",
        body:
          "These are placeholder testimonials, but they show the exact kind of proof section the composer can keep turning out across sites.",
        testimonials: [
          {
            quote: "We finally had a homepage that felt paced and editorial instead of stacked with random blocks.",
            name: "Mara Ellison",
            role: "Founder, Cedar Table",
          },
          {
            quote: "The structure gave us enough control to launch quickly without turning the CMS into a design tool.",
            name: "Jonas Pike",
            role: "Creative Director, Field Journal",
          },
        ],
      },
    },
    {
      id: "cta-home-seed",
      type: "cta-band",
      shell: { tone: "contrast", padding: "normal", container: "content" },
      data: {
        eyebrow: "Next step",
        heading: "Use the admin to swap templates, reorder sections, and keep building",
        body:
          "This seeded homepage is meant to exercise the new system. From here, you can add more section families and make them available across future sites.",
        primaryCtaLabel: "Open contact page",
        primaryCtaUrl: "/page/contact",
        secondaryCtaLabel: "Browse articles",
        secondaryCtaUrl: "/blog",
      },
    },
  ];
}

function buildAboutPageContent(assets: AssetMap) {
  return doc([
    heading(2, "A studio built around clarity, appetite, and story"),
    paragraph("Lark & Ladle started as a tiny editorial practice for food founders who wanted more than a brochure site. The work grew into launch strategy, content systems, and ongoing publishing support."),
    image(assets.about_studio.url, assets.about_studio.altText ?? "Founder working in a bright studio", "A calm studio environment designed for thoughtful editorial work."),
    heading(3, "What we value"),
    bulletList([
      "Clear voice before clever copy",
      "Photography that supports the narrative instead of decorating it",
      "Flexible systems that make future content easier, not harder",
    ]),
    callout("info", [
      "This demo site is seeded entirely from ConvexPress data, including pages, posts, menus, settings, and media.",
    ]),
  ]);
}

function buildServicesPageContent(assets: AssetMap) {
  return doc([
    heading(2, "Services shaped for content-led brands"),
    paragraph("We design launch-ready websites for businesses that need both editorial presence and operational clarity."),
    columns(
      [
        image(assets.services_studio.url, assets.services_studio.altText ?? "Brand workshop scene"),
        heading(3, "Brand storytelling"),
        paragraph("Messaging architecture, homepage copy direction, and content angles that translate expertise into confidence."),
      ],
      [
        image(assets.services_kitchen.url, assets.services_kitchen.altText ?? "Styled food preparation"),
        heading(3, "Recipe and content systems"),
        paragraph("Recipe workflows, media planning, and publishing structures that make repeatable content easier to manage."),
      ],
      [
        image(assets.services_journal.url, assets.services_journal.altText ?? "Editorial desk with printed layouts"),
        heading(3, "Ongoing editorial support"),
        paragraph("Campaign pages, blog programming, and launch support that keeps the site feeling current after day one."),
      ],
    ),
    spacer(12),
    button("Start a project", "/page/contact", "secondary", "left"),
  ]);
}

function buildProcessPageContent(assets: AssetMap) {
  return doc([
    heading(2, "A process that keeps momentum without sacrificing taste"),
    paragraph("The goal is a site that launches cleanly and stays easy to extend. Every phase is built to reduce rework."),
    image(assets.process_details.url, assets.process_details.altText ?? "Editorial process details"),
    heading(3, "Our four phases"),
    bulletList([
      "Discovery and positioning",
      "Content structure and page planning",
      "Photography and media preparation",
      "Launch build, review, and refinement",
    ]),
    callout("success", [
      "Because ConvexPress is data-driven, the same content can later power recipes, campaign pages, archives, and customer-facing features without rebuilding the front end.",
    ]),
  ]);
}

function buildContactPageContent(assets: AssetMap) {
  return doc([
    heading(2, "Let’s build something elegant and useful"),
    paragraph("We work with food brands, hospitality teams, and creative founders who need a publishing system that looks bespoke and stays maintainable."),
    image(assets.contact_studio.url, assets.contact_studio.altText ?? "Warm studio workspace with floral arrangement"),
    heading(3, "Typical engagements"),
    bulletList([
      "New website builds",
      "Recipe-library launches",
      "Seasonal campaign pages",
      "Content cleanup and restructuring",
    ]),
    paragraph("Use this page as a stand-in for your own inquiry flow, booking embed, or custom lead form."),
  ]);
}

function buildPostContent(title: string, intro: string, assets: AssetMap, imageKey: keyof AssetMap, checklist: string[]) {
  const asset = assets[imageKey];

  return doc([
    paragraph(intro),
    image(asset.url, asset.altText ?? title),
    heading(2, "Why it matters"),
    paragraph("A polished content system makes every new article easier to publish, easier to repurpose, and easier to trust."),
    heading(2, "What to keep in view"),
    bulletList(checklist),
    callout("info", [
      "This article is demo content seeded directly into ConvexPress to validate the full public publishing flow.",
    ]),
  ]);
}

export const createImportedMediaRecord = internalMutation({
  args: {
    storageId: v.id("_storage"),
    fileSize: v.number(),
    mimeType: v.string(),
    title: v.string(),
    fileName: v.string(),
    altText: v.optional(v.string()),
    caption: v.optional(v.string()),
    description: v.optional(v.string()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const uploadedBy = await getSeedUserId(ctx);
    const slugBase = args.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "demo-image";
    let slug = slugBase;
    let counter = 1;

    while (
      await ctx.db
        .query("media")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .unique()
    ) {
      counter += 1;
      slug = `${slugBase}-${counter}`;
    }

    const url = await ctx.storage.getUrl(args.storageId);
    if (!url) {
      throw new ConvexError({
        code: "STORAGE_ERROR",
        message: "Unable to resolve uploaded media URL",
      });
    }

    const mediaId = await ctx.db.insert("media", {
      title: args.title,
      fileName: args.fileName,
      slug,
      altText: args.altText,
      caption: args.caption,
      description: args.description,
      storageId: args.storageId,
      url,
      mimeType: args.mimeType,
      fileSize: args.fileSize,
      mediaType: "image",
      width: args.width,
      height: args.height,
      status: "active",
      uploadedBy,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return {
      mediaId,
      url,
      title: args.title,
    };
  },
});

export const seedMarketingSite = internalMutation({
  args: {
    assets: v.array(
      v.object({
        key: v.string(),
        mediaId: v.id("media"),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const authorId = await getSeedUserId(ctx);
    const assets: AssetMap = {};

    for (const asset of args.assets) {
      const media = await ctx.db.get("media", asset.mediaId);
      if (!media) {
        throw new ConvexError({
          code: "NOT_FOUND",
          message: `Media not found for asset key "${asset.key}"`,
        });
      }

      assets[asset.key] = {
        mediaId: media._id,
        url: media.url,
        altText: media.altText,
      };
    }

    await clearExistingContent(ctx);
    await ensureMenuLocations(ctx);

    const now = Date.now();

    const uncategorizedId = await ctx.db.insert("terms", {
      name: "Uncategorized",
      slug: "uncategorized",
      taxonomy: "category",
      count: 0,
      isDefault: true,
      description: "Default blog category",
      createdAt: now,
      updatedAt: now,
      createdBy: authorId.toString(),
    });

    const editorialId = await ctx.db.insert("terms", {
      name: "Editorial Strategy",
      slug: "editorial-strategy",
      taxonomy: "category",
      count: 0,
      isDefault: false,
      description: "Publishing systems, launch planning, and site structure.",
      createdAt: now,
      updatedAt: now,
      createdBy: authorId.toString(),
    });

    const seasonalId = await ctx.db.insert("terms", {
      name: "Seasonal Stories",
      slug: "seasonal-stories",
      taxonomy: "category",
      count: 0,
      isDefault: false,
      description: "Seasonal campaigns, menus, and visual storytelling.",
      createdAt: now,
      updatedAt: now,
      createdBy: authorId.toString(),
    });

    const behindScenesId = await ctx.db.insert("terms", {
      name: "Behind the Scenes",
      slug: "behind-the-scenes",
      taxonomy: "category",
      count: 0,
      isDefault: false,
      description: "Studio process, workflow, and production notes.",
      createdAt: now,
      updatedAt: now,
      createdBy: authorId.toString(),
    });

    const termsCount = new Map<Id<"terms">, number>([
      [uncategorizedId, 0],
      [editorialId, 0],
      [seasonalId, 0],
      [behindScenesId, 0],
    ]);

    const homePageId = await ctx.db.insert("posts", {
      type: "page",
      title: "Home",
      slug: "home",
      content: buildHomePageContent(assets),
      excerpt: "Editorial websites for makers, kitchens, and modern brands.",
      status: "publish",
      visibility: "public",
      authorId,
      featuredImageId: assets.home_hero.mediaId,
      commentStatus: "closed",
      menuOrder: 0,
      pageTemplate: "homepage",
      pageSections: buildHomePageSections(assets),
      path: "/",
      depth: 0,
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const aboutPageId = await ctx.db.insert("posts", {
      type: "page",
      title: "About",
      slug: "about",
      content: buildAboutPageContent(assets),
      excerpt: "Meet the studio and the publishing philosophy behind the work.",
      status: "publish",
      visibility: "public",
      authorId,
      featuredImageId: assets.about_studio.mediaId,
      commentStatus: "closed",
      menuOrder: 1,
      pageTemplate: "full-width",
      path: "/about",
      depth: 0,
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const servicesPageId = await ctx.db.insert("posts", {
      type: "page",
      title: "Services",
      slug: "services",
      content: buildServicesPageContent(assets),
      excerpt: "Content strategy, recipe systems, and editorial support.",
      status: "publish",
      visibility: "public",
      authorId,
      featuredImageId: assets.services_studio.mediaId,
      commentStatus: "closed",
      menuOrder: 2,
      pageTemplate: "full-width",
      path: "/services",
      depth: 0,
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const processPageId = await ctx.db.insert("posts", {
      type: "page",
      title: "Process",
      slug: "process",
      content: buildProcessPageContent(assets),
      excerpt: "A clear path from discovery through launch and refinement.",
      status: "publish",
      visibility: "public",
      authorId,
      featuredImageId: assets.process_details.mediaId,
      commentStatus: "closed",
      menuOrder: 3,
      pageTemplate: "full-width",
      path: "/process",
      depth: 0,
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const contactPageId = await ctx.db.insert("posts", {
      type: "page",
      title: "Contact",
      slug: "contact",
      content: buildContactPageContent(assets),
      excerpt: "Start a project or plan your next editorial launch.",
      status: "publish",
      visibility: "public",
      authorId,
      featuredImageId: assets.contact_studio.mediaId,
      commentStatus: "closed",
      menuOrder: 4,
      pageTemplate: "full-width",
      path: "/contact",
      depth: 0,
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const postDefinitions = [
      {
        title: "How to Build a Homepage That Feels Editorial, Not Corporate",
        slug: "build-a-homepage-that-feels-editorial",
        excerpt: "A practical look at structure, pacing, and visual rhythm for brands that publish.",
        featuredImageId: assets.post_editorial_home.mediaId,
        categoryId: editorialId,
        content: buildPostContent(
          "How to Build a Homepage That Feels Editorial, Not Corporate",
          "Great homepages don’t shout. They create pace, confidence, and a reason to keep reading.",
          assets,
          "post_editorial_home",
          [
            "Lead with one sharp promise instead of stacked slogans",
            "Use media intentionally so the page breathes",
            "Give each section a clear job before adding visual detail",
          ],
        ),
        isSticky: true,
        publishedAt: now - 1000 * 60 * 60 * 24 * 6,
      },
      {
        title: "Seasonal Launch Planning for Food Brands",
        slug: "seasonal-launch-planning-for-food-brands",
        excerpt: "What to prepare before a seasonal menu, campaign, or recipe drop goes live.",
        featuredImageId: assets.post_seasonal_launch.mediaId,
        categoryId: seasonalId,
        content: buildPostContent(
          "Seasonal Launch Planning for Food Brands",
          "The strongest seasonal launches feel effortless because the narrative, imagery, and publishing plan are aligned before the first announcement goes out.",
          assets,
          "post_seasonal_launch",
          [
            "Gather hero imagery early and reuse it across the launch arc",
            "Draft evergreen support pages before campaign traffic arrives",
            "Keep blog, menu, and recipe updates coordinated around a single story",
          ],
        ),
        publishedAt: now - 1000 * 60 * 60 * 24 * 12,
      },
      {
        title: "What We Keep on the Table During a Content Shoot",
        slug: "what-we-keep-on-the-table-during-a-content-shoot",
        excerpt: "A behind-the-scenes look at how we keep production days calm and editorially useful.",
        featuredImageId: assets.post_shoot_day.mediaId,
        categoryId: behindScenesId,
        content: buildPostContent(
          "What We Keep on the Table During a Content Shoot",
          "A good shoot day is half hospitality, half system design. The smoother the logistics, the better the images and the better the notes you bring back into the CMS.",
          assets,
          "post_shoot_day",
          [
            "Shot list, prop notes, and page destinations for every image",
            "A clear list of hero frames versus supporting detail shots",
            "Enough breathing room to capture texture, motion, and process",
          ],
        ),
        publishedAt: now - 1000 * 60 * 60 * 24 * 18,
      },
      {
        title: "Designing a Media Library That Stays Useful Over Time",
        slug: "designing-a-media-library-that-stays-useful-over-time",
        excerpt: "Naming, alt text, and organization choices that make future publishing easier.",
        featuredImageId: assets.post_media_library.mediaId,
        categoryId: editorialId,
        content: buildPostContent(
          "Designing a Media Library That Stays Useful Over Time",
          "The best media libraries don’t just store files. They preserve context so editors can move quickly months after a launch is finished.",
          assets,
          "post_media_library",
          [
            "Give every image a useful title before it lands in the library",
            "Write alt text for people first and SEO second",
            "Favor a small set of excellent reusable assets over endless near-duplicates",
          ],
        ),
        publishedAt: now - 1000 * 60 * 60 * 24 * 24,
      },
    ] as const;

    const createdPosts: Array<{ id: Id<"posts">; title: string; slug: string }> = [];

    for (const definition of postDefinitions) {
      const postId = await ctx.db.insert("posts", {
        type: "post",
        title: definition.title,
        slug: definition.slug,
        content: definition.content,
        excerpt: definition.excerpt,
        status: "publish",
        visibility: "public",
        authorId,
        featuredImageId: definition.featuredImageId,
        commentStatus: "open",
        commentCount: 0,
        isSticky: definition.isSticky ?? false,
        publishedAt: definition.publishedAt,
        createdAt: definition.publishedAt,
        updatedAt: definition.publishedAt,
      });

      await ctx.db.insert("termRelationships", {
        postId,
        termId: definition.categoryId,
      });

      termsCount.set(definition.categoryId, (termsCount.get(definition.categoryId) ?? 0) + 1);
      createdPosts.push({ id: postId, title: definition.title, slug: definition.slug });
    }

    for (const [termId, count] of termsCount.entries()) {
      await ctx.db.patch("terms", termId, {
        count,
        updatedAt: Date.now(),
      });
    }

    const mainMenuId = await ctx.db.insert("menus", {
      name: "Main Navigation",
      slug: "main-navigation",
      description: "Primary demo site navigation",
      autoAddPages: false,
      itemCount: 6,
      createdBy: authorId.toString(),
      createdAt: now,
      updatedAt: now,
    });

    const navItems = [
      { label: "Home", objectId: homePageId.toString(), url: "/" },
      { label: "About", objectId: aboutPageId.toString(), url: "/about" },
      { label: "Services", objectId: servicesPageId.toString(), url: "/services" },
      { label: "Process", objectId: processPageId.toString(), url: "/process" },
      { label: "Journal", url: "/blog", itemType: "custom" as const },
      { label: "Contact", objectId: contactPageId.toString(), url: "/contact" },
    ];

    for (const [index, item] of navItems.entries()) {
      await ctx.db.insert("menuItems", {
        menuId: mainMenuId,
        itemType: item.itemType ?? "page",
        objectId: item.objectId,
        label: item.label,
        url: item.url,
        position: index,
        depth: 0,
        isOrphaned: false,
        createdAt: now,
        updatedAt: now,
      });
    }

    const locations = await ctx.db.query("menuLocations").collect();
    for (const location of locations) {
      if (location.slug === "header" || location.slug === "mobile") {
        await ctx.db.patch("menuLocations", location._id, {
          menuId: mainMenuId,
          updatedAt: now,
        });
      }
    }

    await upsertSettingsSection(
      ctx,
      "general",
      {
        siteTitle: "Lark & Ladle Studio",
        tagline: "Editorial websites and publishing systems for food-led brands.",
      },
      authorId,
    );

    await upsertSettingsSection(
      ctx,
      "reading",
      {
        homepageDisplays: "static_page",
        homepageId: homePageId,
        postsPageId: null,
        postsPerPage: 10,
      },
      authorId,
    );

    return {
      siteTitle: "Lark & Ladle Studio",
      homePageId,
      pageIds: {
        home: homePageId,
        about: aboutPageId,
        services: servicesPageId,
        process: processPageId,
        contact: contactPageId,
      },
      postCount: createdPosts.length,
      menuId: mainMenuId,
      importedAssetCount: args.assets.length,
    };
  },
});

export const repairSeededPageLinks = internalMutation({
  args: {},
  handler: async (ctx) => {
    const pages = await ctx.db
      .query("posts")
      .withIndex("by_type_status", (q) => q.eq("type", "page"))
      .take(10_000);

    const fixes = [
      { slug: "home", from: '"url":"/services"', to: '"url":"/page/services"' },
      { slug: "services", from: '"url":"/contact"', to: '"url":"/page/contact"' },
    ] as const;

    let updated = 0;

    for (const fix of fixes) {
      const page = pages.find((entry) => entry.slug === fix.slug);
      if (!page || typeof page.content !== "string") {
        continue;
      }

      if (!page.content.includes(fix.from)) {
        continue;
      }

      await ctx.db.patch("posts", page._id, {
        content: page.content.replace(fix.from, fix.to),
        updatedAt: Date.now(),
      });
      updated += 1;
    }

    return { updated };
  },
});
