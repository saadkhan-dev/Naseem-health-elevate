import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase, staffSupabase } from "@/lib/supabase";
import { getSupabaseAdmin } from "./server/supabase-admin";
import {
  ensureConversation,
  ATTACHMENT_MAX_BYTES,
  getAttachmentSignedUrl,
  getConversationDetail,
  getPatientHistory,
  getStaffHistory,
  getTimeline,
  getUnreadTotalForUser,
  markConversationReadServer,
  saveSummary,
  setConversationStatus,
  editMessage,
  softDeleteMessage,
  togglePinMessage,
  sendMessage,
  createFileMessage,
  uploadAttachment,
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
 * ROOT-CAUSE FIX (sender misattribution): the browser keeps TWO independent
 * sessions — the public/patient client (`supabase`) and the staff client
 * (`staffSupabase`), in separate storage keys — so one request can carry
 * tokens for TWO different users. `consultationSendMessage` etc. always
 * inserted with `context.userId` = whichever token won, which used to default
 * to the endpoint's `prefer` order. When a staff member's browser ALSO stored
 * a public (patient) session — both apps share one origin — a staff message
 * was inserted with the PATIENT's user id and the patient side rendered it as
 * their own message (green bubble, "mine"). The same class of bug let a
 * patient-only check run against a staff identity.
 *
 * The fix: the caller declares `surface: "public" | "staff"` in the payload
 * (`data.surface`, stripped by the zod validators before the handlers). When
 * declared, the CLIENT middleware sends ONLY that session's token (the other
 * one is dropped and never leaves the browser), and the SERVER middleware
 * considers ONLY that surface's token — an unambiguous single identity per
 * call, with the endpoint's `prefer` order kept purely as the fallback for
 * legacy callers that do not pass `surface`.
 *
 * `roles` declares which identities this endpoint may run as. A token is ONLY
 * accepted when it resolves to a profile whose role is in `roles`, so one
 * session can never impersonate the other even via the fallback path.
 */
interface ConsultAuthContract {
  roles: ConsultationRole[];
  prefer: "public" | "staff";
}

/** Read the caller-declared surface from the raw payload (never validated/stripped yet). */
function surfaceOf(data: unknown): "public" | "staff" | null {
  if (typeof data !== "object" || data === null) return null;
  const candidate = (data as Record<string, unknown>).surface;
  return candidate === "public" || candidate === "staff" ? candidate : null;
}

/** Token bundle the middleware carries between browser and server. */
type TokenBundle = { publicToken: string | null; staffToken: string | null };

/**
 * Declared on every consultation validator the data layer sends `surface`
 * through. Routed by the auth middleware BEFORE validation, then ignored by
 * the handlers (zod keeps it in the parsed output but nothing reads it).
 */
const surfaceField = z.enum(["public", "staff"]).optional();

const consultationAuthMiddleware = ({ roles, prefer }: ConsultAuthContract) =>
  createMiddleware({ type: "function" })
    .client(async ({ next, data }) => {
      const publicToken: string | null =
        typeof window !== "undefined"
          ? ((await supabase.auth.getSession()).data.session?.access_token ?? null)
          : null;
      const staffToken: string | null =
        typeof window !== "undefined"
          ? ((await staffSupabase.auth.getSession()).data.session?.access_token ?? null)
          : null;
      const surface = surfaceOf(data);
      // Always send the SAME `{ publicToken, staffToken }` shape; the declared
      // surface's sibling token is simply dropped (null) so it never leaves
      // the browser and the identity is unambiguous on the server.
      if (surface === "public") {
        return next({
          sendContext: { publicToken, staffToken: null } as TokenBundle,
        });
      }
      if (surface === "staff") {
        return next({
          sendContext: { publicToken: null, staffToken } as TokenBundle,
        });
      }
      return next({ sendContext: { publicToken, staffToken } as TokenBundle });
    })
    .server(async ({ next, context, data }) => {
      const surface = surfaceOf(data);
      const ordered =
        surface === "public"
          ? ([{ token: context?.publicToken ?? null }] as const)
          : surface === "staff"
            ? ([{ token: context?.staffToken ?? null }] as const)
            : prefer === "public"
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
  surface: surfaceField,
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
    return getStaffHistory(getSupabaseAdmin(), filters, context.userId);
  });

// ---------------------------------------------------------------------------
// Mark a conversation read (staff path — patients use the direct RLS update)
// ---------------------------------------------------------------------------

export const consultationMarkConversationRead = createServerFn({ method: "POST" })
  .middleware([
    consultationAuthMiddleware({ roles: ["patient", "doctor", "admin"], prefer: "staff" }),
  ])
  .validator(
    z.object({
      conversationId: uuidSchema,
      surface: surfaceField,
    }),
  )
  .handler(async ({ data, context }): Promise<void> => {
    return markConversationReadServer(getSupabaseAdmin(), {
      conversationId: data.conversationId,
      userId: context.userId,
      role: context.role,
    });
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
      surface: surfaceField,
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
      surface: surfaceField,
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
      surface: surfaceField,
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
      surface: surfaceField,
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
      surface: surfaceField,
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
      surface: surfaceField,
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
      surface: surfaceField,
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
      surface: surfaceField,
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
      surface: surfaceField,
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
  surface: surfaceField,
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

/**
 * Chat attachment upload.
 *
 * The previous flow uploaded the file browser→Supabase Storage directly and
 * died with "TypeError: Failed to fetch" on some devices/networks (cross-origin
 * PUT to the storage host). The bytes now travel with the authenticated
 * server-function request and are stored here with the service-role client —
 * the same proven pattern as the payment receipt uploads. Authorization is the
 * same as the other write endpoints (JWT → profile role via the middleware);
 * `createFileMessage` still re-checks participation and the active status.
 */
export const consultationUploadAttachment = createServerFn({ method: "POST" })
  .middleware([
    consultationAuthMiddleware({ roles: ["patient", "doctor", "admin"], prefer: "public" }),
  ])
  .validator(
    z.object({
      conversationId: uuidSchema,
      fileName: z.string().trim().min(1).max(255),
      mimeType: z.string().trim().max(200).default("application/octet-stream"),
      size: z.number().int().positive().max(ATTACHMENT_MAX_BYTES),
      fileBase64: z.string().min(1).max(30_000_000),
      attachmentType: z.enum(ATTACHMENT_KINDS),
      surface: surfaceField,
    }),
  )
  .handler(async ({ data, context }) => {
    return uploadAttachment(getSupabaseAdmin(), {
      conversationId: data.conversationId,
      userId: context.userId,
      role: context.role,
      fileName: data.fileName,
      mimeType: data.mimeType,
      size: data.size,
      fileBase64: data.fileBase64,
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
      surface: surfaceField,
    }),
  )
  .handler(async ({ data, context }) => {
    return getTimeline(getSupabaseAdmin(), {
      conversationId: data.conversationId,
      viewerId: context.userId,
      viewerRole: context.role,
    });
  });
