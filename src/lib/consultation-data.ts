import type { SupabaseClient } from "@supabase/supabase-js";
import {
  consultationGetPatientHistory,
  consultationGetUnreadTotal,
  consultationGetStaffHistory,
  consultationMarkConversationRead,
  consultationEnsureConversation,
  consultationGetDetail,
  consultationSetStatus,
  consultationSaveSummary,
  consultationEditMessage,
  consultationDeleteMessage,
  consultationTogglePin,
  consultationGetAttachmentUrl,
  consultationGetTimeline,
  consultationSendMessage,
  consultationUploadAttachment,
} from "@/lib/consultation.functions";
import type {
  AttachmentKind,
  AuthSurface,
  ConsultationAttachmentRow,
  ConsultationDetailView,
  ConsultationEventRow,
  ConsultationMessageRow,
  ConversationEnsureView,
  ConversationStatus,
  ConversationSummaryView,
  SenderRole,
  SummaryStatus,
} from "@/lib/consultation-types";

export type {
  ConversationSummaryView,
  ConversationEnsureView,
  ConsultationDetailView,
  ConsultationMessageRow,
  ConsultationAttachmentRow,
  ConsultationEventRow,
  ConversationStatus,
  ConsultationRole,
} from "@/lib/consultation-types";
export type { AttachmentKind, SenderRole, SummaryStatus } from "@/lib/consultation-types";

// --- Server-function wrappers -----------------------------------------------

export async function getPatientConsultationHistory(): Promise<ConversationSummaryView[]> {
  return consultationGetPatientHistory({ data: undefined });
}

export async function getConsultationUnreadTotal(): Promise<number> {
  return consultationGetUnreadTotal({ data: undefined });
}

export interface StaffHistoryFilters {
  q?: string;
  status?: ConversationStatus;
  from?: string;
  to?: string;
  hasAttachments?: boolean;
}

export async function getStaffConsultationHistory(
  filters: StaffHistoryFilters = {},
): Promise<ConversationSummaryView[]> {
  return consultationGetStaffHistory({ data: { ...filters, surface: "staff" } });
}

export async function ensureConsultationConversation(
  appointmentId: string,
  surface: AuthSurface,
): Promise<ConversationEnsureView> {
  return consultationEnsureConversation({ data: { appointmentId, surface } });
}

export async function getConsultationDetail(
  conversationId: string,
  surface: AuthSurface,
): Promise<ConsultationDetailView> {
  return consultationGetDetail({ data: { conversationId, surface } });
}

export async function setConsultationStatus(
  conversationId: string,
  status: ConversationStatus,
): Promise<ConversationStatus> {
  return consultationSetStatus({ data: { conversationId, status, surface: "staff" } });
}

export interface SaveSummaryInput {
  chief_concern?: string;
  symptoms?: string;
  diagnosis?: string;
  doctor_notes?: string;
  advice?: string;
  prescription?: string;
  follow_up_date?: string | null;
  additional_notes?: string;
  status: SummaryStatus;
}

export async function saveConsultationSummary(
  conversationId: string,
  data: SaveSummaryInput,
): Promise<ConsultationDetailView["summary"]> {
  return consultationSaveSummary({ data: { conversationId, data, surface: "staff" } });
}

export async function editConsultationMessage(
  messageId: string,
  body: string,
  surface: AuthSurface,
) {
  return consultationEditMessage({ data: { messageId, body, surface } });
}

export async function deleteConsultationMessage(messageId: string, surface: AuthSurface) {
  return consultationDeleteMessage({ data: { messageId, surface } });
}

export async function togglePinConsultationMessage(
  messageId: string,
  pinned: boolean,
  surface: AuthSurface,
) {
  return consultationTogglePin({ data: { messageId, pinned, surface } });
}

export async function getConsultationTimeline(
  conversationId: string,
  surface: AuthSurface,
): Promise<ConsultationEventRow[]> {
  return consultationGetTimeline({ data: { conversationId, surface } });
}

/**
 * Create a short-lived force-download link via the server (service-role). The
 * recipient may not own the uploaded file, so this must NOT depend on the
 * caller's own storage RLS — the server resolves the attachment row by message
 * id and re-checks participation instead. Resolving server-side also works for
 * messages the client only knows about from a Realtime payload (which carry no
 * nested `consultation_attachments`).
 */
export async function getConsultationAttachmentUrl(
  conversationId: string,
  messageId: string,
  surface: AuthSurface,
): Promise<{ url: string; fileName: string }> {
  return consultationGetAttachmentUrl({
    data: { conversationId, messageId, surface },
  });
}

// --- Direct client calls (protected by RLS) ---------------------------------

const MESSAGE_SELECT = `
  id, conversation_id, sender_id, sender_role, body, message_type, reply_to_id,
  is_pinned, pinned_at, edited_at, deleted_at, created_at,
  consultation_attachments(*),
  reply_to:reply_to_id (id, body, sender_role, deleted_at, created_at)
`;

/**
 * Load the most recent `limit` messages (ascending), or the `limit` older
 * messages before `before` (returned ascending). Passing `before` = last
 * loaded message's `created_at` implements pagination ("load older").
 */
export async function fetchConversationMessages(
  client: SupabaseClient,
  conversationId: string,
  opts: { before?: string | null; limit?: number } = {},
): Promise<ConsultationMessageRow[]> {
  const limit = opts.limit ?? 60;
  let query = client
    .from("consultation_messages")
    .select(MESSAGE_SELECT)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (opts.before) {
    query = query.lt("created_at", opts.before);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as ConsultationMessageRow[]).reverse();
}

/**
 * Send a text message. The insert happens on the server with the service-role
 * client, so it is never blocked by RLS grants/policy edge-cases; the server
 * still verifies the caller is a participant and the conversation is active.
 * `sender_id` is always the JWT user id from the middleware context.
 */
export async function sendConsultationMessage(
  input: {
    conversationId: string;
    body: string;
    replyToId?: string | null;
  },
  surface: AuthSurface,
): Promise<ConsultationMessageRow> {
  return consultationSendMessage({
    data: {
      conversationId: input.conversationId,
      body: input.body,
      replyToId: input.replyToId ?? null,
      surface,
    },
  });
}

/**
 * Client-side hard cap so an oversized file fails fast with a clear message
 * instead of reading/serialising megabytes first. Must stay in sync with
 * `ATTACHMENT_MAX_BYTES` in `src/lib/server/consultation.ts` (20 MB).
 */
export const ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;

/** Read a File as raw base64 (matches the receipt-upload helper pattern). */
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(new Error("Could not read the selected file. Please try again."));
    reader.readAsDataURL(file);
  });
}

/**
 * Upload a private chat attachment through a server function instead of the
 * direct browser→Supabase Storage PUT. The old direct call died with
 * "TypeError: Failed to fetch" on some devices/networks (cross-origin request
 * to the storage host); the bytes now travel with the authenticated
 * server-function request and the server stores them with the service-role
 * client, then creates the "file" message + attachment record
 * (participant-checked). Downloads still go through signed URLs.
 */
export async function uploadConsultationAttachment(
  client: SupabaseClient,
  input: {
    conversationId: string;
    userId: string;
    file: File;
    attachmentType: AttachmentKind;
  },
  surface: AuthSurface,
): Promise<ConsultationMessageRow> {
  const { conversationId, file, attachmentType } = input;
  if (file.size > ATTACHMENT_MAX_BYTES) {
    throw new Error("Files must be 20 MB or smaller.");
  }

  const fileBase64 = await readFileAsBase64(file);
  if (!fileBase64) {
    throw new Error("The selected file is empty or could not be read. Please try again.");
  }

  try {
    return await consultationUploadAttachment({
      data: {
        conversationId,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        fileBase64,
        attachmentType,
        surface,
      },
    });
  } catch (e) {
    // A network-level failure ("Failed to fetch", offline, timeout) used to
    // bubble up raw; surface it in plain language instead.
    if (e instanceof TypeError) {
      throw new Error("Network error while uploading. Please check your connection and try again.");
    }
    throw e;
  }
}

/** Update the caller's own participant row (mark everything read up to now). */
export async function markConversationRead(
  client: SupabaseClient,
  conversationId: string,
  userId: string,
): Promise<void> {
  await client
    .from("consultation_participants")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .eq("user_id", userId);
}

/**
 * Staff-side mark-read. Staff (especially admins) often have no participant
 * row for a conversation, so the direct RLS update would affect 0 rows; the
 * server function upserts the viewer's own row with the service-role client.
 */
export async function markStaffConversationRead(conversationId: string): Promise<void> {
  await consultationMarkConversationRead({ data: { conversationId, surface: "staff" } });
}

/** Generate a short-lived signed URL for a private attachment. */
export async function createAttachmentUrl(
  client: SupabaseClient,
  storagePath: string,
  expiresInSeconds = 300,
): Promise<string> {
  const { data, error } = await client.storage
    .from("consultation-attachments")
    .createSignedUrl(storagePath, expiresInSeconds);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? "Could not create link");
  return data.signedUrl;
}

/** List all attachments in a conversation (RLS scoped to participants/staff). */
export async function fetchConversationAttachments(
  client: SupabaseClient,
  conversationId: string,
): Promise<ConsultationAttachmentRow[]> {
  const { data, error } = await client
    .from("consultation_attachments")
    .select("*")
    .eq("conversation_id", conversationId)
    .eq("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ConsultationAttachmentRow[];
}
