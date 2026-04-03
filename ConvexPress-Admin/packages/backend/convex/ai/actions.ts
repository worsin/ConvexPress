"use node";

/**
 * AI Content Generation - Public Actions
 *
 * generateAll: Full pipeline — hero → topic titles → subtitles → research → content → summary → sources → TOC
 * generateSection: Regenerate a single section
 *
 * Blog posts get full Tavily research per topic.
 * Pages get lighter generation without deep research.
 */

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { ConvexError } from "convex/values";
import { generateAllArgs, generateSectionArgs } from "./validators";
import * as prompts from "./prompts";

// ─── Generate All ─────────────────────────────────────────────────────────────

export const generateAll = action({
  args: generateAllArgs,
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: "UNAUTHORIZED", message: "Not authenticated" });

    // Verify the user can update this post/page
    const post = await ctx.runQuery(internal.ai.helpers.getPostForAi, {
      postId: args.postId,
      callerSubject: identity.subject,
    });
    if (!post) throw new ConvexError({ code: "NOT_FOUND", message: "Post not found" });
    if (!post.callerCanEdit) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Insufficient permissions" });
    }

    const prompt = post.pagePrompt;
    if (!prompt) throw new ConvexError({ code: "VALIDATION_ERROR", message: "Page prompt is required. Enter what this content should be about." });

    const isPost = post.type === "post";
    const sys = prompts.SYSTEM_PROMPT;
    const allSources: Array<{ url: string; title: string }> = [];

    // ── Step 1: Hero title ─────────────────────────────────────────────
    const heroTitle = await ctx.runAction(internal.ai.internals.generateWithClaude, {
      systemPrompt: sys,
      userPrompt: prompts.HERO_TITLE_PROMPT(prompt),
      maxTokens: 100,
    });

    // ── Step 2: 5 topic titles ─────────────────────────────────────────
    const topicTitlesRaw = await ctx.runAction(internal.ai.internals.generateWithClaude, {
      systemPrompt: sys,
      userPrompt: prompts.TOPIC_TITLES_PROMPT(heroTitle, prompt),
      maxTokens: 300,
    });
    let topicTitles: string[];
    try {
      topicTitles = JSON.parse(topicTitlesRaw);
      if (!Array.isArray(topicTitles)) topicTitles = [topicTitlesRaw];
    } catch {
      topicTitles = topicTitlesRaw.split("\n").filter(Boolean).slice(0, 5);
    }
    topicTitles = topicTitles.slice(0, 5);

    // ── Step 3: Subtitles ──────────────────────────────────────────────
    const heroSubtitle = await ctx.runAction(internal.ai.internals.generateWithClaude, {
      systemPrompt: sys,
      userPrompt: prompts.HERO_SUBTITLE_PROMPT(heroTitle),
      maxTokens: 150,
    });

    const topicSubtitles: string[] = [];
    for (const tt of topicTitles) {
      const sub = await ctx.runAction(internal.ai.internals.generateWithClaude, {
        systemPrompt: sys,
        userPrompt: prompts.TOPIC_SUBTITLE_PROMPT(tt, heroTitle),
        maxTokens: 150,
      });
      topicSubtitles.push(sub);
    }

    // ── Step 4: Hero content ───────────────────────────────────────────
    const heroContent = await ctx.runAction(internal.ai.internals.generateWithClaude, {
      systemPrompt: sys,
      userPrompt: prompts.HERO_CONTENT_PROMPT(heroTitle, heroSubtitle),
      maxTokens: 300,
    });

    // ── Step 5 & 6: Research + generate each topic ─────────────────────
    const topics: Array<{ title: string; subtitle: string; content: string }> = [];

    for (let i = 0; i < topicTitles.length; i++) {
      let topicContent: string;

      if (isPost) {
        // Full Tavily research for blog posts
        const research = await ctx.runAction(internal.ai.internals.researchTopic, {
          query: `${topicTitles[i]} ${heroTitle}`,
          maxResults: 5,
        });

        for (const src of research.sources) {
          if (!allSources.find((s: { url: string }) => s.url === src.url)) {
            allSources.push({ url: src.url, title: src.title });
          }
        }

        topicContent = await ctx.runAction(internal.ai.internals.generateWithClaude, {
          systemPrompt: sys,
          userPrompt: prompts.TOPIC_CONTENT_PROMPT(
            topicTitles[i],
            topicSubtitles[i],
            heroTitle,
            research.aggregatedContent,
            research.sources.map((s: { url: string }) => s.url),
          ),
          maxTokens: 1500,
        });
      } else {
        // Lighter generation for pages (no research)
        topicContent = await ctx.runAction(internal.ai.internals.generateWithClaude, {
          systemPrompt: sys,
          userPrompt: `Write 2-3 paragraphs about "${topicTitles[i]}" for a page titled "${heroTitle}". Be informative and professional.`,
          maxTokens: 800,
        });
      }

      topics.push({
        title: topicTitles[i],
        subtitle: topicSubtitles[i],
        content: topicContent,
      });
    }

    // ── Step 7: Summary ────────────────────────────────────────────────
    const summaryRaw = await ctx.runAction(internal.ai.internals.generateWithClaude, {
      systemPrompt: sys,
      userPrompt: prompts.SUMMARY_PROMPT(heroTitle, topicTitles),
      maxTokens: 500,
    });
    let summary: { title: string; content: string };
    try {
      summary = JSON.parse(summaryRaw);
    } catch {
      summary = { title: "Key Takeaways", content: summaryRaw };
    }

    // ── Step 8: Sources ────────────────────────────────────────────────
    const sourcesText = allSources.length > 0
      ? allSources.map((s, i) => `[${i + 1}] ${s.title} — ${s.url}`).join("\n")
      : "";

    // ── Step 9: Table of contents ──────────────────────────────────────
    const toc = await ctx.runAction(internal.ai.internals.generateWithClaude, {
      systemPrompt: sys,
      userPrompt: prompts.TOC_PROMPT(heroTitle, topicTitles),
      maxTokens: 300,
    });

    // ── Save everything ────────────────────────────────────────────────
    await ctx.runMutation(internal.ai.helpers.saveGeneratedContent, {
      postId: args.postId,
      title: heroTitle,
      hero: { title: heroTitle, subtitle: heroSubtitle, content: heroContent },
      topics: topics.map((t) => ({
        title: t.title,
        subtitle: t.subtitle,
        content: t.content,
      })),
      summary,
      sources: sourcesText,
      tableOfContents: toc,
    });

    return { success: true, topicCount: topics.length, sourceCount: allSources.length };
  },
});

// ─── Generate Section ─────────────────────────────────────────────────────────

export const generateSection = action({
  args: generateSectionArgs,
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: "UNAUTHORIZED", message: "Not authenticated" });

    // Verify the user can update this post/page
    const post = await ctx.runQuery(internal.ai.helpers.getPostForAi, {
      postId: args.postId,
      callerSubject: identity.subject,
    });
    if (!post) throw new ConvexError({ code: "NOT_FOUND", message: "Post not found" });
    if (!post.callerCanEdit) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Insufficient permissions" });
    }

    const sys = prompts.SYSTEM_PROMPT;
    const heroTitle = post.hero?.title || post.title || "Untitled";
    const prompt = post.pagePrompt || heroTitle;
    const isPost = post.type === "post";

    switch (args.section) {
      case "hero": {
        const title = await ctx.runAction(internal.ai.internals.generateWithClaude, {
          systemPrompt: sys, userPrompt: prompts.HERO_TITLE_PROMPT(prompt), maxTokens: 100,
        });
        const subtitle = await ctx.runAction(internal.ai.internals.generateWithClaude, {
          systemPrompt: sys, userPrompt: prompts.HERO_SUBTITLE_PROMPT(title), maxTokens: 150,
        });
        const content = await ctx.runAction(internal.ai.internals.generateWithClaude, {
          systemPrompt: sys, userPrompt: prompts.HERO_CONTENT_PROMPT(title, subtitle), maxTokens: 300,
        });
        await ctx.runMutation(internal.ai.helpers.saveGeneratedContent, {
          postId: args.postId, title, hero: { title, subtitle, content },
        });
        return { success: true };
      }

      case "topic": {
        const idx = args.topicIndex ?? 0;
        const existingTopics = (post.topics ?? []) as Array<{ title?: string; subtitle?: string; content?: string }>;
        if (idx < 0 || idx >= existingTopics.length) {
          throw new ConvexError({ code: "VALIDATION_ERROR", message: `Topic index ${idx} out of bounds (${existingTopics.length} topics exist)` });
        }
        const topicTitle = existingTopics[idx]?.title || `Topic ${idx + 1}`;

        let topicContent: string;
        if (isPost) {
          const research = await ctx.runAction(internal.ai.internals.researchTopic, {
            query: `${topicTitle} ${heroTitle}`, maxResults: 5,
          });
          topicContent = await ctx.runAction(internal.ai.internals.generateWithClaude, {
            systemPrompt: sys,
            userPrompt: prompts.TOPIC_CONTENT_PROMPT(
              topicTitle, existingTopics[idx]?.subtitle || "", heroTitle,
              research.aggregatedContent, research.sources.map((s: { url: string }) => s.url),
            ),
            maxTokens: 1500,
          });
        } else {
          topicContent = await ctx.runAction(internal.ai.internals.generateWithClaude, {
            systemPrompt: sys,
            userPrompt: `Write 2-3 paragraphs about "${topicTitle}" for "${heroTitle}".`,
            maxTokens: 800,
          });
        }

        const updatedTopics = [...existingTopics];
        if (updatedTopics[idx]) {
          updatedTopics[idx] = { ...updatedTopics[idx], content: topicContent };
        }
        await ctx.runMutation(internal.ai.helpers.saveGeneratedContent, {
          postId: args.postId, topics: updatedTopics,
        });
        return { success: true };
      }

      case "summary": {
        const topicTitles = ((post.topics ?? []) as Array<{ title?: string }>).map((t) => t.title || "Untitled");
        const summaryRaw = await ctx.runAction(internal.ai.internals.generateWithClaude, {
          systemPrompt: sys, userPrompt: prompts.SUMMARY_PROMPT(heroTitle, topicTitles), maxTokens: 500,
        });
        let summary: { title: string; content: string };
        try { summary = JSON.parse(summaryRaw); } catch { summary = { title: "Key Takeaways", content: summaryRaw }; }
        await ctx.runMutation(internal.ai.helpers.saveGeneratedContent, { postId: args.postId, summary });
        return { success: true };
      }

      case "sources": {
        // Sources are generated from research — can't regenerate independently without re-researching
        return { success: true, message: "Sources are generated during topic research. Regenerate topics to update sources." };
      }

      case "tableOfContents": {
        const topicTitles = ((post.topics ?? []) as Array<{ title?: string }>).map((t) => t.title || "Untitled");
        const toc = await ctx.runAction(internal.ai.internals.generateWithClaude, {
          systemPrompt: sys, userPrompt: prompts.TOC_PROMPT(heroTitle, topicTitles), maxTokens: 300,
        });
        await ctx.runMutation(internal.ai.helpers.saveGeneratedContent, { postId: args.postId, tableOfContents: toc });
        return { success: true };
      }
    }
  },
});
