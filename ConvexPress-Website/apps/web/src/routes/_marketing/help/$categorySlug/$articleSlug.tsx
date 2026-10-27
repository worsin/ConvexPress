import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, ErrorComponent } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { isPublicPluginEnabled } from "@/lib/plugins/public";
import { helpPageTitle } from "@/lib/help-trail";
import CoreHelpArticle, {
  type HelpArticleSurfaceData,
  type KbArticle,
  type KbUserFeedback,
} from "@/templates/packs/core/surfaces/help.article";
import { Surface } from "@/templates/sdk/Surface";

export const Route = createFileRoute(
  "/_marketing/help/$categorySlug/$articleSlug",
)({
  component: ArticleReader,
  errorComponent: ErrorComponent,
  loader: async ({ context: { queryClient }, params }) => {
    const publicSettings = await queryClient.ensureQueryData(
      convexQuery(api.settings.queries.getPublic, {}),
    );

    if (!isPublicPluginEnabled("kb", publicSettings)) {
      return { title: null };
    }

    const article = await queryClient.ensureQueryData(
      convexQuery(api.kb.queries.getBySlug, { slug: params.articleSlug }),
    );
    return { title: article?.title ?? null };
  },
  head: ({ params, loaderData }) => ({
    meta: [{ title: helpPageTitle(loaderData?.title, params.articleSlug) }],
  }),
});

function ArticleReader() {
  const { categorySlug, articleSlug } = Route.useParams();
  const { data: article }: { data: KbArticle | null } = useSuspenseQuery(
    convexQuery(api.kb.queries.getBySlug, { slug: articleSlug }),
  );

  // Session ID — initialized client-side only to avoid SSR hydration mismatches
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);

  useEffect(() => {
    let id = sessionStorage.getItem("kb_session_id");
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem("kb_session_id", id);
    }
    setSessionId(id);
  }, []);

  const trackView = useMutation(api.kb.analytics.trackPageView);
  const submitFeedback = useMutation(api.kb.feedback.submitHelpful);

  const art = article;

  // Track page view on mount — only after sessionId is ready client-side
  // Ref guard prevents double-fire in React 18 StrictMode
  const hasTrackedRef = useRef(false);
  useEffect(() => {
    if (hasTrackedRef.current) return;
    if (!art?._id || !sessionId) return;
    hasTrackedRef.current = true;
    void trackView({
      articleId: art._id,
      sessionId,
      referrer: document.referrer || undefined,
      userAgent: navigator.userAgent || undefined,
    });
  }, [art?._id, sessionId, trackView]);

  // Get existing feedback to show which button is already selected
  const userFeedback: KbUserFeedback = useQuery(
    api.kb.feedback.getUserFeedback,
    sessionId && art?._id ? { articleId: art._id, sessionId } : "skip",
  );

  async function handleFeedback(isHelpful: boolean) {
    if (!art?._id || !sessionId) return;
    await submitFeedback({
      articleId: art._id,
      sessionId,
      isHelpful,
    });
  }

  const data: HelpArticleSurfaceData = {
    categorySlug,
    article: art,
    userFeedback,
    actions: { sendFeedback: (isHelpful) => void handleFeedback(isHelpful) },
  };

  return <Surface name="help.article" data={data} fallback={CoreHelpArticle} />;
}
