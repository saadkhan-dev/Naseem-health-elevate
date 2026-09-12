import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase, staffSupabase } from "@/lib/supabase";
import { getSupabaseAdmin } from "./server/supabase-admin";
import {
  ensureConversation,
  getAttachmentSignedUrl,
  getConversationDetail,
  getPatientHistory,
  getStaffHistory,
  getTimeline,
  getUnreadTotalForUser,
  saveSummary,
  setConversationStatus,
  editMessage,
  softDeleteMessage,
  togglePinMessage,
  sendMessage,
  createFileMessage,
  type ConsultationHistoryFilters,
} from "./server/consultation";
import type {
  ConsultationDetailView,
  ConsultationRole,
  ConsultationSaveSummaryInput,
  ConversationStatus,
  ConversationSummaryView,
  ConversationEnsureView,
} from "./consultation-types";
import { ATTACHMENT_KINDS } from "./consultation-types";

/**
 * TanStack Start server functions for the Consultation Communication system.
 *
 * All writes AND reads that need cross-table aggregation go through these
 * functions for code-level authorization (single place). The chat messages
 * themselves are read/written by the client directly through the anon key —
 * that path is protected by the RLS policies in `supabase/consultation-chat.sql`
 * (defence-in-depth). Everything here is additionally gated by
 * `consultationAuthMiddleware`, which validates the public OR staff token and
 * the profile role on the server.
 */

const uuidSchema = z.string().uuid("Invalid id");

/**
 * Identity-aware auth middleware for consultation server functions.
 *
 * The browser keeps TWO independent sessions — the public/patient client
 * (`supabase`) and the staff client (`staffSupabase`), in separate storage
 * keys — so one request can carry tokens for TWO different users. When both
 * exist, choosing the wrong one made patient-only endpoints run their check
 * against the STAFF identity and throw "Forbidden" for real patients.
 *
 * `roles` declares which identities this endpoint may run as; `prefer` decides
 * which session's token is tried first. A token is ONLY accepted when it
 * resolves to a profile whose role is in `roles`, so one session can never
 * impersonate the other. Patient-only endpoints prefer the public token, so a
 * lingering admin/doctor session can never break the patient side.
 */
interface ConsultAuthContract {
  roles: ConsultationRole[];
  prefer: "public" | "staff";
}

const consultationAuthMiddleware = ({ roles, prefer }: ConsultAuthContract) =>
  createMiddleware({ type: "function" })
    .client(async ({ next }) => {
      const publicToken =
        typeof window !== "undefined"
          ? ((await supabase.auth.getSession()).data.session?.access_token ?? null)
          : null;
      const staffToken =
        typeof window !== "undefined"
          ? ((await staffSupabase.auth.getSession()).data.session?.access_token ?? null)
          : null;
      return next({ sendContext: { publicToken, staffToken } });
    })
    .server(async ({ next, context }) => {
      const ordered =
        prefer === "public"
          ? ([
              { token: context?.publicToken ?? null },
              { token: context?.staffToken ?? null },
            ] as const)
          : ([
              { token: context?.staffToken ?? null },
              { token: context?.publicToken ?? null },
            ] as const);

      const admin = getSupabaseAdmin();
      for (const { token } of ordered) {
        if (!token) continue;
        const { data: userData, error } = await admin.auth.getUser(token);
        if (error || !userData?.user) continue;
        const { data: profile } = await admin
          .from("profiles")
          .select("id, role, full_name")
          .eq("id", userData.user.id)
          .single();
        const role = profile?.role ?? null;
        if (!role || !roles.includes(role as ConsultationRole)) continue;
        return next({
          context: {
            userId: userData.user.id,
            role: role as ConsultationRole,
            fullName: profile?.full_name ?? null,
          },
        });
      }
      throw new Error("Forbidden");
    });

// ---------------------------------------------------------------------------
// History + unread (for the dashboard badges and list pages)
// ---------------------------------------------------------------------------

export const consultationGetPatientHistory = createServerFn({ method: "POST" })
  .middleware([consultationAuthMiddleware({ roles: ["patient"], prefer: "public" })])
  .validator((d: unknown) => d as undefined)
  .handler(async ({ context }): Promise<ConversationSummaryView[]> => {
    if (context.role !== "patient") throw new Error("Forbidden");
    return getPatientHistory(getSupabaseAdmin(), context.userId);
  });

export const consultationGetUnreadTotal = createServerFn({ method: "POST" })
  .middleware([consultationAuthMiddleware({ roles: ["patient"], prefer: "public" })])
  .validator((d: unknown) => d as undefined)
  .handler(async ({ context }): Promise<number> => {
    if (context.role !== "patient") throw new Error("Forbidden");
    return getUnreadTotalForUser(getSupabaseAdmin(), context.userId);
  });

const historyFiltersSchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(["active", "read_only"]).optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  hasAttachments: z.boolean().optional(),
});

export const consultationGetStaffHistory = createServerFn({ method: "POST" })
  .middleware([consultationAuthMiddleware({ roles: ["doctor", "admin"], prefer: "staff" })])
  .validator(historyFiltersSchema)
  .handler(async ({ data, context }): Promise<ConversationSummaryView[]> => {
    if (context.role !== "doctor" && context.role !== "admin") throw new Error("Forbidden");
    const filters: ConsultationHistoryFilters = {
      q: data.q || null,
      status: data.status ?? null,
      from: data.from ?? null,
      to: data.to ?? null,
      hasAttachments: data.hasAttachments ?? null,
    };
    return getStaffHistory(getSupabaseAdmin(), filters);
  });

// ---------------------------------------------------------------------------
// Open / ensure a conversation (appointment → conversation, idempotent)
// ---------------------------------------------------------------------------

export const consultationEnsureConversation = createServerFn({ method: "POST" })
  .middleware([
    consultationAuthMiddleware({ roles: ["patient", "doctor", "admin"], prefer: "staff" }),
  ])
  .validator(
    z.object({
      appointmentId: uuidSchema,
    }),
  )
  .handler(async ({ data, context }): Promise<ConversationEnsureView> => {
    return ensureConversation(getSupabaseAdmin(), {
      appointmentId: data.appointmentId,
      actorUserId: context.userId,
      actorRole: context.role,
    });
  });

// ---------------------------------------------------------------------------
// Conversation detail (chat page header + summary + participants)
// ---------------------------------------------------------------------------

export const consultationGetDetail = createServerFn({ method: "POST" })
  .middleware([
    consultationAuthMiddleware({ roles: ["patient", "doctor", "admin"], prefer: "staff" }),
  ])
  .validator(
    z.object({
      conversationId: uuidSchema,
    }),
  )
  .handler(async ({ data, context }): Promise<ConsultationDetailView> => {
    return getConversationDetail(getSupabaseAdmin(), {
      conversationId: data.conversationId,
      viewerId: context.userId,
      viewerRole: context.role,
    });
  });

// ---------------------------------------------------------------------------
// Staff lifecycle
// ---------------------------------------------------------------------------

export const consultationSetStatus = createServerFn({ method: "POST" })
  .middleware([consultationAuthMiddleware({ roles: ["doctor", "admin"], prefer: "staff" })])
  .validator(
    z.object({
      conversationId: uuidSchema,
      status: z.enum(["active", "read_only"]),
    }),
  )
  .handler(async ({ data, context }): Promise<ConversationStatus> => {
    return setConversationStatus(getSupabaseAdmin(), {
      conversationId: data.conversationId,
      status: data.status as ConversationStatus,
      actorUserId: context.userId,
      actorRole: context.role,
    });
  });

export const consultationSaveSummary = createServerFn({ method: "POST" })
  .middleware([consultationAuthMiddleware({ roles: ["doctor", "admin"], prefer: "staff" })])
  .validator(
    z.object({
      conversationId: uuidSchema,
      data: z.object({
        chief_concern: z.string().max(5000).optional(),
        symptoms: z.string().max(5000).optional(),
        diagnosis: z.string().max(5000).optional(),
        doctor_notes: z.string().max(8000).optional(),
        advice: z.string().max(5000).optional(),
        prescription: z.string().max(8000).optional(),
        follow_up_date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable()
          .optional(),
        additional_notes: z.string().max(8000).optional(),
        status: z.enum(["draft", "final"]),
      }),
    }),
  )
  .handler(async ({ data, context }): Promise<ConsultationDetailView["summary"]> => {
    return saveSummary(getSupabaseAdmin(), {
      conversationId: data.conversationId,
      actorUserId: context.userId,
      actorRole: context.role,
      data: data.data as ConsultationSaveSummaryInput,
    });
  });

// ---------------------------------------------------------------------------
// Message actions (edit / soft delete / pin)
// ---------------------------------------------------------------------------

export const consultationEditMessage = createServerFn({ method: "POST" })
  .middleware([
    consultationAuthMiddleware({ roles: ["patient", "doctor", "admin"], prefer: "staff" }),
  ])
  .validator(
    z.object({
      messageId: uuidSchema,
      body: z.string().trim().min(1).max(4000),
    }),
  )
  .handler(async ({ data, context }) => {
    return editMessage(getSupabaseAdmin(), {
      messageId: data.messageId,
      body: data.body,
      actorUserId: context.userId,
      actorRole: context.role,
    });
  });

export const consultationDeleteMessage = createServerFn({ method: "POST" })
  .middleware([
    consultationAuthMiddleware({ roles: ["patient", "doctor", "admin"], prefer: "staff" }),
  ])
  .validator(
    z.object({
      messageId: uuidSchema,
    }),
  )
  .handler(async ({ data, context }) => {
    return softDeleteMessage(getSupabaseAdmin(), {
      messageId: data.messageId,
      actorUserId: context.userId,
      actorRole: context.role,
    });
  });

export const consultationTogglePin = createServerFn({ method: "POST" })
  .middleware([
    consultationAuthMiddleware({ roles: ["patient", "doctor", "admin"], prefer: "staff" }),
  ])
  .validator(
    z.object({
      messageId: uuidSchema,
      pinned: z.boolean(),
    }),
  )
  .handler(async ({ data, context }) => {
    return togglePinMessage(getSupabaseAdmin(), {
      messageId: data.messageId,
      pinned: data.pinned,
      actorUserId: context.userId,
      actorRole: context.role,
    });
  });

export const consultationGetAttachmentUrl = createServerFn({ method: "POST" })
  .middleware([
    consultationAuthMiddleware({ roles: ["patient", "doctor", "admin"], prefer: "staff" }),
  ])
  .validator(
    z.object({
      conversationId: uuidSchema,
      messageId: uuidSchema,
    }),
  )
  .handler(async ({ data, context }) => {
    return getAttachmentSignedUrl(getSupabaseAdmin(), {
      conversationId: data.conversationId,
      messageId: data.messageId,
      viewerId: context.userId,
      viewerRole: context.role,
    });
  });

export const consultationSendMessage = createServerFn({ method: "POST" })
  .middleware([
    consultationAuthMiddleware({ roles: ["patient", "doctor", "admin"], prefer: "public" }),
  ])
  .validator(
    z.object({
      conversationId: uuidSchema,
      body: z.string().trim().min(1).max(4000),
      replyToId: uuidSchema.nullable().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    return sendMessage(getSupabaseAdmin(), {
      conversationId: data.conversationId,
      senderId: context.userId,
      senderRole: context.role === "patient" ? "patient" : "doctor",
      body: data.body,
      replyToId: data.replyToId ?? null,
    });
  });

const consultationFileMessageSchema = z.object({
  conversationId: uuidSchema,
  storagePath: z.string().trim().min(1).max(500),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().max(200).default("application/octet-stream"),
  size: z.number().int().nonnegative().max(50_000_000),
  attachmentType: z.enum(ATTACHMENT_KINDS),
});

export const consultationCreateFileMessage = createServerFn({ method: "POST" })
  .middleware([
    consultationAuthMiddleware({ roles: ["patient", "doctor", "admin"], prefer: "public" }),
  ])
  .validator(consultationFileMessageSchema)
  .handler(async ({ data, context }) => {
    return createFileMessage(getSupabaseAdmin(), {
      conversationId: data.conversationId,
      userId: context.userId,
      senderRole: context.role === "patient" ? "patient" : "doctor",
      storagePath: data.storagePath,
      fileName: data.fileName,
      mimeType: data.mimeType,
      size: data.size,
      attachmentType: data.attachmentType,
    });
  });

export const consultationGetTimeline = createServerFn({ method: "POST" })
  .middleware([
    consultationAuthMiddleware({ roles: ["patient", "doctor", "admin"], prefer: "staff" }),
  ])
  .validator(
    z.object({
      conversationId: uuidSchema,
    }),
  )
  .handler(async ({ data, context }) => {
    return getTimeline(getSupabaseAdmin(), {
      conversationId: data.conversationId,
      viewerId: context.userId,
      viewerRole: context.role,
    });
  });
