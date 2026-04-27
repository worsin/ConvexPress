/**
 * CustomFieldsMetabox - Renders matching field groups as metaboxes on post/page editor
 *
 * Uses `useQuery(api.customFields.queries.getGroupsForContext)` with the current editor context
 * to determine which field groups should appear.
 *
 * Positions metaboxes according to their `position` setting:
 * - "normal" - Main content area, below the editor
 * - "side" - Sidebar area
 * - "after_title" - Between title and editor
 *
 * Each matching group renders as a MetaboxRenderer with its fields.
 */

import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import { MetaboxRenderer } from "./MetaboxRenderer";

export interface EditorContext {
  /** Entity type: "post", "page", etc. */
  entityType: string;
  /** Entity ID (Convex document ID as string) */
  entityId: string;
  /** Post type slug */
  postType?: string;
  /** Post template */
  postTemplate?: string;
  /** Post status */
  postStatus?: string;
  /** Category IDs assigned to the post */
  postCategories?: string[];
  /** Page template */
  pageTemplate?: string;
  /** Page type (e.g., "front_page", "posts_page") */
  pageType?: string;
  /** Parent page ID */
  pageParent?: string;
  /** Current user's role */
  currentUserRole?: string;
  /** Active taxonomy on the editor */
  taxonomy?: string;
}

interface CustomFieldsMetaboxProps {
  /** Editor context for location rule evaluation */
  context: EditorContext;
  /** Which position slot to render metaboxes for */
  position: "normal" | "side" | "after_title";
}

type MatchingFieldGroup = {
  _id: string;
  title: string;
  key: string;
  style?: string;
  labelPlacement?: string;
  instructionPlacement?: string;
  position?: string;
  fields: Array<{
    _id: string;
    label: string;
    name: string;
    key: string;
    type: string;
    instructions?: string;
    required: boolean;
    defaultValue?: string;
    settings: string;
    parentFieldId?: string;
    conditionalLogic?: string;
  }>;
};

export function CustomFieldsMetabox({ context, position }: CustomFieldsMetaboxProps) {
  // Fetch field groups matching this editor context
  const matchingGroups = useQuery(api.customFields.queries.getGroupsForContext, {
    postType: context.postType,
    postTemplate: context.postTemplate,
    postStatus: context.postStatus,
    postCategories: context.postCategories,
    pageTemplate: context.pageTemplate,
    pageType: context.pageType,
    pageParent: context.pageParent,
    currentUserRole: context.currentUserRole,
    taxonomy: context.taxonomy,
  });

  // undefined = still loading; null = plugin disabled or no access
  if (!matchingGroups) {
    return null;
  }

  // Filter groups to only those matching the requested position
  const groupsForPosition = (matchingGroups as MatchingFieldGroup[]).filter(
    (group) => (group.position ?? "normal") === position
  );

  if (groupsForPosition.length === 0) {
    return null;
  }

  return (
    <>
      {groupsForPosition.map((group) => (
        <MetaboxRenderer
          key={group._id}
          group={group}
          fields={group.fields}
          entityType={context.entityType}
          entityId={context.entityId}
        />
      ))}
    </>
  );
}
