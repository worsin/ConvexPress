import { ConvexError } from "convex/values";

export interface LmsOutlineLesson {
  title?: string;
  brief?: string;
  outcomes?: string[];
  body?: string;
}

export interface LmsOutlineTopic {
  title?: string;
  summary?: string;
  lessons: LmsOutlineLesson[];
}

export interface LmsOutline {
  topics: LmsOutlineTopic[];
}

export function parseJsonObject(raw: string): unknown {
  const cleaned = String(raw)
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const candidate = start >= 0 && end >= start ? cleaned.slice(start, end + 1) : cleaned;
  try {
    return JSON.parse(candidate);
  } catch {
    return JSON.parse(candidate.replace(/,\s*([}\]])/g, "$1"));
  }
}

export function cleanGeneratedLessonText(raw: string): string {
  const text = String(raw)
    .replace(/^```(?:markdown|md|text)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  if (text.length < 10) {
    throw new ConvexError({
      code: "EMPTY_GENERATION",
      message: "AI returned an empty lesson draft. Try again.",
    });
  }
  return text.slice(0, 100000);
}

export function normalizeOutline(value: unknown): LmsOutline {
  const topics = Array.isArray((value as { topics?: unknown })?.topics)
    ? ((value as { topics: unknown[] }).topics as LmsOutlineTopic[])
    : [];
  const normalized = topics
    .slice(0, 24)
    .map((topic) => ({
      title: String(topic?.title ?? "Untitled topic").trim().slice(0, 200),
      summary: String(topic?.summary ?? "").trim().slice(0, 1000),
      lessons: Array.isArray(topic?.lessons)
        ? topic.lessons.slice(0, 12).map((lesson) => ({
            title: String(lesson?.title ?? "Untitled lesson").trim().slice(0, 200),
            brief: String(lesson?.brief ?? lesson?.body ?? "").trim().slice(0, 2000),
            outcomes: Array.isArray(lesson?.outcomes)
              ? lesson.outcomes.map((outcome) => String(outcome).trim()).filter(Boolean).slice(0, 8)
              : [],
            body: typeof lesson?.body === "string" ? lesson.body : undefined,
          }))
        : [],
    }))
    .filter((topic) => topic.title && topic.lessons.length > 0);

  if (normalized.length === 0) {
    throw new ConvexError({
      code: "PARSE_ERROR",
      message: "AI returned an outline without topics and lessons.",
    });
  }
  return { topics: normalized };
}

export function outlineStats(outline: LmsOutline) {
  return {
    topicCount: outline.topics.length,
    lessonCount: outline.topics.reduce((sum, topic) => sum + topic.lessons.length, 0),
  };
}

export function textToDoc(text: string) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => ({
      type: "paragraph",
      content: [{ type: "text", text: part }],
    }));
  return { type: "doc", content: paragraphs.length > 0 ? paragraphs : [{ type: "paragraph" }] };
}
