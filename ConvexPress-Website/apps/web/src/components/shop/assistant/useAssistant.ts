/**
 * Assistant state for one storefront session: the persisted thread, shopper
 * memory, the auto brief for the current page, and the send / brief actions.
 * Product cards referenced by any block are loaded once and shared.
 */

import { useAction, useMutation, useQuery, useConvexAuth } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { useCart } from "@/hooks/useCart";
import { useAuth } from "@/lib/auth/clerk";
import { getSiteRuntime } from "@/lib/site-runtime";
import { assistantIdentityReady } from "./prompt-handoff";
import type { ProductCardData } from "@/components/shop/ProductMiniCard";

export type AssistantBlock =
  | { type: "cart_proposal"; id: string; productId: string; variantId?: string; quantity: number; title: string; added: boolean }
  | { type: "text"; markdown: string }
  | { type: "product_group"; title: string; reason?: string; items: Array<{ productId: string; rationale?: string }>; seeMoreQuery?: string }
  | { type: "compare_table"; columns: string[]; rows: Array<{ productId: string; values: string[] }> }
  | { type: "callout"; tone: "tip" | "note" | "warning"; markdown: string }
  | { type: "action_result"; action: "cart_add" | "remember" | "forget"; ok: boolean; summary: string; productId?: string }
  | { type: "chips"; items: string[] }
  | { type: "facets"; items: Array<{ label: string; query?: string; categorySlug?: string }> };

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant" | "system";
  text: string | null;
  blocks: AssistantBlock[];
  feedback: "up" | "down" | null;
  error: string | null;
  createdAt: number;
}

export interface MemoryItem {
  id: string;
  kind: string;
  fact: string;
  source: string;
}

export type BriefKind = "query" | "cart" | "product";

function productIdsIn(blocks: AssistantBlock[]): string[] {
  const ids = new Set<string>();
  for (const block of blocks) {
    if (block.type === "product_group") block.items.forEach((item) => ids.add(item.productId));
    if (block.type === "compare_table") block.rows.forEach((row) => ids.add(row.productId));
    if ((block.type === "action_result" || block.type === "cart_proposal") && block.productId) ids.add(block.productId);
  }
  return [...ids];
}

export function useAssistant(input: { kind: BriefKind | "catalog" | "checkout" | "search"; query?: string; productId?: string; active: boolean }) {
  const { sessionToken, cart } = useCart();
  const identity = useAuth(), auth = useConvexAuth(), runtime = getSiteRuntime();
  const identityReady = assistantIdentityReady(identity, auth);
  const active = input.active && identityReady;
  const scope = JSON.stringify([runtime.convexUrl, runtime.instanceKey, identity.userId, identity.sessionId,
    identity.isLoaded, identity.isSignedIn, auth.isLoading, auth.isAuthenticated, sessionToken, active]);
  const lifetime = useRef({ scope, generation: 0, mounted: false });
  if (lifetime.current.scope !== scope) {
    lifetime.current.scope = scope;
    lifetime.current.generation++;
  }
  type RequestOwner = { scope: string; generation: number };
  const sendingRef = useRef<RequestOwner | null>(null);
  const retryRef = useRef<{ key: string; requestId: string } | null>(null);
  useEffect(() => {
    lifetime.current.mounted = true;
    return () => {
      lifetime.current.mounted = false;
      lifetime.current.generation++;
      sendingRef.current = null;
    };
  }, [scope]);
  const anyApi = api as any;
  const thread = useQuery(anyApi.commerce.assistant.queries.getThread, sessionToken && active ? { sessionToken, limit: 30 } : "skip") as
    | { session: { lastQuery: string | null } | null; messages: AssistantMessage[] }
    | undefined;
  const memory = useQuery(anyApi.commerce.assistant.queries.listMemory, sessionToken && active ? { sessionToken } : "skip") as
    | MemoryItem[]
    | undefined;
  const respond = useAction(anyApi.commerce.assistant.actions.respond);
  const briefAction = useAction(anyApi.commerce.assistant.actions.brief);
  const setFeedbackMutation = useMutation(anyApi.commerce.assistant.mutations.setFeedback);
  const forgetMutation = useMutation(anyApi.commerce.assistant.mutations.forgetFact);
  const clearMutation = useMutation(anyApi.commerce.assistant.mutations.clearThread);
  const confirmCartMutation = useMutation(anyApi.commerce.assistant.cartActions.confirm);
  const logEvent = useMutation(anyApi.commerce.assistant.mutations.logEvent);

  const [pending, setPending] = useState<(RequestOwner & { text: string }) | null>(null);
  const sending = active && pending?.scope === scope && pending.generation === lifetime.current.generation;
  const pendingText = sending ? pending.text : null;
  const [briefState, setBrief] = useState<(RequestOwner & { key: string; blocks: AssistantBlock[]; loading: boolean }) | null>(null);

  const cartKey = useMemo(
    () => cart?.items.length ? JSON.stringify([cart.currencyCode, cart.totalAmount,
      cart.items.map(line => [line.productId, line.variantId, line.quantity, line.unitPriceAmount, line.lineTotalAmount]).sort()]) : "",
    [cart],
  );

  // ── Auto brief ─────────────────────────────────────────────────────────
  const briefKind: BriefKind | null =
    input.kind === "search" || input.kind === "query"
      ? input.query
        ? "query"
        : cartKey
          ? "cart"
          : null
      : input.kind === "product"
        ? "product"
        : input.kind === "cart" || input.kind === "catalog"
          ? cartKey
            ? "cart"
            : null
          : null;
  const briefKey = briefKind ? JSON.stringify([briefKind, input.query, input.productId, cartKey]) : "";
  // Mask obsolete state during render, before effect cleanup can run. Generation
  // also distinguishes leaving an identity/environment and returning to it.
  const brief = active && briefState?.scope === scope && briefState.generation === lifetime.current.generation && briefState.key === briefKey
    ? briefState : { key: "", blocks: [] as AssistantBlock[], loading: false };

  useEffect(() => {
    if (!active || !sessionToken || !briefKind) return;
    if (brief.key === briefKey && !brief.loading) return;
    const owner = { scope, generation: lifetime.current.generation };
    let cancelled = false;
    const isCurrent = () => !cancelled && lifetime.current.mounted && lifetime.current.scope === scope && lifetime.current.generation === owner.generation;
    const timer = window.setTimeout(() => {
      if (!isCurrent()) return;
      setBrief({ ...owner, key: briefKey, blocks: [], loading: true });
      briefAction({ sessionToken, kind: briefKind, query: input.query, productId: input.productId })
        .then((result: { blocks: AssistantBlock[] }) => {
          if (isCurrent()) setBrief({ ...owner, key: briefKey, blocks: result.blocks ?? [], loading: false });
        })
        .catch(() => {
          if (isCurrent()) setBrief({ ...owner, key: briefKey, blocks: [], loading: false });
        });
    }, 450);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [briefKey, active, sessionToken, scope]);

  // ── Send ───────────────────────────────────────────────────────────────
  const send = useCallback(
    async (message: string) => {
      const text = message.trim();
      if (!text || !sessionToken || !active || !lifetime.current.mounted || lifetime.current.scope !== scope || sendingRef.current) return false;
      const owner = { scope, generation: lifetime.current.generation };
      const isCurrent = () => lifetime.current.mounted && lifetime.current.scope === scope && lifetime.current.generation === owner.generation && sendingRef.current === owner;
      sendingRef.current = owner;
      setPending({ ...owner, text });
      // An uncertain network result retains its identity for an explicit retry.
      // A successful answer or a different shopper/question starts a new turn.
      const key = JSON.stringify([scope, text, input.kind, input.query ?? null]);
      const request = retryRef.current?.key === key ? retryRef.current : { key, requestId: crypto.randomUUID() };
      retryRef.current = request;
      try {
        await respond({ sessionToken, requestId: request.requestId, message: text, route: input.kind, query: input.query });
        if (isCurrent() && retryRef.current === request) retryRef.current = null;
        return isCurrent();
      } catch (error) {
        const detail = (error as { data?: { message?: string } })?.data?.message ?? (error as Error)?.message;
        if (isCurrent()) toast.error(detail && detail.length < 160 ? detail : "The assistant could not answer just now.");
        return false;
      } finally {
        if (isCurrent()) {
          sendingRef.current = null;
          setPending(null);
        }
      }
    },
    [input.kind, input.query, active, respond, sessionToken, scope],
  );

  const feedback = useCallback(
    (messageId: string, value: "up" | "down" | null) => {
      if (!sessionToken) return;
      void setFeedbackMutation({ sessionToken, messageId, feedback: value });
    },
    [sessionToken, setFeedbackMutation],
  );

  const forget = useCallback(
    (memoryId: string) => {
      if (!sessionToken) return;
      void forgetMutation({ sessionToken, memoryId });
    },
    [forgetMutation, sessionToken],
  );

  const clear = useCallback(() => {
    if (!sessionToken) return;
    void clearMutation({ sessionToken });
  }, [clearMutation, sessionToken]);

  const confirmCart = useCallback(async (messageId: string, proposalId: string) => {
    if (!sessionToken || !active || !lifetime.current.mounted || lifetime.current.scope !== scope) return false;
    const generation = lifetime.current.generation;
    try {
      await confirmCartMutation({ sessionToken, messageId, proposalId });
      return lifetime.current.mounted && lifetime.current.scope === scope && lifetime.current.generation === generation;
    } catch (error) {
      if (lifetime.current.mounted && lifetime.current.scope === scope && lifetime.current.generation === generation) {
        toast.error((error as { data?: { message?: string } })?.data?.message ?? "Could not confirm this addition. Retry the same button to check its result.");
      }
      return false;
    }
  }, [sessionToken, active, scope, confirmCartMutation]);

  const track = useCallback(
    (surface: "rail" | "drawer" | "cart_page" | "product_page" | "search", event: "impression" | "click" | "add", productIds: string[], groupKey?: string) => {
      if (!sessionToken || !productIds.length) return;
      void logEvent({ sessionToken, surface, event, productIds, groupKey }).catch(() => undefined);
    },
    [logEvent, sessionToken],
  );

  // ── Product cards referenced anywhere ──────────────────────────────────
  const messages = thread?.messages ?? [];
  const referencedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const message of messages) productIdsIn(message.blocks ?? []).forEach((id) => ids.add(id));
    productIdsIn(brief.blocks).forEach((id) => ids.add(id));
    return [...ids].slice(0, 48);
  }, [messages, brief.blocks]);
  const cards = useQuery(anyApi.commerce.storefront.productCards, referencedIds.length ? { productIds: referencedIds } : "skip") as
    | ProductCardData[]
    | undefined;
  const cardById = useMemo(() => new Map((cards ?? []).map((card) => [card.productId, card])), [cards]);

  return {
    sessionToken,
    ready: identityReady && thread !== undefined,
    messages,
    memory: memory ?? [],
    pendingText,
    sending,
    brief,
    cardById,
    send,
    feedback,
    forget,
    clear,
    confirmCart,
    track,
  };
}
