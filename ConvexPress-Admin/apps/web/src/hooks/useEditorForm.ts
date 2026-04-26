/**
 * useEditorForm - TanStack Form + Zod + Convex mutation wrappers
 *
 * Initializes and manages the TanStack Form instance for the post/page editor
 * with Zod validation. Provides action handlers for Publish box buttons.
 * Wired to Convex post mutations for create, update, publish, trash, etc.
 */

import { useCallback, useMemo, useTransition } from "react";
import { useForm, useStore } from "@tanstack/react-form";
import { useMutation } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { z } from "zod";
import { toast } from "sonner";
import type { Id } from "@backend/convex/_generated/dataModel";
import type {
  EditorContentType,
  EditorFormValues,
  CommentStatus,
  PostStatus,
  PostVisibility,
  HeroFields,
  TopicFields,
  SummaryFields,
} from "@/types/editor";
import { DEFAULT_EDITOR_FORM_VALUES } from "@/types/editor";

/**
 * TypeScript type matching the Convex `posts.mutations.update` args.
 * Eliminates the need for `as any` casts on mutation calls.
 */
interface PostUpdateArgs {
  postId: Id<"posts">;
  title?: string;
  content?: string;
  excerpt?: string;
  status?: PostStatus;
  visibility?: PostVisibility;
  password?: string;
  commentStatus?: CommentStatus;
  featuredImageId?: Id<"media">;
  isSticky?: boolean;
  slug?: string;
  menuOrder?: number;
  authorId?: Id<"users">;
  scheduledAt?: number;
  categoryIds?: Id<"terms">[];
  tagIds?: Id<"terms">[];
  // Structured content fields
  hero?: object;
  topics?: object[];
  summary?: object;
  sources?: string;
  tableOfContents?: string;
  pagePrompt?: string;
}

/** Zod validation schema for editor form */
export const editorFormSchema = z
  .object({
    title: z.string().max(500, "Title must be 500 characters or less"),
    slug: z
      .string()
      .max(200)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Invalid slug format")
      .or(z.literal("")),
    content: z.string(),
    excerpt: z
      .string()
      .max(1000, "Excerpt must be 1000 characters or less")
      .optional()
      .default(""),
    status: z.enum([
      "auto-draft",
      "draft",
      "pending",
      "publish",
      "future",
      "private",
      "trash",
    ]),
    visibility: z.enum(["public", "private", "password"]),
    password: z.string().optional().default(""),
    commentStatus: z.enum(["open", "closed"]),
    isSticky: z.boolean(),
    featuredImageId: z.string().nullable(),
    authorId: z.string(),
    scheduledFor: z.date().nullable(),
    categoryIds: z.array(z.string()),
    tagIds: z.array(z.string()),
    menuOrder: z.number().int(),
    // Structured content fields
    hero: z.object({
      title: z.string(),
      subtitle: z.string(),
      content: z.string(),
      imageId: z.string().nullable(),
      videoUrl: z.string(),
      ctaText: z.string(),
      ctaUrl: z.string(),
    }),
    topics: z.array(z.object({
      title: z.string(),
      subtitle: z.string(),
      content: z.string(),
      imageId: z.string().nullable(),
      videoUrl: z.string(),
    })).max(5, "Maximum 5 topics allowed"),
    summary: z.object({
      title: z.string(),
      content: z.string(),
    }),
    sources: z.string(),
    tableOfContents: z.string(),
    pagePrompt: z.string(),
  })
  .refine(
    (data) =>
      data.visibility !== "password" ||
      (data.password && data.password.length > 0),
    {
      message: "Password is required for password-protected posts",
      path: ["password"],
    },
  );

interface UseEditorFormOptions {
  contentType: EditorContentType;
  mode: "new" | "edit";
  postId?: string;
  initialData?: Partial<EditorFormValues>;
  defaultCommentStatus?: CommentStatus;
}

export function useEditorForm(options: UseEditorFormOptions) {
  const { contentType, mode, postId, initialData, defaultCommentStatus } =
    options;
  const [isSubmitting, startTransition] = useTransition();

  // Convex mutations
  const updatePost = useMutation(api.posts.mutations.update);
  const publishPost = useMutation(api.posts.mutations.publish);
  const trashPost = useMutation(api.posts.mutations.trash);

  const defaultValues = useMemo<EditorFormValues>(
    () => ({
      ...DEFAULT_EDITOR_FORM_VALUES,
      commentStatus: defaultCommentStatus ?? "open",
      ...initialData,
    }),
    [initialData, defaultCommentStatus],
  );

  const form = useForm<
    EditorFormValues,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    unknown
  >({
    defaultValues,
  });

  const isDirty = useStore(form.store, (state) => state.isDirty);

  /**
   * Helper: Build the update args from current form state.
   * Only includes fields that have changed from initial values.
   * Returns a properly typed object matching the Convex mutation args.
   */
  const buildUpdateArgs = useCallback(
    (overrides?: Partial<EditorFormValues>): PostUpdateArgs => {
      const values = { ...form.state.values, ...overrides };
      const args: PostUpdateArgs = {
        postId: postId as Id<"posts">,
      };

      // Always send all editable fields so the backend applies the latest state
      if (values.title !== undefined) args.title = values.title;
      if (values.content !== undefined) args.content = values.content;
      if (values.excerpt !== undefined) args.excerpt = values.excerpt;
      if (values.slug) args.slug = values.slug;
      if (values.status) args.status = values.status;
      if (values.visibility) args.visibility = values.visibility;
      if (values.password !== undefined) args.password = values.password;
      if (values.commentStatus) args.commentStatus = values.commentStatus;
      if (values.isSticky !== undefined) args.isSticky = values.isSticky;
      if (values.menuOrder !== undefined) args.menuOrder = values.menuOrder;
      if (values.featuredImageId !== undefined && values.featuredImageId) {
        args.featuredImageId = values.featuredImageId as Id<"media">;
      }
      if (values.scheduledFor) {
        args.scheduledAt = values.scheduledFor.getTime();
      }
      if (values.categoryIds !== undefined) {
        args.categoryIds = values.categoryIds as Id<"terms">[];
      }
      if (values.tagIds !== undefined) {
        args.tagIds = values.tagIds as Id<"terms">[];
      }

      // Structured content fields
      if (values.hero !== undefined) {
        const h = values.hero;
        const hasContent = h.title || h.subtitle || h.content || h.imageId || h.videoUrl || h.ctaText || h.ctaUrl;
        args.hero = hasContent ? {
          title: h.title || undefined,
          subtitle: h.subtitle || undefined,
          content: h.content || undefined,
          imageId: h.imageId ? (h.imageId as unknown as Id<"media">) : undefined,
          videoUrl: h.videoUrl || undefined,
          ctaText: h.ctaText || undefined,
          ctaUrl: h.ctaUrl || undefined,
        } : undefined;
      }
      if (values.topics !== undefined && values.topics.length > 0) {
        args.topics = values.topics.map((t) => ({
          title: t.title || undefined,
          subtitle: t.subtitle || undefined,
          content: t.content || undefined,
          imageId: t.imageId ? (t.imageId as unknown as Id<"media">) : undefined,
          videoUrl: t.videoUrl || undefined,
        }));
      }
      if (values.summary !== undefined) {
        const s = values.summary;
        const hasContent = s.title || s.content;
        args.summary = hasContent ? {
          title: s.title || undefined,
          content: s.content || undefined,
        } : undefined;
      }
      if (values.sources !== undefined) args.sources = values.sources || undefined;
      if (values.tableOfContents !== undefined) args.tableOfContents = values.tableOfContents || undefined;
      if (values.pagePrompt !== undefined) args.pagePrompt = values.pagePrompt || undefined;

      return args;
    },
    [form, postId],
  );

  const handleSaveDraft = useCallback(() => {
    if (!postId) return;
    startTransition(async () => {
      try {
        await updatePost(buildUpdateArgs({ status: "draft" }));
        form.setFieldValue("status", "draft");
        toast.success("Draft saved.");
      } catch (error: unknown) {
        toast.error("Failed to save draft.");
        console.error("Save draft error:", error);
      }
    });
  }, [form, postId, updatePost, buildUpdateArgs, startTransition]);

  const handlePublish = useCallback(() => {
    if (!postId) return;
    startTransition(async () => {
      try {
        // First update with latest form values, then publish
        await updatePost(buildUpdateArgs());
        await publishPost({ postId: postId as Id<"posts"> });
        form.setFieldValue("status", "publish");
        toast.success(
          contentType === "post" ? "Post published." : "Page published.",
        );
      } catch (error: unknown) {
        toast.error("Failed to publish.");
        console.error("Publish error:", error);
      }
    });
  }, [form, contentType, postId, updatePost, publishPost, buildUpdateArgs, startTransition]);

  const handleUpdate = useCallback(() => {
    if (!postId) return;
    startTransition(async () => {
      try {
        await updatePost(buildUpdateArgs());
        toast.success(
          contentType === "post" ? "Post updated." : "Page updated.",
        );
      } catch (error: unknown) {
        toast.error("Failed to update.");
        console.error("Update error:", error);
      }
    });
  }, [contentType, postId, updatePost, buildUpdateArgs, startTransition]);

  const handleSubmitForReview = useCallback(() => {
    if (!postId) return;
    startTransition(async () => {
      try {
        await updatePost(buildUpdateArgs({ status: "pending" }));
        form.setFieldValue("status", "pending");
        toast.success("Submitted for review.");
      } catch (error: unknown) {
        toast.error("Failed to submit for review.");
        console.error("Submit for review error:", error);
      }
    });
  }, [form, postId, updatePost, buildUpdateArgs, startTransition]);

  const handleSchedule = useCallback(
    (date: Date) => {
      if (!postId) return;
      startTransition(async () => {
        try {
          await updatePost(
            buildUpdateArgs({
              status: "future",
              scheduledFor: date,
            }),
          );
          form.setFieldValue("status", "future");
          form.setFieldValue("scheduledFor", date);
          toast.success("Post scheduled.");
        } catch (error: unknown) {
          toast.error("Failed to schedule.");
          console.error("Schedule error:", error);
        }
      });
    },
    [form, postId, updatePost, buildUpdateArgs, startTransition],
  );

  const handleTrash = useCallback(() => {
    if (!postId) return;
    startTransition(async () => {
      try {
        await trashPost({ postId: postId as Id<"posts"> });
        form.setFieldValue("status", "trash");
        toast.success(
          contentType === "post"
            ? "Post moved to trash."
            : "Page moved to trash.",
        );
      } catch (error: unknown) {
        toast.error("Failed to move to trash.");
        console.error("Trash error:", error);
      }
    });
  }, [form, contentType, postId, trashPost, startTransition]);

  const resetForm = useCallback(
    (data: EditorFormValues) => {
      form.reset(data);
    },
    [form],
  );

  return {
    form,
    isDirty,
    isSubmitting,
    handleSaveDraft,
    handlePublish,
    handleUpdate,
    handleSubmitForReview,
    handleSchedule,
    handleTrash,
    resetForm,
  };
}
