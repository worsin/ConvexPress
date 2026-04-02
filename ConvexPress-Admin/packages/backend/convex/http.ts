import { httpRouter } from "convex/server";
import { loginHandler } from "./auth/login";
import { refreshHandler } from "./auth/refresh";
import { logoutHandler } from "./auth/logout";
import { jwksHandler } from "./auth/jwks";

// ─── API v1 HTTP Endpoint Handlers ────────────────────────────────────────
import { corsPreflightResponse } from "./http/helpers";
import { discoveryHandler } from "./http/discovery";
import {
  postsListHandler,
  postsGetHandler,
  postsCreateHandler,
  postsUpdateHandler,
  postsDeleteHandler,
} from "./http/posts";
import {
  pagesListHandler,
  pagesGetHandler,
  pagesCreateHandler,
  pagesUpdateHandler,
  pagesDeleteHandler,
} from "./http/pages";
import {
  commentsListHandler,
  commentsGetHandler,
  commentsCreateHandler,
  commentsUpdateHandler,
  commentsDeleteHandler,
} from "./http/comments";
import {
  mediaListHandler,
  mediaGetHandler,
  mediaUploadHandler,
  mediaDeleteHandler,
} from "./http/media";
import { usersListHandler, usersGetHandler } from "./http/users";
import {
  categoriesListHandler,
  categoriesCreateHandler,
  tagsListHandler,
  tagsCreateHandler,
} from "./http/taxonomies";
import { menusListHandler } from "./http/menus";
import { settingsReadHandler } from "./http/settings";
import { resendWebhookHandler } from "./http/resendWebhook";
import { clerkWebhookHandler } from "./auth/clerkWebhook";
import { analyticsTrackHandler } from "./http/analytics";
import { httpAction } from "./_generated/server";

const http = httpRouter();

// ─── CORS Preflight Handler ──────────────────────────────────────────────────
// Handles OPTIONS requests for all /api/ paths
const corsPreflight = httpAction(async () => {
  return corsPreflightResponse();
});

// ─── Auth Routes ────────────────────────────────────────────────────────────
http.route({
  path: "/auth/login",
  method: "OPTIONS",
  handler: corsPreflight,
});
http.route({
  path: "/auth/login",
  method: "POST",
  handler: loginHandler,
});
http.route({
  path: "/auth/refresh",
  method: "OPTIONS",
  handler: corsPreflight,
});
http.route({
  path: "/auth/refresh",
  method: "POST",
  handler: refreshHandler,
});
http.route({
  path: "/auth/logout",
  method: "OPTIONS",
  handler: corsPreflight,
});
http.route({
  path: "/auth/logout",
  method: "POST",
  handler: logoutHandler,
});
http.route({
  path: "/.well-known/jwks.json",
  method: "GET",
  handler: jwksHandler,
});

http.route({
  path: "/api/v1/discovery",
  method: "OPTIONS",
  handler: corsPreflight,
});
http.route({
  path: "/api/v1/posts",
  method: "OPTIONS",
  handler: corsPreflight,
});
http.route({
  path: "/api/v1/pages",
  method: "OPTIONS",
  handler: corsPreflight,
});
http.route({
  path: "/api/v1/comments",
  method: "OPTIONS",
  handler: corsPreflight,
});
http.route({
  path: "/api/v1/media",
  method: "OPTIONS",
  handler: corsPreflight,
});
http.route({
  path: "/api/v1/users",
  method: "OPTIONS",
  handler: corsPreflight,
});
http.route({
  path: "/api/v1/categories",
  method: "OPTIONS",
  handler: corsPreflight,
});
http.route({
  path: "/api/v1/tags",
  method: "OPTIONS",
  handler: corsPreflight,
});
http.route({
  path: "/api/v1/menus",
  method: "OPTIONS",
  handler: corsPreflight,
});
http.route({
  path: "/api/v1/settings",
  method: "OPTIONS",
  handler: corsPreflight,
});

// ─── Discovery (Public, no auth) ─────────────────────────────────────────────
http.route({
  path: "/api/v1/discovery",
  method: "GET",
  handler: discoveryHandler,
});

// ─── Posts (/api/v1/posts) ───────────────────────────────────────────────────
http.route({
  path: "/api/v1/posts",
  method: "GET",
  handler: postsListHandler,
});
http.route({
  path: "/api/v1/posts",
  method: "POST",
  handler: postsCreateHandler,
});

// Note: Convex HTTP router does not support path params like /posts/:id.
// Dynamic ID routes are handled by matching the prefix path and extracting
// the ID from the URL within the handler. We use pathPrefix routing.
http.route({
  pathPrefix: "/api/v1/posts/",
  method: "GET",
  handler: postsGetHandler,
});
http.route({
  pathPrefix: "/api/v1/posts/",
  method: "PUT",
  handler: postsUpdateHandler,
});
http.route({
  pathPrefix: "/api/v1/posts/",
  method: "DELETE",
  handler: postsDeleteHandler,
});
http.route({
  pathPrefix: "/api/v1/posts/",
  method: "OPTIONS",
  handler: corsPreflight,
});

// ─── Pages (/api/v1/pages) ──────────────────────────────────────────────────
http.route({
  path: "/api/v1/pages",
  method: "GET",
  handler: pagesListHandler,
});
http.route({
  path: "/api/v1/pages",
  method: "POST",
  handler: pagesCreateHandler,
});

http.route({
  pathPrefix: "/api/v1/pages/",
  method: "GET",
  handler: pagesGetHandler,
});
http.route({
  pathPrefix: "/api/v1/pages/",
  method: "PUT",
  handler: pagesUpdateHandler,
});
http.route({
  pathPrefix: "/api/v1/pages/",
  method: "DELETE",
  handler: pagesDeleteHandler,
});
http.route({
  pathPrefix: "/api/v1/pages/",
  method: "OPTIONS",
  handler: corsPreflight,
});

// ─── Comments (/api/v1/comments) ─────────────────────────────────────────────
http.route({
  path: "/api/v1/comments",
  method: "GET",
  handler: commentsListHandler,
});
http.route({
  path: "/api/v1/comments",
  method: "POST",
  handler: commentsCreateHandler,
});

http.route({
  pathPrefix: "/api/v1/comments/",
  method: "GET",
  handler: commentsGetHandler,
});
http.route({
  pathPrefix: "/api/v1/comments/",
  method: "PUT",
  handler: commentsUpdateHandler,
});
http.route({
  pathPrefix: "/api/v1/comments/",
  method: "DELETE",
  handler: commentsDeleteHandler,
});
http.route({
  pathPrefix: "/api/v1/comments/",
  method: "OPTIONS",
  handler: corsPreflight,
});

// ─── Media (/api/v1/media) ──────────────────────────────────────────────────
http.route({
  path: "/api/v1/media",
  method: "GET",
  handler: mediaListHandler,
});
http.route({
  path: "/api/v1/media",
  method: "POST",
  handler: mediaUploadHandler,
});

http.route({
  pathPrefix: "/api/v1/media/",
  method: "GET",
  handler: mediaGetHandler,
});
http.route({
  pathPrefix: "/api/v1/media/",
  method: "DELETE",
  handler: mediaDeleteHandler,
});
http.route({
  pathPrefix: "/api/v1/media/",
  method: "OPTIONS",
  handler: corsPreflight,
});

// ─── Users (/api/v1/users) ──────────────────────────────────────────────────
http.route({
  path: "/api/v1/users",
  method: "GET",
  handler: usersListHandler,
});

http.route({
  pathPrefix: "/api/v1/users/",
  method: "GET",
  handler: usersGetHandler,
});
http.route({
  pathPrefix: "/api/v1/users/",
  method: "OPTIONS",
  handler: corsPreflight,
});

// ─── Taxonomies (/api/v1/categories, /api/v1/tags) ──────────────────────────
http.route({
  path: "/api/v1/categories",
  method: "GET",
  handler: categoriesListHandler,
});
http.route({
  path: "/api/v1/categories",
  method: "POST",
  handler: categoriesCreateHandler,
});
http.route({
  path: "/api/v1/tags",
  method: "GET",
  handler: tagsListHandler,
});
http.route({
  path: "/api/v1/tags",
  method: "POST",
  handler: tagsCreateHandler,
});

// ─── Menus (/api/v1/menus) ──────────────────────────────────────────────────
http.route({
  path: "/api/v1/menus",
  method: "GET",
  handler: menusListHandler,
});

// ─── Settings (/api/v1/settings) ─────────────────────────────────────────────
http.route({
  path: "/api/v1/settings",
  method: "GET",
  handler: settingsReadHandler,
});

// ─── Webhooks (/webhooks/) ──────────────────────────────────────────────────
http.route({
  path: "/webhooks/resend",
  method: "OPTIONS",
  handler: corsPreflight,
});
http.route({
  path: "/webhooks/resend",
  method: "POST",
  handler: resendWebhookHandler,
});
http.route({
  path: "/webhooks/clerk",
  method: "POST",
  handler: clerkWebhookHandler,
});

// ─── Analytics Tracking (Public, no auth) ───────────────────────────────────
http.route({
  path: "/api/analytics/track",
  method: "OPTIONS",
  handler: corsPreflight,
});
http.route({
  path: "/api/analytics/track",
  method: "POST",
  handler: analyticsTrackHandler,
});

export default http;
