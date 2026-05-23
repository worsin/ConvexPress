/**
 * EditorLayout - Root layout for post/page editor
 *
 * Provides the two-column grid layout, EditorHeader, metabox sidebar with
 * @dnd-kit drag-and-drop reordering, and coordinates all editor state.
 * Uses auth context for role-aware rendering.
 */

import { Component, useCallback, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from "react";
import { DndContext, closestCenter } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useQuery } from "convex-helpers/react/cache";
import { useStore } from "@tanstack/react-form";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { EditorHeader } from "./EditorHeader";
import { TitleInput } from "./TitleInput";
import { SlugEditor } from "./SlugEditor";
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
import { RestrictionMetabox } from "@/components/membership/RestrictionMetabox";
import { PageAttributesMetabox } from "./PageAttributesMetabox";
import { LayoutMetabox } from "./LayoutMetabox";
import { PostEditLockNotice } from "./PostEditLockNotice";
import { EditorFooter } from "./EditorFooter";
import { EditorSidebar } from "./EditorSidebar";
import { CustomFieldsMetabox } from "@/components/custom-fields/metabox/CustomFieldsMetabox";
import type { EditorContext } from "@/components/custom-fields/metabox/CustomFieldsMetabox";
import { BlockOutline } from "@/components/blocks/BlockOutline";
import { BlockOutlinePanel } from "@/components/blocks/BlockOutlinePanel";
import { PageGenerationPrompt } from "@/components/blocks/PageGenerationPrompt";
import type { ConvexPressBlock } from "@/lib/blocks/types";
import { getBlockDefinition } from "@/lib/blocks/registry";
import { validateBlockInstance } from "@/lib/blocks/validation";
import { AutosaveRecoveryDialog } from "./AutosaveRecoveryDialog";
import { useEditorForm } from "@/hooks/useEditorForm";
import { useAutosave } from "@/hooks/useAutosave";
import { useMetaboxOrder } from "@/hooks/useMetaboxOrder";
import { useEditorKeyboardShortcuts } from "@/hooks/useEditorKeyboardShortcuts";
import { useUnsavedChangesWarning } from "@/hooks/useUnsavedChangesWarning";
import { useAuth } from "@/lib/auth-context";
import type { EditorContentType, EditorFormValues, TagItem, CompositionBlock } from "@/types/editor";

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
  const { role, user } = useAuth();
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
  const editorTaxonomies = useQuery(
    api.taxonomies.queries.getByPost,
    contentType === "post" && postId ? { postId: postId as Id<"posts"> } : "skip",
  );

  // Editor form state
  const {
    form,
    isSubmitting,
    handleSaveDraft,
    handlePublish,
    handleUpdate,
    handleSubmitForReview,
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
  const parentPageId = formValues.parentId;
  const pageTemplate = formValues.pageTemplate;
  const layoutId = formValues.layoutId;
  const hideHeader = formValues.hideHeader;
  const hideFooter = formValues.hideFooter;
  const contentMode = formValues.contentMode;
  const compositionBlocks = formValues.blocks as unknown as ConvexPressBlock[];
  const blocksRevision = formValues.blocksRevision;
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const selectedBlock = useMemo(
    () => findBlockInTree(compositionBlocks, selectedBlockId),
    [compositionBlocks, selectedBlockId],
  );

  // Track manually selected tags (with full data for display)
  const [selectedTags, setSelectedTags] = useState<TagItem[]>([]);
  const hydratedTagsForPostRef = useRef<string | null>(null);

  useEffect(() => {
    if (!editorTaxonomies?.tags) return;
    const hydrationKey = postId ?? "new";
    if (hydratedTagsForPostRef.current === hydrationKey) return;

    setSelectedTags(
      editorTaxonomies.tags.map((tag: { _id: string; name: string; slug: string }) => ({
        id: tag._id,
        name: tag.name,
        slug: tag.slug,
      })),
    );
    hydratedTagsForPostRef.current = hydrationKey;
  }, [editorTaxonomies?.tags, postId]);

  // Editor stats for EditorFooter (computed from content)
  const editorStats = useMemo(() => {
    if (contentMode === "blocks") {
      const plainText = blocksToPlainText(compositionBlocks);
      const words = plainText.trim().split(/\s+/).filter(Boolean);
      return {
        wordCount: words.length,
        characterCount: plainText.length,
        blockCount: compositionBlocks.length,
        readingTime: Math.max(1, Math.ceil(words.length / 200)),
      };
    }

    // Content might be JSON (TipTap) or plain text
    let plainText = "";
    try {
      const parsed = JSON.parse(content);
      // Extract text recursively from TipTap JSON
      const extractText = (node: unknown): string => {
        if (!node || typeof node !== "object") return "";
        const typedNode = node as { text?: unknown; content?: unknown[] };
        if (typeof typedNode.text === "string") return typedNode.text;
        if (typedNode.content) return typedNode.content.map(extractText).join(" ");
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
  }, [compositionBlocks, content, contentMode]);

  // NOTE: SEO state is managed by the dedicated SeoMetabox component
  // (components/seo/SeoMetabox.tsx) which uses its own seo table via usePostSeo.
  // No SEO state is needed here in EditorLayout.

  // Legacy page parent fallback from older postMeta storage.
  const parentPageInitializedRef = useRef(false);

  useEffect(() => {
    if (
      parentPageInitializedRef.current ||
      !postMetaRecords ||
      mode !== "edit" ||
      contentType !== "page"
    ) {
      return;
    }

    parentPageInitializedRef.current = true;
    const metaParentId = postMetaMap.get("_parent_page_id");
    if (metaParentId && !form.state.values.parentId) {
      form.setFieldValue("parentId", metaParentId);
    }
  }, [contentType, form, mode, postMetaMap, postMetaRecords]);

  // Slug manual edit tracking
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  // Autosave
  const autosaveState = useAutosave({
    postId: postId ?? null,
    title,
    content,
    enabled: !isSubmitting && Boolean(postId),
  });

  // Metabox ordering with @dnd-kit
  const {
    metaboxes,
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
            pageTemplate={pageTemplate}
            currentPageId={postId}
            onParentChange={(val) => form.setFieldValue("parentId", val)}
            onMenuOrderChange={(val) => form.setFieldValue("menuOrder", val)}
            onTemplateChange={(val) => form.setFieldValue("pageTemplate", val)}
          />
        );
      case "layout":
        return (
          <LayoutMetabox
            layoutId={layoutId}
            hideHeader={hideHeader}
            hideFooter={hideFooter}
            onLayoutChange={(val) => form.setFieldValue("layoutId", val)}
            onHideHeaderChange={(val) => form.setFieldValue("hideHeader", val)}
            onHideFooterChange={(val) => form.setFieldValue("hideFooter", val)}
          />
        );
      case "restriction":
        return postId ? (
          <RestrictionMetabox
            resourceType={contentType}
            resourceIdOrKey={postId}
            resourceLabel={title}
          />
        ) : null;
      default:
        return null;
    }
  }

  // Sidebar metaboxes (excluding publish, which is rendered separately)
  const sidebarMetaboxes = metaboxes.filter(
    (m) => m.position === "sidebar" && m.id !== "publish",
  );

  const handleBlocksChange = useCallback(
    (blocks: ConvexPressBlock[], revision?: number) => {
      form.setFieldValue("blocks", blocks as unknown as CompositionBlock[]);
      if (revision !== undefined) {
        form.setFieldValue("blocksRevision", revision);
      }
    },
    [form],
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

          {postId ? (
            <div className="space-y-3">
              <PageGenerationPrompt
                postId={postId}
                pageType={contentType}
                expectedRevision={blocksRevision ?? 0}
                existingBlockCount={compositionBlocks.length}
              />
              <BlockOutline
                postId={postId}
                value={compositionBlocks}
                revision={blocksRevision}
                onChange={handleBlocksChange}
                onSelectedBlockChange={setSelectedBlockId}
                label={contentType === "post" ? "Post Blocks" : "Page Blocks"}
              />
            </div>
          ) : (
            <div className="border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Save the draft to enable the block editor.
            </div>
          )}

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
        <div className="space-y-3 sticky top-16 max-h-[calc(100vh-5rem)] overflow-y-auto">
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

          {/* Block outline panel — jump-to-block sidebar */}
          {compositionBlocks.length > 0 && (
            <BlockOutlinePanel blocks={compositionBlocks} />
          )}

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
              <SelectedBlockSidebar block={selectedBlock} />
            }
            hasSelectedBlock={Boolean(selectedBlock)}
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

function blocksToPlainText(blocks: ConvexPressBlock[]) {
  const values: string[] = [];
  const visitValue = (value: unknown) => {
    if (typeof value === "string") {
      values.push(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visitValue);
      return;
    }
    if (value && typeof value === "object") {
      Object.values(value as Record<string, unknown>).forEach(visitValue);
    }
  };
  for (const block of blocks) {
    visitValue(block.attrs);
    if (block.innerBlocks) values.push(blocksToPlainText(block.innerBlocks));
  }
  return values.join(" ");
}

function findBlockInTree(
  blocks: ConvexPressBlock[],
  blockId: string | null,
): ConvexPressBlock | null {
  if (!blockId) return null;
  for (const block of blocks) {
    if (block.id === blockId) return block;
    if (block.innerBlocks) {
      const found = findBlockInTree(block.innerBlocks, blockId);
      if (found) return found;
    }
  }
  return null;
}

function SelectedBlockSidebar({ block }: { block: ConvexPressBlock | null }) {
  if (!block) {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        Select a block to inspect its type, version, validation state, and
        saved fields.
      </div>
    );
  }

  const definition = getBlockDefinition(block.name);
  const validation = validateBlockInstance(block);
  const attrs = Object.entries(block.attrs ?? {});

  return (
    <div className="space-y-4 p-4 text-xs">
      <div>
        <h3 className="text-sm font-semibold text-foreground">
          {definition?.title ?? block.name}
        </h3>
        <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
          {block.name}
        </p>
      </div>

      <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-2">
        <dt className="font-medium text-muted-foreground">ID</dt>
        <dd className="break-all font-mono text-foreground">{block.id}</dd>
        <dt className="font-medium text-muted-foreground">Version</dt>
        <dd className="text-foreground">v{block.version}</dd>
        <dt className="font-medium text-muted-foreground">Category</dt>
        <dd className="text-foreground">{definition?.category ?? "unknown"}</dd>
        <dt className="font-medium text-muted-foreground">Status</dt>
        <dd className={validation.ok ? "text-foreground" : "text-destructive"}>
          {validation.ok ? "Valid" : validation.message}
        </dd>
      </dl>

      <div>
        <h4 className="mb-2 font-medium text-muted-foreground">Fields</h4>
        {attrs.length === 0 ? (
          <p className="text-muted-foreground">No attrs saved.</p>
        ) : (
          <dl className="space-y-2">
            {attrs.map(([key, value]) => (
              <div key={key} className="border border-border bg-background p-2">
                <dt className="font-mono text-[11px] text-muted-foreground">{key}</dt>
                <dd className="mt-1 break-words text-foreground">
                  {formatSidebarValue(value)}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}

function formatSidebarValue(value: unknown) {
  if (value === null || value === undefined) return "empty";
  if (typeof value === "string") return value || "empty";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? "" : "s"}`;
  if (typeof value === "object") return "object";
  return String(value);
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
