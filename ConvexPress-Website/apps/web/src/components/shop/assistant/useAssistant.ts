/**
 * Assistant state for one storefront session: the persisted thread, shopper
 * memory, the auto brief for the current page, and the send / brief actions.
 * Product cards referenced by any block are loaded once and shared.
 */

import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { useCart } from "@/hooks/useCart";
import type { ProductCardData } from "@/components/shop/ProductMiniCard";

export type AssistantBlock =
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
    if (block.type === "action_result" && block.productId) ids.add(block.productId);
  }
  return [...ids];
}

export function useAssistant(input: { kind: BriefKind | "catalog" | "checkout" | "search"; query?: string; productId?: string; active: boolean }) {
  const { sessionToken, cart } = useCart();
  const anyApi = api as any;
  const thread = useQuery(anyApi.commerce.assistant.queries.getThread, sessionToken && input.active ? { sessionToken, limit: 30 } : "skip") as
    | { session: { lastQuery: string | null } | null; messages: AssistantMessage[] }
    | undefined;
  const memory = useQuery(anyApi.commerce.assistant.queries.listMemory, sessionToken && input.active ? { sessionToken } : "skip") as
    | MemoryItem[]
    | undefined;
  const respond = useAction(anyApi.commerce.assistant.actions.respond);
  const briefAction = useAction(anyApi.commerce.assistant.actions.brief);
  const setFeedbackMutation = useMutation(anyApi.commerce.assistant.mutations.setFeedback);
  const forgetMutation = useMutation(anyApi.commerce.assistant.mutations.forgetFact);
  const clearMutation = useMutation(anyApi.commerce.assistant.mutations.clearThread);
  const logEvent = useMutation(anyApi.commerce.assistant.mutations.logEvent);

  const [pendingText, setPendingText] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [brief, setBrief] = useState<{ key: string; blocks: AssistantBlock[]; loading: boolean }>({ key: "", blocks: [], loading: false });
  const briefTimer = useRef<number | null>(null);

  const cartKey = useMemo(
    () => (cart?.items ?? []).map((line) => `${line.productId}:${line.quantity}`).sort().join(","),
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
  const briefKey = briefKind ? `${briefKind}|${input.query ?? ""}|${input.productId ?? ""}|${cartKey}` : "";

  useEffect(() => {
    if (!input.active || !sessionToken || !briefKind) {
      setBrief((current) => (current.key === "" && !current.blocks.length ? current : { key: "", blocks: [], loading: false }));
      return;
    }
    if (brief.key === briefKey && !brief.loading) return;
    if (briefTimer.current) window.clearTimeout(briefTimer.current);
    briefTimer.current = window.setTimeout(() => {
      setBrief((current) => ({ key: briefKey, blocks: current.key === briefKey ? current.blocks : [], loading: true }));
      briefAction({ sessionToken, kind: briefKind, query: input.query, productId: input.productId })
        .then((result: { blocks: AssistantBlock[] }) => {
          setBrief({ key: briefKey, blocks: result.blocks ?? [], loading: false });
        })
        .catch(() => {
          setBrief({ key: briefKey, blocks: [], loading: false });
        });
    }, 450);
    return () => {
      if (briefTimer.current) window.clearTimeout(briefTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [briefKey, input.active, sessionToken]);

  // ── Send ───────────────────────────────────────────────────────────────
  const send = useCallback(
    async (message: string) => {
      const text = message.trim();
      if (!text || !sessionToken || sending) return;
      setPendingText(text);
      setSending(true);
      try {
        await respond({ sessionToken, message: text, route: input.kind, query: input.query });
      } catch (error) {
        const detail = (error as { data?: { message?: string } })?.data?.message ?? (error as Error)?.message;
        toast.error(detail && detail.length < 160 ? detail : "The assistant could not answer just now.");
      } finally {
        setSending(false);
        setPendingText(null);
      }
    },
    [input.kind, input.query, respond, sending, sessionToken],
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
    ready: thread !== undefined,
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
    track,
  };
}
