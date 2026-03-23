/**
 * Dashboard System - Queries
 *
 * All read operations for the admin and website dashboards:
 *   getWidgetPreferences   - Load user's widget layout for a surface
 *   getAtAGlance           - Count posts/pages/comments/users by status
 *   getActivityFeed        - Recent published posts + recent comments
 *   getQuickDrafts         - Current user's recent draft posts
 *   getWebsiteDashboard    - Personal dashboard data for website users
 *
 * Authorization:
 *   - All queries require authentication
 *   - Data is filtered based on user capabilities
 *   - getAtAGlance returns null for sections the user cannot access
 *   - getWebsiteDashboard returns only the current user's own data
 */

import { v } from "convex/values";
import { query } from "../_generated/server";
import { getCurrentUser, currentUserCan, getCurrentRoleLevel , getUserIdentifier } from "../helpers/permissions";
import {
  getContentCounts,
  getCommentCounts,
  getUserCount,
  getDefaultWidgetOrder,
} from "./helpers";

// ─── Get Widget Preferences ─────────────────────────────────────────────────

/**
 * Load user's dashboard widget preferences for a surface.
 *
 * Returns saved preferences or defaults if none exist.
 * Always requires authentication.
 */
export const getWidgetPreferences = query({
  args: {
    surface: v.union(v.literal("admin"), v.literal("website")),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const prefs = await ctx.db
      .query("dashboardPreferences")
      .withIndex("by_user_surface", (q) =>
        q.eq("userId", user._id).eq("surface", args.surface),
      )
      .unique();

    if (prefs) {
      return {
        widgetOrder: prefs.widgetOrder,
        hiddenWidgets: prefs.hiddenWidgets,
        collapsedWidgets: prefs.collapsedWidgets,
        welcomeDismissed: prefs.welcomeDismissed,
      };
    }

    // Return defaults using shared constant
    return {
      widgetOrder: getDefaultWidgetOrder(args.surface),
      hiddenWidgets: [] as string[],
      collapsedWidgets: [] as string[],
      welcomeDismissed: false,
    };
  },
});

// ─── At a Glance ────────────────────────────────────────────────────────────

/**
 * Get content, comment, and user counts for the At a Glance widget.
 *
 * Filters data by user capabilities:
 *   - post.read required for post counts
 *   - page.read required for page counts
 *   - comment.read required for comment counts
 *   - profile.view required for user counts
 */
export const getAtAGlance = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const canReadPosts = await currentUserCan(ctx, "post.read");
    const canReadPages = await currentUserCan(ctx, "page.read");
    const canReadComments = await currentUserCan(ctx, "comment.read");
    const canViewUsers = await currentUserCan(ctx, "profile.view");

    const contentCounts = canReadPosts || canReadPages
      ? await getContentCounts(ctx)
      : null;

    const commentCounts = canReadComments
      ? await getCommentCounts(ctx)
      : null;

    const userCount = canViewUsers
      ? await getUserCount(ctx)
      : null;

    return {
      posts: canReadPosts && contentCounts ? contentCounts.posts : null,
      pages: canReadPages && contentCounts ? contentCounts.pages : null,
      comments: commentCounts,
      users: userCount,
    };
  },
});

// ─── Activity Feed ──────────────────────────────────────────────────────────

/**
 * Get recent activity for the Activity Feed widget.
 *
 * Returns:
 *   - Last 5 published posts (with author info)
 *   - Last 5 comments (with author name and post title)
 *
 * Role-based filtering (enforced server-side):
 *   - Editors+ (level 80+): See all posts and all comments
 *   - Authors (level 60+): See all published posts + own drafts; comments on own posts
 *   - Contributors (level 40+): See own drafts only; comments on own posts
 *   - Below Contributor: No access
 */
export const getActivityFeed = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const canReadPosts = await currentUserCan(ctx, "post.read");
    const canReadComments = await currentUserCan(ctx, "comment.read");
    const roleLevel = await getCurrentRoleLevel(ctx);

    // Recent posts -- role-filtered
    let recentPosts: Array<{
      _id: string;
      title: string;
      publishedAt: number | undefined;
      authorName: string;
    }> = [];

    if (canReadPosts) {
      if (roleLevel >= 80) {
        // Editors+: See all published posts
        const posts = await ctx.db
          .query("posts")
          .withIndex("by_type_status", (q) =>
            q.eq("type", "post").eq("status", "publish"),
          )
          .order("desc")
          .take(5);

        recentPosts = await Promise.all(
          posts.map(async (post) => {
            const author = await ctx.db.get("users", post.authorId);
            return {
              _id: post._id,
              title: post.title,
              publishedAt: post.publishedAt,
              authorName: author?.displayName ?? author?.email ?? "Unknown",
            };
          }),
        );
      } else if (roleLevel >= 60) {
        // Authors: All published posts + own drafts
        const publishedPosts = await ctx.db
          .query("posts")
          .withIndex("by_type_status", (q) =>
            q.eq("type", "post").eq("status", "publish"),
          )
          .order("desc")
          .take(5);

        const ownDrafts = await ctx.db
          .query("posts")
          .withIndex("by_author", (q) =>
            q.eq("authorId", user._id).eq("type", "post").eq("status", "draft"),
          )
          .order("desc")
          .take(3);

        // Merge, deduplicate, sort by creation time, take 5
        const allPosts = [...publishedPosts, ...ownDrafts];
        const seenIds = new Set<string>();
        const dedupedPosts = allPosts.filter((p) => {
          if (seenIds.has(p._id)) return false;
          seenIds.add(p._id);
          return true;
        });
        dedupedPosts.sort((a, b) => b._creationTime - a._creationTime);

        recentPosts = await Promise.all(
          dedupedPosts.slice(0, 5).map(async (post) => {
            const author = await ctx.db.get("users", post.authorId);
            return {
              _id: post._id,
              title: post.title,
              publishedAt: post.publishedAt,
              authorName: author?.displayName ?? author?.email ?? "Unknown",
            };
          }),
        );
      } else {
        // Contributors: Own drafts only
        const ownDrafts = await ctx.db
          .query("posts")
          .withIndex("by_author", (q) =>
            q.eq("authorId", user._id).eq("type", "post").eq("status", "draft"),
          )
          .order("desc")
          .take(5);

        recentPosts = await Promise.all(
          ownDrafts.map(async (post) => {
            const author = await ctx.db.get("users", post.authorId);
            return {
              _id: post._id,
              title: post.title,
              publishedAt: post.publishedAt,
              authorName: author?.displayName ?? author?.email ?? "Unknown",
            };
          }),
        );
      }
    }

    // Recent comments -- role-filtered
    let recentComments: Array<{
      _id: string;
      content: string;
      authorName: string;
      postTitle: string;
      postId: string;
      status: string;
      createdAt: number;
    }> = [];

    if (canReadComments) {
      const comments = await ctx.db
        .query("comments")
        .withIndex("by_status", (q) => q.eq("status", "approved"))
        .order("desc")
        .take(20); // Fetch extra to filter by ownership for non-editors

      // Editors+ see all comments; Authors/Contributors see only comments on own posts
      let filteredComments = comments;
      if (roleLevel < 80) {
        // Get user's own post IDs for ownership filtering
        // Bounded to 10,000 posts per user
        const ownPosts = await ctx.db
          .query("posts")
          .withIndex("by_author", (q) =>
            q.eq("authorId", user._id).eq("type", "post"),
          )
          .take(10000);
        const ownPostIds = new Set(ownPosts.map((p) => p._id));
        filteredComments = comments.filter((c) => ownPostIds.has(c.postId));
      }

      recentComments = await Promise.all(
        filteredComments.slice(0, 5).map(async (comment) => {
          const post = await ctx.db.get("posts", comment.postId);
          return {
            _id: comment._id,
            content:
              comment.content.length > 120
                ? comment.content.substring(0, 120) + "..."
                : comment.content,
            authorName: comment.authorName,
            postTitle: post?.title ?? "Deleted Post",
            postId: comment.postId,
            status: comment.status,
            createdAt: comment.createdAt,
          };
        }),
      );
    }

    return {
      recentPosts,
      recentComments,
    };
  },
});

// ─── Quick Drafts ───────────────────────────────────────────────────────────

/**
 * Get the current user's recent draft posts for the Quick Draft widget.
 *
 * Returns the last 3 drafts authored by the current user.
 * Requires post.read or post.create capability.
 */
export const getQuickDrafts = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const canCreatePosts = await currentUserCan(ctx, "post.create");
    if (!canCreatePosts) return null;

    const drafts = await ctx.db
      .query("posts")
      .withIndex("by_author", (q) =>
        q.eq("authorId", user._id).eq("type", "post").eq("status", "draft"),
      )
      .order("desc")
      .take(3);

    return drafts.map((draft) => ({
      _id: draft._id,
      title: draft.title || "(no title)",
      excerpt: draft.excerpt
        ? draft.excerpt.substring(0, 100)
        : draft.content
          ? draft.content.substring(0, 100)
          : "",
      createdAt: draft.createdAt,
    }));
  },
});

// ─── Website Dashboard ─────────────────────────────────────────────────────

/**
 * Get personal dashboard data for authenticated website users.
 *
 * Returns the current user's own content:
 *   - myPosts:               Post counts by status + recent posts list
 *   - myComments:            Recent comments authored by the user
 *   - unreadNotifications:   Unread notification count + recent notifications
 *   - contentPerformance:    Top posts by view count (Author+ only, null if unavailable)
 *
 * Auth: Any authenticated user (Subscriber+).
 * All data is scoped to the current user -- no cross-user data leakage.
 */
export const getWebsiteDashboard = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    // ── My Posts ────────────────────────────────────────────────────────────
    // Count the user's own posts by status using the by_author index
    // Bounded to 10,000 per status for dashboard counting
    const publishedPosts = await ctx.db
      .query("posts")
      .withIndex("by_author", (q) =>
        q.eq("authorId", user._id).eq("type", "post").eq("status", "publish"),
      )
      .take(10000);

    const draftPosts = await ctx.db
      .query("posts")
      .withIndex("by_author", (q) =>
        q.eq("authorId", user._id).eq("type", "post").eq("status", "draft"),
      )
      .take(10000);

    const pendingPosts = await ctx.db
      .query("posts")
      .withIndex("by_author", (q) =>
        q.eq("authorId", user._id).eq("type", "post").eq("status", "pending"),
      )
      .take(10000);

    // Merge all user posts and sort by createdAt desc to get recent list
    const allUserPosts = [...publishedPosts, ...draftPosts, ...pendingPosts];
    allUserPosts.sort((a, b) => b.createdAt - a.createdAt);

    const myPosts = {
      counts: {
        published: publishedPosts.length,
        draft: draftPosts.length,
        pending: pendingPosts.length,
      },
      recent: allUserPosts.slice(0, 5).map((post) => ({
        _id: post._id,
        title: post.title || "(no title)",
        status: post.status,
        date: post.createdAt,
      })),
    };

    // ── My Comments ────────────────────────────────────────────────────────
    // Comments use WorkOS user ID as authorId (string), not Convex ID
    const userComments = await ctx.db
      .query("comments")
      .withIndex("by_author", (q) =>
        q.eq("authorId", getUserIdentifier(user)),
      )
      .order("desc")
      .take(5);

    const myComments = await Promise.all(
      userComments.map(async (comment) => {
        const post = await ctx.db.get("posts", comment.postId);
        return {
          _id: comment._id,
          excerpt:
            comment.content.length > 100
              ? comment.content.substring(0, 100) + "..."
              : comment.content,
          postTitle: post?.title ?? "Deleted Post",
          status: comment.status,
          date: comment.createdAt,
        };
      }),
    );

    // ── Unread Notifications ───────────────────────────────────────────────
    // siteNotifications uses WorkOS user ID as userId (string)
    // Unread notifications have readAt === undefined
    const unreadNotifications = await ctx.db
      .query("siteNotifications")
      .withIndex("by_user_unread", (q) =>
        q.eq("userId", getUserIdentifier(user)).eq("readAt", undefined),
      )
      .order("desc")
      .take(50);

    // Filter out dismissed notifications
    const activeUnread = unreadNotifications.filter((n) => !n.dismissedAt);

    const recentNotifications = activeUnread.slice(0, 5).map((notification) => ({
      _id: notification._id,
      message: notification.message,
      type: notification.type,
      date: notification.createdAt,
      link: notification.actionUrl ?? null,
    }));

    // ── Content Performance ────────────────────────────────────────────────
    // Author+ only (level 60+). Depends on view tracking which is not yet
    // implemented, so return null for now to show "Coming soon" state.
    const canEditPublished = await currentUserCan(ctx, "post.update");
    const contentPerformance = canEditPublished ? [] : null;

    return {
      myPosts,
      myComments,
      unreadNotifications: {
        count: activeUnread.length,
        recent: recentNotifications,
      },
      contentPerformance,
    };
  },
});
