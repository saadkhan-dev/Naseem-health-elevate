import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getPatientConsultationHistory,
  getConsultationUnreadTotal,
  getStaffConsultationHistory,
  getConsultationDetail,
  ensureConsultationConversation,
  setConsultationStatus,
  saveConsultationSummary,
  editConsultationMessage,
  deleteConsultationMessage,
  togglePinConsultationMessage,
  getConsultationTimeline,
  fetchConversationMessages,
  sendConsultationMessage,
  uploadConsultationAttachment,
  markConversationRead,
  markStaffConversationRead,
  fetchConversationAttachments,
  type SaveSummaryInput,
  type StaffHistoryFilters,
} from "@/lib/consultation-data";
import type {
  AttachmentKind,
  AuthSurface,
  ConsultationMessageRow,
  ConsultationRole,
  ConversationStatus,
  SenderRole,
} from "@/lib/consultation-types";

const PAGE_LIMIT = 60;

export const consultationKeys = {
  history: (kind: "patient" | "staff") => ["consultation", "history", kind] as const,
  staffHistory: (filters: StaffHistoryFilters) =>
    ["consultation", "history", "staff", filters] as const,
  unread: () => ["consultation", "unread"] as const,
  messages: (conversationId: string) => ["consultation", "messages", conversationId] as const,
  detail: (conversationId: string) => ["consultation", "detail", conversationId] as const,
  timeline: (conversationId: string) => ["consultation", "timeline", conversationId] as const,
};

// --- Lists + unread ---------------------------------------------------------

export function usePatientConsultationHistory() {
  return useQuery({
    queryKey: consultationKeys.history("patient"),
    queryFn: getPatientConsultationHistory,
    refetchOnWindowFocus: true,
  });
}

export function usePatientConsultationUnread() {
  return useQuery({
    queryKey: consultationKeys.unread(),
    queryFn: getConsultationUnreadTotal,
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
  });
}

export function useStaffConsultationHistory(filters: StaffHistoryFilters = {}) {
  return useQuery({
    queryKey: consultationKeys.staffHistory(filters),
    queryFn: () => getStaffConsultationHistory(filters),
  });
}

/**
 * Keep the dashboard chat lists and unread badges live without manual refresh.
 * Subscribes to message and participant events and invalidates the history +
 * unread queries on every change. Realtime delivers only rows the caller's RLS
 * allows, so a patient only sees their own conversations' events and staff see
 * the conversations they can access.
 */
export function useConsultationRealtime(client: SupabaseClient) {
  const qc = useQueryClient();
  useEffect(() => {
    const channel = client
      .channel("consultation-dashboard-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "consultation_messages" },
        refreshAll,
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "consultation_messages" },
        refreshAll,
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "consultation_messages" },
        refreshAll,
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "consultation_participants" },
        refreshAll,
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "consultation_participants" },
        refreshAll,
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "consultation_conversations",
        },
        refreshAll,
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };

    function refreshAll() {
      qc.invalidateQueries({ queryKey: ["consultation", "history"] });
      qc.invalidateQueries({ queryKey: consultationKeys.unread() });
    }
  }, [client, qc]);
}

// --- Conversation lifecycle -------------------------------------------------

export function useConsultationDetail(
  conversationId: string,
  enabled = true,
  surface: AuthSurface,
) {
  return useQuery({
    queryKey: consultationKeys.detail(conversationId),
    queryFn: () => getConsultationDetail(conversationId, surface),
    enabled: enabled && !!conversationId,
  });
}

export function useConsultationEnsure(
  appointmentId: string | null,
  enabled = true,
  surface: AuthSurface,
) {
  return useQuery({
    queryKey: ["consultation", "ensure", appointmentId ?? "__none__"],
    queryFn: () => ensureConsultationConversation(appointmentId!, surface),
    enabled: enabled && !!appointmentId,
    retry: false,
  });
}

export function useConsultationTimeline(
  conversationId: string,
  enabled = true,
  surface: AuthSurface,
) {
  return useQuery({
    queryKey: consultationKeys.timeline(conversationId),
    queryFn: () => getConsultationTimeline(conversationId, surface),
    enabled: enabled && !!conversationId,
  });
}

export function useConsultationAttachments(
  client: SupabaseClient,
  conversationId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: ["consultation", "attachments", conversationId] as const,
    queryFn: () => fetchConversationAttachments(client, conversationId),
    enabled: enabled && !!conversationId,
  });
}

// --- Messages + realtime ----------------------------------------------------

export function useConsultationMessages(
  client: SupabaseClient,
  conversationId: string,
  enabled = true,
  realtime = true,
) {
  const qc = useQueryClient();
  const keys = consultationKeys.messages(conversationId);
  const [hasMoreTick, bumpHasMore] = useReducer((x: number) => x + 1, 0);
  const hasMoreRef = useRef(false);
  const conversationRef = useRef(conversationId);
  conversationRef.current = conversationId;

  const messages = useQuery<ConsultationMessageRow[]>({
    queryKey: keys,
    queryFn: () => fetchConversationMessages(client, conversationId, { limit: PAGE_LIMIT }),
    enabled: enabled && !!conversationId,
    placeholderData: (prev) => prev,
  });

  useEffect(() => {
    hasMoreRef.current = (messages.data?.length ?? 0) === PAGE_LIMIT;
    bumpHasMore();
  }, [messages.data?.length]);

  // Reset cache when switching conversations so no cross-conversation bleed.
  useEffect(() => {
    if (enabled && conversationId) {
      qc.setQueryData<ConsultationMessageRow[]>(keys, (old) => (old?.length ? old : undefined));
    }
  }, [conversationId, enabled, qc, keys]);

  // Realtime: RLS filters what this client is allowed to receive, so even a
  // guessed conversation id yields nothing (and no events are delivered). The
  // `realtime` flag lets a consumer keep the shared message cache warm WITHOUT
  // subscribing — used by the floating video-page chat so there is never a
  // duplicate postgres_changes listener while the panel chat is open.
  useEffect(() => {
    if (!enabled || !conversationId || !realtime) return;

    const channel = client
      .channel(`consultation-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "consultation_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as Partial<ConsultationMessageRow>;
          qc.setQueryData<ConsultationMessageRow[]>(keys, (old) => {
            if (!old) return old;
            if (row.id && old.some((m) => m.id === row.id)) return old;
            const next = [...old, row as ConsultationMessageRow];
            next.sort((a, b) => a.created_at.localeCompare(b.created_at));
            return next;
          });
          // Realtime payloads carry NO nested `consultation_attachments`, so a
          // freshly-arriving file bubble has no attachment row to download from.
          // Refetch right away so the join fills in (the download also resolves
          // server-side by message id, so nothing blocks waiting for this).
          if (row.message_type === "file") {
            qc.invalidateQueries({ queryKey: keys });
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "consultation_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as Partial<ConsultationMessageRow>;
          qc.setQueryData<ConsultationMessageRow[]>(keys, (old) => {
            if (!old) return old;
            const copy = [...old];
            const idx = copy.findIndex((m) => m.id === row.id);
            if (idx >= 0) {
              copy[idx] = { ...copy[idx], ...(row as ConsultationMessageRow) };
            } else if (row.id) {
              copy.push(row as ConsultationMessageRow);
              copy.sort((a, b) => a.created_at.localeCompare(b.created_at));
            }
            return copy;
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "consultation_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const old = payload.old as Partial<ConsultationMessageRow>;
          qc.setQueryData<ConsultationMessageRow[]>(keys, (current) => {
            if (!current) return current;
            return current.filter((m) => m.id !== old.id);
          });
        },
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [client, conversationId, enabled, qc, keys, realtime]);

  const loadOlder = useCallback(async () => {
    const current = qc.getQueryData<ConsultationMessageRow[]>(keys);
    const oldest = current?.[0]?.created_at;
    if (!oldest) return;
    const page = await fetchConversationMessages(client, conversationId, {
      before: oldest,
      limit: PAGE_LIMIT,
    });
    qc.setQueryData<ConsultationMessageRow[]>(keys, (old) => {
      const base = old ?? [];
      const merged = [...page, ...base];
      const seen = new Set<string>();
      return merged.filter((m) => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      });
    });
  }, [client, conversationId, qc, keys]);

  return {
    messages,
    total: messages.data?.length ?? 0,
    hasMore: hasMoreRef.current && hasMoreTick >= 0,
    loadOlder,
  };
}

// --- Sending ----------------------------------------------------------------

export function useSendConsultationMessage(conversationId: string, surface: AuthSurface) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => sendConsultationMessage({ conversationId, body }, surface),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["consultation", "history"] });
      qc.invalidateQueries({ queryKey: consultationKeys.unread() });
      qc.invalidateQueries({ queryKey: ["consultation", "messages"] });
    },
  });
}

export function useUploadConsultationAttachment(
  client: SupabaseClient,
  input: { conversationId: string; userId: string },
  surface: AuthSurface,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file, attachmentType }: { file: File; attachmentType: AttachmentKind }) =>
      uploadConsultationAttachment(
        client,
        {
          conversationId: input.conversationId,
          userId: input.userId,
          file,
          attachmentType,
        },
        surface,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["consultation", "history"] });
      qc.invalidateQueries({ queryKey: consultationKeys.unread() });
      qc.invalidateQueries({ queryKey: ["consultation", "messages"] });
    },
  });
}

export function useMarkConversationRead(
  client: SupabaseClient,
  conversationId: string,
  viewer: { id: string; role: ConsultationRole },
) {
  const qc = useQueryClient();
  // Patients mark read through the direct RLS path (their row always exists);
  // staff go through the server function, which upserts a participant row when
  // the viewer (e.g. an admin) isn't already one.
  const isStaff = viewer.role !== "patient";
  return useMutation({
    mutationFn: () =>
      isStaff
        ? markStaffConversationRead(conversationId)
        : markConversationRead(client, conversationId, viewer.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["consultation", "history"] });
      qc.invalidateQueries({ queryKey: consultationKeys.unread() });
    },
  });
}

// --- Message actions --------------------------------------------------------

export function useEditConsultationMessage(conversationId: string, surface: AuthSurface) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ messageId, body }: { messageId: string; body: string }) =>
      editConsultationMessage(messageId, body, surface),
    onSuccess: () => qc.invalidateQueries({ queryKey: consultationKeys.messages(conversationId) }),
  });
}

export function useDeleteConsultationMessage(conversationId: string, surface: AuthSurface) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (messageId: string) => deleteConsultationMessage(messageId, surface),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: consultationKeys.messages(conversationId) });
      qc.invalidateQueries({ queryKey: ["consultation", "history"] });
    },
  });
}

export function useToggleConsultationPin(conversationId: string, surface: AuthSurface) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ messageId, pinned }: { messageId: string; pinned: boolean }) =>
      togglePinConsultationMessage(messageId, pinned, surface),
    onSuccess: () => qc.invalidateQueries({ queryKey: consultationKeys.messages(conversationId) }),
  });
}

// --- Staff lifecycle --------------------------------------------------------

export function useSetConsultationStatus(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: ConversationStatus) => setConsultationStatus(conversationId, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: consultationKeys.detail(conversationId) });
      qc.invalidateQueries({ queryKey: ["consultation", "history"] });
      qc.invalidateQueries({ queryKey: consultationKeys.timeline(conversationId) });
    },
  });
}

export function useSaveConsultationSummary(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: SaveSummaryInput) => saveConsultationSummary(conversationId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: consultationKeys.detail(conversationId) });
      qc.invalidateQueries({ queryKey: consultationKeys.timeline(conversationId) });
    },
  });
}

export type { ConsultationRole, ConversationStatus, SenderRole };
