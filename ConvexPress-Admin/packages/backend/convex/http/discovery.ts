/**
 * API Discovery Endpoint
 *
 * GET /api/v1/discovery
 * Public, no authentication required.
 * Returns available API endpoints and authentication info.
 *
 * WordPress equivalent: /wp-json/ root discovery endpoint
 */

import { httpAction } from "../_generated/server";
import { jsonResponse } from "./helpers";

export const discoveryHandler = httpAction(async () => {
  return jsonResponse({
    name: "SmithHarper CMS API",
    version: "1.0",
    description:
      "RESTful API for SmithHarper CMS. Authenticate with a Bearer token (API key).",
    authentication: {
      type: "Bearer",
      header: "Authorization",
      format: "Bearer shk_...",
      description:
        "API keys can be created in the admin panel at /admin/api-keys. Each key has scoped permissions.",
    },
    endpoints: {
      posts: {
        list: { method: "GET", path: "/api/v1/posts", scope: "read:posts" },
        get: {
          method: "GET",
          path: "/api/v1/posts/:id",
          scope: "read:posts",
        },
        create: {
          method: "POST",
          path: "/api/v1/posts",
          scope: "write:posts",
        },
        update: {
          method: "PUT",
          path: "/api/v1/posts/:id",
          scope: "write:posts",
        },
        delete: {
          method: "DELETE",
          path: "/api/v1/posts/:id",
          scope: "write:posts",
        },
      },
      pages: {
        list: { method: "GET", path: "/api/v1/pages", scope: "read:posts" },
        get: {
          method: "GET",
          path: "/api/v1/pages/:id",
          scope: "read:posts",
        },
        create: {
          method: "POST",
          path: "/api/v1/pages",
          scope: "write:posts",
        },
        update: {
          method: "PUT",
          path: "/api/v1/pages/:id",
          scope: "write:posts",
        },
        delete: {
          method: "DELETE",
          path: "/api/v1/pages/:id",
          scope: "write:posts",
        },
      },
      comments: {
        list: {
          method: "GET",
          path: "/api/v1/comments",
          scope: "read:comments",
        },
        get: {
          method: "GET",
          path: "/api/v1/comments/:id",
          scope: "read:comments",
        },
        create: {
          method: "POST",
          path: "/api/v1/comments",
          scope: "write:comments",
        },
        update: {
          method: "PUT",
          path: "/api/v1/comments/:id",
          scope: "write:comments",
        },
        delete: {
          method: "DELETE",
          path: "/api/v1/comments/:id",
          scope: "write:comments",
        },
      },
      media: {
        list: { method: "GET", path: "/api/v1/media", scope: "read:media" },
        get: {
          method: "GET",
          path: "/api/v1/media/:id",
          scope: "read:media",
        },
        upload: {
          method: "POST",
          path: "/api/v1/media",
          scope: "write:media",
        },
        delete: {
          method: "DELETE",
          path: "/api/v1/media/:id",
          scope: "write:media",
        },
      },
      users: {
        list: { method: "GET", path: "/api/v1/users", scope: "read:users" },
        get: {
          method: "GET",
          path: "/api/v1/users/:id",
          scope: "read:users",
        },
      },
      categories: {
        list: {
          method: "GET",
          path: "/api/v1/categories",
          scope: "read:taxonomies",
        },
        create: {
          method: "POST",
          path: "/api/v1/categories",
          scope: "write:taxonomies",
        },
      },
      tags: {
        list: {
          method: "GET",
          path: "/api/v1/tags",
          scope: "read:taxonomies",
        },
        create: {
          method: "POST",
          path: "/api/v1/tags",
          scope: "write:taxonomies",
        },
      },
      menus: {
        list: { method: "GET", path: "/api/v1/menus", scope: "read:menus" },
      },
      settings: {
        read: {
          method: "GET",
          path: "/api/v1/settings",
          scope: "read:settings",
        },
      },
    },
    scopes: [
      "read:posts",
      "write:posts",
      "read:comments",
      "write:comments",
      "read:media",
      "write:media",
      "read:users",
      "write:users",
      "read:taxonomies",
      "write:taxonomies",
      "read:settings",
      "write:settings",
      "read:menus",
      "write:menus",
    ],
    pagination: {
      description:
        "Collection endpoints support pagination via page and per_page query parameters.",
      headers: ["X-Total", "X-Total-Pages", "X-Page", "X-Per-Page"],
      defaults: { page: 1, per_page: 10 },
      limits: { max_per_page: 100 },
    },
  });
});
