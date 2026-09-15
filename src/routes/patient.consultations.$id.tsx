import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Deep-link to a single patient conversation. Mirrors the admin side: the
 * parent `/patient/consultations` route renders list + inline chat without an
 * `<Outlet />`, so a deep-link URL only matches this child. Redirect to the
 * list page with the focus param so the conversation opens inline and gets
 * scrolled/highlighted, avoiding a second (dead) full-page layout.
 */
export const Route = createFileRoute("/patient/consultations/$id")({
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/patient/consultations",
      search: { focus: "consultation", id: params.id },
      replace: true,
    } as never);
  },
  component: () => null,
});