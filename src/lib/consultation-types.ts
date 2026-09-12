/**
 * Shared types for the Consultation Communication & Persistent Chat system.
 *
 * These types are used by the server functions (`src/lib/server/consultation.ts`,
 * `src/lib/consultation.functions.ts`), the client data layer
 * (`src/lib/consultation-data.ts`) and the chat UI components. Keep this file
 * free of runtime imports so it can be imported from both server and client.
 */

export type ConsultationRole = "patient" | "doctor" | "admin";
export type ConversationStatus = "active" | "read_only";
export type SenderRole = "patient" | "doctor";
export type MessageType = "text" | "file" | "system";
export type AttachmentKind =
  "medical_report" | "lab_result" | "prescription" | "image" | "xray" | "document";
export type SummaryStatus = "draft" | "final";

export const CONVERSATION_STATUSES = ["active", "read_only"] as const;

/**
 * WhatsApp-style window: a patient may edit/delete their own message only
 * within this time after sending (staff are never limited). Matches
 * `PATIENT_MESSAGE_MODIFY_WINDOW_MS` in `src/lib/server/consultation.ts`.
 */
export const PATIENT_MESSAGE_MODIFY_WINDOW_MS = 30 * 60 * 1000;
export const ATTACHMENT_KINDS = [
  "medical_report",
  "lab_result",
  "prescription",
  "image",
  "xray",
  "document",
] as const;

// --- Raw table rows (as returned by the Supabase client) --------------------

export interface ConsultationMessageRow {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  sender_role: SenderRole | null;
  body: string;
  message_type: MessageType;
  reply_to_id: string | null;
  is_pinned: boolean;
  pinned_at: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
  attachments?: ConsultationAttachmentRow[] | null;
  reply_to?: {
    id: string;
    body: string | null;
    sender_role: SenderRole | null;
    deleted_at: string | null;
    created_at: string | null;
  } | null;
}

export interface ConsultationAttachmentRow {
  id: string;
  conversation_id: string;
  message_id: string | null;
  uploaded_by: string | null;
  storage_path: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  attachment_type: AttachmentKind;
  created_at: string;
  deleted_at: string | null;
}

export interface ConsultationParticipantRow {
  id: string;
  conversation_id: string;
  user_id: string;
  role: string;
  last_read_at: string | null;
  joined_at: string;
}

export interface ConsultationSummaryRow {
  id: string;
  conversation_id: string;
  appointment_id: string | null;
  doctor_id: string | null;
  chief_concern: string;
  symptoms: string;
  diagnosis: string;
  doctor_notes: string;
  advice: string;
  prescription: string;
  follow_up_date: string | null;
  additional_notes: string;
  status: SummaryStatus;
  updated_at: string;
}

export interface ConsultationEventRow {
  id: string;
  conversation_id: string;
  actor_id: string | null;
  actor_role: string | null;
  event_type: string;
  message_id: string | null;
  metadata: Record<string, string | number | boolean | null>;
  created_at: string;
}

// --- Composed views (returned by the server functions) ----------------------

export interface ConversationSummaryView {
  conversationId: string;
  appointmentId: string;
  appointmentNo: string | null;
  status: ConversationStatus;
  startedAt: string | null;
  endedAt: string | null;
  lastMessageAt: string | null;
  appointmentDate: string;
  appointmentTime: string | null;
  serviceName: string | null;
  isVideo: boolean;
  vcNo: string | null;
  videoStatus: string | null;
  patientName: string | null;
  patientPhone: string | null;
  patientEmail: string | null;
  unreadCount: number;
  lastBody: string | null;
  lastSenderRole: SenderRole | null;
  hasAttachments: boolean;
  /** Staff history only. */
  messageCount?: number;
  /** Patient gender (filled by the server after RPC/direct fetch). */
  patientGender?: string | null;
}

export interface ConsultationAppointmentView {
  appointmentId: string;
  appointmentNo: string | null;
  date: string;
  time: string | null;
  serviceName: string | null;
  isVideo: boolean;
  status: string;
  notes: string | null;
  patientName: string | null;
  patientPhone: string | null;
  patientEmail: string | null;
  patientGender?: string | null;
  vcNo: string | null;
  videoStatus: string | null;
}

export interface ConsultationParticipantView {
  userId: string;
  role: ConsultationRole;
  fullName: string | null;
  gender?: string | null;
  lastReadAt: string | null;
}

export interface ConsultationDetailView {
  conversationId: string;
  status: ConversationStatus;
  startedAt: string | null;
  endedAt: string | null;
  lastMessageAt: string | null;
  appointment: ConsultationAppointmentView | null;
  participants: ConsultationParticipantView[];
  myUserId: string;
  myRole: ConsultationRole;
  /** Role used when the current user sends a message. */
  mySenderRole: SenderRole | null;
  canSend: boolean;
  summary: ConsultationSummaryRow | null;
}

export interface ConsultationSaveSummaryInput {
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

export interface ConversationEnsureView {
  conversationId: string;
  status: ConversationStatus;
  appointment: ConsultationAppointmentView | null;
}

// --- Event labels used by the audit trail -----------------------------------

export const CONSULTATION_EVENTS = {
  CONVERSATION_CREATED: "conversation_created",
  CONSULTATION_STARTED: "consultation_started",
  STATUS_CHANGED: "status_changed",
  SUMMARY_SAVED: "summary_saved",
  MESSAGE_EDITED: "message_edited",
  MESSAGE_DELETED: "message_deleted",
  MESSAGE_PINNED: "message_pinned",
  MESSAGE_UNPINNED: "message_unpinned",
  ATTACHMENT_UPLOADED: "attachment_uploaded",
} as const;

export type ConsultationEventType = (typeof CONSULTATION_EVENTS)[keyof typeof CONSULTATION_EVENTS];
