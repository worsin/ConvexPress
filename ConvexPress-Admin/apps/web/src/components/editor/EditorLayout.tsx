/**
 * EditorLayout - Root layout for post/page editor
 *
 * Provides the two-column grid layout, EditorHeader, metabox sidebar with
 * @dnd-kit drag-and-drop reordering, and coordinates all editor state.
 * Uses auth context for role-aware rendering.
 */

import { Component, useCallback, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { useAiGeneration } from "@/hooks/useAiGeneration";
import { DndContext, closestCenter } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useQuery } from "convex/react";
import { useStore } from "@tanstack/react-form";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { EditorHeader } from "./EditorHeader";
import { TitleInput } from "./TitleInput";
import { SlugEditor } from "./SlugEditor";
import { TipTapEditor } from "./TipTapEditor";
import { MetaboxContainer } from "./MetaboxContainer";
import { PublishBox } from "./PublishBox";
import { CategoriesMetabox } from "./CategoriesMetabox";
import { TagsMetabox } from "./TagsMetabox";
import { FeaturedImageMetabox } from "./FeaturedImageMetabox";
import { ExcerptMetabox } from "./ExcerptMetabox";
import { DiscussionMetabox } from "./DiscussionMetabox";
import { AuthorSelector } from "./AuthorSelector";
import { RevisionsMetabox } from "./RevisionsMetabox";
import { SeoMetabox } from "@/components/seo/SeoMetabox";
import { PageAttributesMetabox } from "./PageAttributesMetabox";
import { PostEditLockNotice } from "./PostEditLockNotice";
import { EditorFooter } from "./EditorFooter";
import { EditorSidebar } from "./EditorSidebar";
import { CustomFieldsMetabox } from "@/components/custom-fields/metabox/CustomFieldsMetabox";
import type { EditorContext } from "@/components/custom-fields/metabox/CustomFieldsMetabox";
import { AutosaveRecoveryDialog } from "./AutosaveRecoveryDialog";
import { useEditorForm } from "@/hooks/useEditorForm";
import { useAutosave } from "@/hooks/useAutosave";
import { useMetaboxOrder } from "@/hooks/useMetaboxOrder";
import { useEditorKeyboardShortcuts } from "@/hooks/useEditorKeyboardShortcuts";
import { useUnsavedChangesWarning } from "@/hooks/useUnsavedChangesWarning";
import { useAuth } from "@/lib/auth-context";
import { ContentEditorProvider } from "./ContentEditorProvider";
import type { EditorContentType, EditorFormValues, TagItem, EditorContextValue, HeroFields, TopicFields, SummaryFields } from "@/types/editor";
import {
  StructuredContentSection,
  HeroSectionEditor,
  TopicsListEditor,
  SummarySectionEditor,
  SourcesEditor,
  TableOfContentsEditor,
} from "./structured";

/** Shape of general settings response */
interface GeneralSettings {
  siteUrl?: string;
  siteTitle?: string;
  siteDescription?: string;
}

interface EditorLayoutProps {
  contentType: EditorContentType;
  mode: "new" | "edit";
  postId?: string;
  initialData?: Partial<EditorFormValues>;
  /** Actual published timestamp from the post record (ms since epoch) */
  publishedAt?: number | null;
  /** Autosave data from the post record (if a newer autosave exists) */
  autosaveData?: {
    autosaveContent?: string;
    autosaveTitle?: string;
    autosavedAt?: number;
    lastSavedAt?: number;
  };
}

function EditorLayoutInner({
  contentType,
  mode,
  postId,
  initialData,
  publishedAt,
  autosaveData,
}: EditorLayoutProps) {
  // Auth context - provides role, user, and capability checks
  const { role, user, can, isLoading: authLoading } = useAuth();
  const userRole = role?.slug ?? "subscriber";
  const currentUserId = user?._id ?? "";

  // Load site URL from settings for permalink preview
  const generalSettings = useQuery(api.settings.queries.get, { section: "general" });
  const siteUrl = (generalSettings as GeneralSettings | undefined)?.siteUrl || "";

  // Load all postMeta for this post (edit mode only, needed for page parent ID)
  const postMetaRecords = useQuery(
    api.posts.queries.getMetaByPost,
    postId ? { postId: postId as Id<"posts"> } : "skip",
  );

  // Parse postMeta into a lookup map
  const postMetaMap = useMemo(() => {
    const map = new Map<string, string>();
    if (postMetaRecords) {
      for (const record of postMetaRecords) {
        map.set(record.key, record.value);
      }
    }
    return map;
  }, [postMetaRecords]);

  // Live post data from Convex (reactive - updates automatically after AI generation)
  const livePost = useQuery(
    api.posts.queries.get,
    postId ? { postId: postId as Id<"posts"> } : "skip",
  );

  // Editor form state
  const {
    form,
    isSubmitting,
    handleSaveDraft,
    handlePublish,
    handleUpdate,
    handleSubmitForReview,
    handleSchedule,
    handleTrash,
  } = useEditorForm({
    contentType,
    mode,
    postId,
    initialData,
  });

  // TanStack Form state must be subscribed to for reactive re-renders.
  const formValues = useStore(form.store, (state) => state.values);
  const isDirty = useStore(form.store, (state) => state.isDirty);

  // Form field values
  const title = formValues.title;
  const slug = formValues.slug;
  const content = formValues.content;
  const excerpt = formValues.excerpt;
  const status = formValues.status;
  const visibility = formValues.visibility;
  const password = formValues.password;
  const commentStatus = formValues.commentStatus;
  const isSticky = formValues.isSticky;
  const featuredImageId = formValues.featuredImageId;
  const authorId = formValues.authorId;
  const scheduledFor = formValues.scheduledFor;
  const categoryIds = formValues.categoryIds;
  const menuOrder = formValues.menuOrder;

  // Track manually selected tags (with full data for display)
  const [selectedTags, setSelectedTags] = useState<TagItem[]>([]);

  // Editor stats for EditorFooter (computed from content)
  const editorStats = useMemo(() => {
    // Content might be JSON (TipTap) or plain text
    let plainText = "";
    try {
      const parsed = JSON.parse(content);
      // Extract text recursively from TipTap JSON
      const extractText = (node: { text?: string; content?: unknown[] }): string => {
        if (node.text) return node.text;
        if (node.content) return node.content.map(extractText).join(" ");
        return "";
      };
      plainText = extractText(parsed);
    } catch {
      plainText = content;
    }

    const words = plainText.trim().split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    const characterCount = plainText.length;
    // Rough block count: count top-level nodes in TipTap JSON
    let blockCount = 0;
    try {
      const parsed = JSON.parse(content);
      blockCount = parsed.content?.length ?? 0;
    } catch {
      blockCount = content ? content.split("\n").filter(Boolean).length : 0;
    }
    const readingTime = Math.max(1, Math.ceil(wordCount / 200));
    return { wordCount, characterCount, blockCount, readingTime };
  }, [content]);

  // NOTE: SEO state is managed by the dedicated SeoMetabox component
  // (components/seo/SeoMetabox.tsx) which uses its own seo table via usePostSeo.
  // No SEO state is needed here in EditorLayout.

  // Page-specific state
  // Uses ref-guarded initialization to prevent reactive Convex updates from overwriting user edits
  const parentPageInitializedRef = useRef(false);
  const [parentPageId, setParentPageId] = useState("");

  if (!parentPageInitializedRef.current && postMetaRecords && mode === "edit" && contentType === "page") {
    parentPageInitializedRef.current = true;
    const metaParentId = postMetaMap.get("_parent_page_id");
    if (metaParentId) setParentPageId(metaParentId);
  }

  // Slug manual edit tracking
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  // Structured content section collapse state
  const [structuredCollapse, setStructuredCollapse] = useState<Record<string, boolean>>({
    hero: false,
    topics: false,
    summary: true,
    sources: true,
    toc: true,
  });
  const toggleStructuredCollapse = useCallback((key: string) => {
    setStructuredCollapse((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // AI content generation - refresh form fields from live Convex data after generation.
  // We use a "pending refresh" flag: when AI completes, we set it to true, then
  // an effect watches livePost changes and syncs form state once the data arrives.
  const [aiRefreshPending, setAiRefreshPending] = useState(false);

  const handleAiComplete = useCallback(() => {
    // Signal that we need to sync form state once livePost updates reactively
    setAiRefreshPending(true);
  }, []);

  // When livePost updates after AI generation, sync structured fields into the form
  useEffect(() => {
    if (!aiRefreshPending || !livePost) return;
    setAiRefreshPending(false);

    const hero = livePost.hero
      ? {
          title: livePost.hero.title ?? "",
          subtitle: livePost.hero.subtitle ?? "",
          content: livePost.hero.content ?? "",
          imageId: livePost.hero.imageId ?? null,
          videoUrl: livePost.hero.videoUrl ?? "",
          ctaText: livePost.hero.ctaText ?? "",
          ctaUrl: livePost.hero.ctaUrl ?? "",
        }
      : { title: "", subtitle: "", content: "", imageId: null, videoUrl: "", ctaText: "", ctaUrl: "" };
    form.setFieldValue("hero", hero);

    const topics = (livePost.topics ?? []).map((t: any) => ({
      title: t.title ?? "",
      subtitle: t.subtitle ?? "",
      content: t.content ?? "",
      imageId: t.imageId ?? null,
      videoUrl: t.videoUrl ?? "",
    }));
    form.setFieldValue("topics", topics);

    const summary = livePost.summary
      ? { title: livePost.summary.title ?? "", content: livePost.summary.content ?? "" }
      : { title: "", content: "" };
    form.setFieldValue("summary", summary);

    form.setFieldValue("sources", livePost.sources ?? "");
    form.setFieldValue("tableOfContents", livePost.tableOfContents ?? "");
    // Also refresh TipTap content if AI updated it
    if (livePost.content !== undefined) {
      form.setFieldValue("content", livePost.content ?? "");
    }
  }, [aiRefreshPending, livePost, form]);

  const {
    isGenerating,
    currentSection: aiCurrentSection,
    handleGenerateAll,
    handleRegenerateSection,
  } = useAiGeneration(postId, handleAiComplete);

  const handleRegenerate = useCallback((section: string, index?: number) => {
    const sectionMap: Record<string, "hero" | "topic" | "summary" | "sources" | "tableOfContents"> = {
      "hero": "hero",
      "all topics": "topic",
      "topic": "topic",
      "summary": "summary",
      "sources": "sources",
      "table of contents": "tableOfContents",
    };
    const mapped = sectionMap[section];
    if (mapped) {
      handleRegenerateSection(mapped, index);
    }
  }, [handleRegenerateSection]);

  // Autosave
  const autosaveState = useAutosave({
    postId: postId ?? null,
    title,
    content,
    enabled: !isSubmitting && mode === "edit",
  });

  // Metabox ordering with @dnd-kit
  const {
    metaboxes,
    moveMetabox,
    toggleCollapse,
    sensors,
    handleDragEnd,
    sortableIds,
  } = useMetaboxOrder({
    contentType,
    userRole,
  });

  // Keyboard shortcuts
  const handleSave = useCallback(() => {
    if (status === "publish" || status === "future") {
      handleUpdate();
    } else {
      handleSaveDraft();
    }
  }, [status, handleUpdate, handleSaveDraft]);

  const handlePreview = useCallback(() => {
    // TODO: Open preview in new tab
    const previewUrl =
      contentType === "post"
        ? `/blog/${postId ?? "preview"}?preview=true`
        : `/${postId ?? "preview"}?preview=true`;
    window.open(previewUrl, "_blank");
  }, [contentType, postId]);

  useEditorKeyboardShortcuts({
    onSave: handleSave,
    onPreview: handlePreview,
    enabled: !isSubmitting,
  });

  // Autosave recovery handlers
  const hasAutosaveRecovery =
    mode === "edit" &&
    autosaveData?.autosaveContent &&
    autosaveData?.autosavedAt &&
    autosaveData?.lastSavedAt &&
    autosaveData.autosavedAt > autosaveData.lastSavedAt;

  const handleAutosaveRestore = useCallback(() => {
    if (!autosaveData?.autosaveContent) return;
    form.setFieldValue("content", autosaveData.autosaveContent);
    if (autosaveData.autosaveTitle) {
      form.setFieldValue("title", autosaveData.autosaveTitle);
    }
  }, [form, autosaveData]);

  const handleAutosaveDismiss = useCallback(() => {
    // No-op: just dismiss the banner (handled by the dialog component's internal state)
  }, []);

  // Unsaved changes warning
  useUnsavedChangesWarning({
    isDirty,
    enabled: !isSubmitting,
  });

  // Tag handlers
  const handleAddTag = useCallback(
    (tag: TagItem) => {
      setSelectedTags((prev) => {
        if (prev.some((t) => t.id === tag.id)) return prev;
        return [...prev, tag];
      });
      form.setFieldValue("tagIds", [
        ...form.state.values.tagIds,
        tag.id,
      ]);
    },
    [form],
  );

  const handleRemoveTag = useCallback(
    (tagId: string) => {
      setSelectedTags((prev) => prev.filter((t) => t.id !== tagId));
      form.setFieldValue(
        "tagIds",
        form.state.values.tagIds.filter((id: string) => id !== tagId),
      );
    },
    [form],
  );

  // Category toggle handler
  const handleCategoryToggle = useCallback(
    (categoryId: string) => {
      const current = form.state.values.categoryIds;
      const updated = current.includes(categoryId)
        ? current.filter((id: string) => id !== categoryId)
        : [...current, categoryId];
      form.setFieldValue("categoryIds", updated);
    },
    [form],
  );

  // Slug auto-generation from title
  const handleSlugGenerate = useCallback(
    (generatedSlug: string) => {
      if (!slugManuallyEdited) {
        form.setFieldValue("slug", generatedSlug);
      }
    },
    [form, slugManuallyEdited],
  );

  // Custom fields editor context - used by CustomFieldsMetabox to evaluate location rules
  const customFieldContext: EditorContext = useMemo(() => ({
    entityType: contentType,
    entityId: postId ?? "",
    postType: contentType,
    postStatus: status,
    postCategories: categoryIds,
    pageParent: contentType === "page" ? parentPageId : undefined,
    currentUserRole: userRole,
  }), [contentType, postId, status, categoryIds, parentPageId, userRole]);

  /** Render a sidebar metabox by its ID */
  function renderMetabox(metaboxId: string) {
    const metabox = metaboxes.find((m) => m.id === metaboxId);
    if (!metabox) return null;

    // Publish box is rendered separately (sticky, not in sortable context)
    if (metaboxId === "publish") return null;

    // Revisions metabox only in edit mode
    if (metaboxId === "revisions" && mode !== "edit") return null;

    const content = getMetaboxContent(metaboxId);
    if (!content) return null;

    return (
      <MetaboxContainer
        key={metaboxId}
        id={metaboxId}
        title={metabox.title}
        isDraggable={metabox.isDraggable}
        isCollapsed={metabox.isCollapsed}
        onToggleCollapse={() => toggleCollapse(metaboxId)}
      >
        {content}
      </MetaboxContainer>
    );
  }

  /** Get the inner content for a metabox */
  function getMetaboxContent(metaboxId: string): React.ReactNode | null {
    switch (metaboxId) {
      case "categories":
        return (
          <CategoriesMetabox
            selectedIds={categoryIds}
            onToggle={handleCategoryToggle}
          />
        );
      case "tags":
        return (
          <TagsMetabox
            selectedTags={selectedTags}
            onAddTag={handleAddTag}
            onRemoveTag={handleRemoveTag}
          />
        );
      case "featured-image":
        return (
          <FeaturedImageMetabox
            featuredImageId={featuredImageId}
            onSelect={(id) => form.setFieldValue("featuredImageId", id)}
          />
        );
      case "excerpt":
        return (
          <ExcerptMetabox
            value={excerpt}
            onChange={(val) => form.setFieldValue("excerpt", val)}
          />
        );
      case "discussion":
        return (
          <DiscussionMetabox
            commentStatus={commentStatus}
            onChange={(val) => form.setFieldValue("commentStatus", val)}
          />
        );
      case "author":
        return (
          <AuthorSelector
            authorId={authorId}
            onChange={(val) => form.setFieldValue("authorId", val)}
            userRole={userRole}
          />
        );
      case "revisions":
        return postId ? (
          <RevisionsMetabox postId={postId} contentType={contentType} />
        ) : null;
      case "slug":
        return (
          <SlugEditor
            contentType={contentType}
            slug={slug}
            onChange={(val) => form.setFieldValue("slug", val)}
            onManualEdit={() => setSlugManuallyEdited(true)}
            siteUrl={siteUrl}
          />
        );
      case "seo":
        return postId ? (
          <SeoMetabox
            postId={postId as Id<"posts">}
            contentType={contentType}
            postTitle={title}
            postSlug={slug}
            postContent={content}
            postExcerpt={excerpt}
          />
        ) : null;
      case "page-attributes":
        return (
          <PageAttributesMetabox
            parentPageId={parentPageId}
            menuOrder={menuOrder}
            onParentChange={setParentPageId}
            onMenuOrderChange={(val) => form.setFieldValue("menuOrder", val)}
          />
        );
      default:
        return null;
    }
  }

  // Sidebar metaboxes (excluding publish, which is rendered separately)
  const sidebarMetaboxes = metaboxes.filter(
    (m) => m.position === "sidebar" && m.id !== "publish",
  );

  // Memoize callback for content changes to avoid re-creating on every render
  const handleEditorContentChange = useCallback(
    (json: string) => form.setFieldValue("content", json),
    [form],
  );

  // Memoize the context value to prevent unnecessary re-renders of consumers
  const contentEditorContextValue = useMemo(
    () => ({
      isReadOnly: false,
      canUploadFiles: can("upload_files"),
      canCreateReusableBlocks: can("post.create"),
      onContentChange: handleEditorContentChange,
    }),
    [can, handleEditorContentChange],
  );

  return (
    <div role="main" aria-label={`${contentType === "post" ? "Post" : "Page"} editor`}>
      {/* Edit lock notice (edit mode only) */}
      {mode === "edit" && postId && (
        <PostEditLockNotice postId={postId} currentUserId={currentUserId} />
      )}

      {/* Autosave recovery dialog */}
      {hasAutosaveRecovery && autosaveData && (
        <AutosaveRecoveryDialog
          autosavedAt={autosaveData.autosavedAt!}
          lastSavedAt={autosaveData.lastSavedAt!}
          onRestore={handleAutosaveRestore}
          onDismiss={handleAutosaveDismiss}
        />
      )}

      {/* Editor header */}
      <EditorHeader
        contentType={contentType}
        mode={mode}
        postId={postId}
        status={status}
        autosaveState={autosaveState}
      />

      {/* Two-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4 mt-4">
        {/* Main column */}
        <div className="min-w-0 space-y-4">
          {/* Title input */}
          <TitleInput
            value={title}
            onChange={(val) => form.setFieldValue("title", val)}
            onSlugGenerate={handleSlugGenerate}
            autoFocus={mode === "new"}
          />

          {/* Slug editor (below title, inline) */}
          {slug && (
            <SlugEditor
              contentType={contentType}
              slug={slug}
              onChange={(val) => form.setFieldValue("slug", val)}
              onManualEdit={() => setSlugManuallyEdited(true)}
              siteUrl={siteUrl}
            />
          )}

          {/* Custom fields: after_title position */}
          {postId && (
            <CustomFieldsMetabox context={customFieldContext} position="after_title" />
          )}

          {/* TipTap Content Editor (wrapped in ContentEditorProvider) */}
          <ContentEditorProvider value={contentEditorContextValue}>
            <TipTapEditor
              initialContent={content || undefined}
              onContentChange={handleEditorContentChange}
              readOnly={false}
            />
          </ContentEditorProvider>

          {/* ── AI Content Prompt + Generate All ────────────────────── */}
          <div className="border border-border bg-card p-3 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Content Prompt
              </label>
              <button
                type="button"
                onClick={handleGenerateAll}
                disabled={isGenerating || !formValues.pagePrompt}
                title={!formValues.pagePrompt ? "Enter a content prompt first" : "Generate all sections using AI"}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isGenerating && aiCurrentSection === "all" ? (
                  <>
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="size-3.5" />
                    Generate All with AI
                  </>
                )}
              </button>
            </div>
            <textarea
              value={formValues.pagePrompt}
              onChange={(e) => form.setFieldValue("pagePrompt", e.target.value)}
              placeholder="Describe what this content should be about. Each topic will be researched and written with source citations..."
              rows={3}
              className="w-full border border-border bg-background px-2.5 py-1.5 text-sm outline-hidden focus:border-primary transition-colors resize-y"
            />
            <p className="text-[10px] text-muted-foreground">
              Save your draft first, then click Generate All. Blog posts get full web research per topic. Pages get lighter generation.
            </p>
          </div>

          {/* ── Structured Content Sections ─────────────────────────── */}
          <StructuredContentSection
            title="Hero Section"
            isCollapsed={structuredCollapse.hero}
            onToggleCollapse={() => toggleStructuredCollapse("hero")}
            onRegenerate={() => handleRegenerate("hero")}
            isRegenerating={isGenerating && aiCurrentSection === "hero"}
          >
            <HeroSectionEditor
              value={formValues.hero}
              onChange={(hero: HeroFields) => form.setFieldValue("hero", hero)}
            />
          </StructuredContentSection>

          <StructuredContentSection
            title="Topics"
            isCollapsed={structuredCollapse.topics}
            onToggleCollapse={() => toggleStructuredCollapse("topics")}
            onRegenerate={() => handleRegenerate("all topics")}
            isRegenerating={isGenerating && (aiCurrentSection === "topic" || aiCurrentSection?.startsWith("topic-"))}
          >
            <TopicsListEditor
              value={formValues.topics}
              onChange={(topics: TopicFields[]) => form.setFieldValue("topics", topics)}
              onRegenerateTopic={(index: number) => handleRegenerate("topic", index)}
            />
          </StructuredContentSection>

          <StructuredContentSection
            title="Summary"
            isCollapsed={structuredCollapse.summary}
            onToggleCollapse={() => toggleStructuredCollapse("summary")}
            onRegenerate={() => handleRegenerate("summary")}
            isRegenerating={isGenerating && aiCurrentSection === "summary"}
          >
            <SummarySectionEditor
              value={formValues.summary}
              onChange={(summary: SummaryFields) => form.setFieldValue("summary", summary)}
            />
          </StructuredContentSection>

          <StructuredContentSection
            title="Sources"
            isCollapsed={structuredCollapse.sources}
            onToggleCollapse={() => toggleStructuredCollapse("sources")}
            onRegenerate={() => handleRegenerate("sources")}
            isRegenerating={isGenerating && aiCurrentSection === "sources"}
          >
            <SourcesEditor
              value={formValues.sources}
              onChange={(sources: string) => form.setFieldValue("sources", sources)}
            />
          </StructuredContentSection>

          <StructuredContentSection
            title="Table of Contents"
            isCollapsed={structuredCollapse.toc}
            onToggleCollapse={() => toggleStructuredCollapse("toc")}
            onRegenerate={() => handleRegenerate("table of contents")}
            isRegenerating={isGenerating && aiCurrentSection === "tableOfContents"}
          >
            <TableOfContentsEditor
              value={formValues.tableOfContents}
              onChange={(toc: string) => form.setFieldValue("tableOfContents", toc)}
            />
          </StructuredContentSection>

          {/* Custom fields: normal position (below editor) */}
          {postId && (
            <CustomFieldsMetabox context={customFieldContext} position="normal" />
          )}

          {/* Editor footer with word/character/block stats */}
          <EditorFooter
            wordCount={editorStats.wordCount}
            characterCount={editorStats.characterCount}
            blockCount={editorStats.blockCount}
            readingTime={editorStats.readingTime}
          />
        </div>

        {/* Sidebar column */}
        <div className="space-y-3">
          {/* Publish box (sticky, always first, NOT draggable) */}
          <PublishBox
            contentType={contentType}
            mode={mode}
            postId={postId}
            userRole={userRole}
            status={status}
            visibility={visibility}
            password={password}
            scheduledFor={scheduledFor}
            isSticky={isSticky}
            publishedAt={publishedAt}
            onStatusChange={(val) => form.setFieldValue("status", val)}
            onVisibilityChange={(val) => form.setFieldValue("visibility", val)}
            onPasswordChange={(val) => form.setFieldValue("password", val)}
            onScheduledForChange={(val) => form.setFieldValue("scheduledFor", val)}
            onStickyChange={(val) => form.setFieldValue("isSticky", val)}
            onSaveDraft={handleSaveDraft}
            onPublish={handlePublish}
            onUpdate={handleUpdate}
            onSubmitForReview={handleSubmitForReview}
            onPreview={handlePreview}
            onTrash={handleTrash}
            onSwitchToDraft={() => {
              form.setFieldValue("status", "draft");
              handleSaveDraft();
            }}
            isSubmitting={isSubmitting}
            isDirty={isDirty}
          />

          {/* EditorSidebar wraps metaboxes with Document/Block tabs */}
          <EditorSidebar
            documentContent={
              <>
                {/* Draggable sidebar metaboxes with @dnd-kit */}
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={sortableIds}
                    strategy={verticalListSortingStrategy}
                  >
                    {sidebarMetaboxes.map((metabox) => renderMetabox(metabox.id))}
                  </SortableContext>
                </DndContext>

                {/* Custom fields: side position (sidebar metaboxes) */}
                {postId && (
                  <CustomFieldsMetabox context={customFieldContext} position="side" />
                )}
              </>
            }
            blockContent={
              <div className="text-xs text-muted-foreground p-4">
                Select a block to see its settings.
              </div>
            }
            hasSelectedBlock={false}
          />
        </div>
      </div>

      {/* Mobile fixed publish footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border px-4 py-2 flex items-center justify-between gap-2 lg:hidden z-20">
        <button
          type="button"
          onClick={handleSaveDraft}
          disabled={isSubmitting}
          className="text-xs text-primary hover:underline disabled:opacity-50"
        >
          Save Draft
        </button>
        <button
          type="button"
          onClick={
            status === "publish" || status === "future"
              ? handleUpdate
              : handlePublish
          }
          disabled={isSubmitting}
          className="bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium disabled:opacity-50"
        >
          {isSubmitting
            ? "Saving..."
            : status === "publish" || status === "future"
              ? "Update"
              : "Publish"}
        </button>
      </div>

      {/* Bottom padding for mobile footer */}
      <div className="h-14 lg:hidden" />
    </div>
  );
}

/**
 * Error Boundary for the editor layout.
 * Catches rendering errors to prevent full-page crashes.
 */
interface EditorErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class EditorErrorBoundary extends Component<
  { children: ReactNode },
  EditorErrorBoundaryState
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): EditorErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Editor error boundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="py-12 text-center">
          <h1 className="text-lg font-semibold text-foreground mb-2">
            Editor Error
          </h1>
          <p className="text-sm text-muted-foreground mb-4">
            Something went wrong in the editor. Your content has been
            auto-saved if autosave was active.
          </p>
          <p className="text-xs text-destructive mb-4 font-mono">
            {this.state.error?.message}
          </p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            className="text-sm text-primary hover:underline"
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * EditorLayout - Exported wrapper with error boundary
 */
export function EditorLayout(props: EditorLayoutProps) {
  return (
    <EditorErrorBoundary>
      <EditorLayoutInner {...props} />
    </EditorErrorBoundary>
  );
}
