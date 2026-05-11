/**
 * AI Content Generation - Prompt Templates
 *
 * System prompts and templates for each section type.
 * Blog posts get full Tavily research; pages get lighter generation.
 */

export const SYSTEM_PROMPT = `You are an expert content writer and researcher. You write clear, authoritative, well-sourced content. Your writing style is professional but accessible. You always cite your sources. You never fabricate information — if you don't have data, you say so.`;

export const HERO_TITLE_PROMPT = (prompt: string) =>
  `Based on this topic description, write a compelling blog post title (max 80 chars). Topic: "${prompt}". Return ONLY the title text, no quotes or formatting.`;

export const HERO_SUBTITLE_PROMPT = (title: string) =>
  `Write a one-line subtitle (max 120 chars) for a blog post titled "${title}". It should expand on the title and hook the reader. Return ONLY the subtitle text.`;

export const HERO_CONTENT_PROMPT = (title: string, subtitle: string) =>
  `Write a 2-3 sentence introductory paragraph for a blog post titled "${title}" with subtitle "${subtitle}". This appears in the hero section above the fold. Make it compelling and set up what the reader will learn. Return ONLY the paragraph text.`;

export const TOPIC_TITLES_PROMPT = (title: string, prompt: string) =>
  `For a blog post titled "${title}" about "${prompt}", generate exactly 5 section topic titles. These are the main sections of the article. Return ONLY a JSON array of 5 strings, e.g.: ["Topic 1", "Topic 2", "Topic 3", "Topic 4", "Topic 5"]`;

export const TOPIC_SUBTITLE_PROMPT = (topicTitle: string, postTitle: string) =>
  `Write a brief subtitle (max 100 chars) for a blog post section titled "${topicTitle}" within the article "${postTitle}". Return ONLY the subtitle text.`;

export const TOPIC_CONTENT_PROMPT = (
  topicTitle: string,
  topicSubtitle: string,
  postTitle: string,
  researchData: string,
  sourceUrls: string[],
) =>
  `Write a detailed, well-researched section for the topic "${topicTitle}" (${topicSubtitle}) within the blog post "${postTitle}".

Use the following research data as your primary source material:
---
${researchData}
---

Sources available: ${sourceUrls.map((u, i) => `[${i + 1}] ${u}`).join("\n")}

Requirements:
- Write 3-5 paragraphs of substantive content
- Reference specific facts and data from the research
- Include inline source references like [1], [2] etc. matching the source numbers above
- Be authoritative and factual — only state what the research supports
- Write in a professional but accessible tone

Return ONLY the section content text with inline source references.`;

export const SUMMARY_PROMPT = (title: string, topicTitles: string[]) =>
  `Write a concise summary section (title + 2-3 paragraph content) for a blog post titled "${title}" covering these topics: ${topicTitles.join(", ")}. The summary should recap key takeaways. Return JSON: {"title": "Key Takeaways", "content": "...summary text..."}`;

export const TOC_PROMPT = (title: string, topicTitles: string[]) =>
  `Generate a table of contents for a blog post titled "${title}" with these sections:\n${topicTitles.map((t, i) => `${i + 1}. ${t}`).join("\n")}\n\nReturn a formatted table of contents as plain text with numbered sections.`;
