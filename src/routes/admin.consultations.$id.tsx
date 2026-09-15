import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Deep-link to a single admin conversation. The parent `/admin/consultations`
 * list route is a two-pane page (list + inline chat) and does not render an
 * `<Outlet />`, so this child matches only the URL — redirect to the list page
 * with the focus param so the inline chat + list are both available and the
 * conversation gets scrolled/highlighted exactly like appointments.
 */
export const Route = createFileRoute("/admin/consultations/$id")({
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/admin/consultations",
      search: { focus: "consultation", id: params.id },
      replace: true,
    } as never);
  },
  component: () => null,
});