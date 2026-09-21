import { useEffect, useMemo } from "react";
import { Outlet, Link, useLocation, useRouter, createFileRoute } from "@tanstack/react-router";
import {
  LayoutDashboard,
  CalendarCheck,
  Clock,
  Stethoscope,
  Package,
  Video,
  HeartPulse,
  Star,
  Wallet,
  BadgePercent,
  LogOut,
  ChevronRight,
  UserCircle,
  MessageSquare,
  MessageCircle,
  HelpCircle,
  FileText,
  BellRing,
  BarChart3,
  Truck,
} from "lucide-react";
import { staffSupabase } from "@/lib/supabase";
import { useStaffAuth } from "@/hooks/useStaffAuth";
import { useStaffConsultationHistory, useConsultationRealtime } from "@/hooks/useConsultation";
import { AdminNotificationsBell } from "@/components/admin/AdminNotificationsBell";
import { AdminNotificationsRealtime } from "@/components/notifications/AdminNotificationsRealtime";
import { AdminRealtimeSync } from "@/hooks/useRealtimeSync";
import { SiteTracking } from "@/hooks/useSiteTracking";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }],
  }),
  component: AdminLayout,
});

const navItems = [
  { href: "/admin", label: "Dashboard", Icon: LayoutDashboard, exact: true },
  { href: "/admin/appointments", label: "Appointments", Icon: CalendarCheck, exact: false },
  { href: "/admin/availability", label: "Availability", Icon: Clock, exact: false },
  { href: "/admin/services", label: "Services", Icon: Stethoscope, exact: false },
  { href: "/admin/conditions", label: "Diseases", Icon: HeartPulse, exact: false },
  { href: "/admin/reviews", label: "Reviews", Icon: Star, exact: false },
  { href: "/admin/payments", label: "Payments", Icon: Wallet, exact: false },
  { href: "/admin/offers", label: "Offers", Icon: BadgePercent, exact: false },
  { href: "/admin/products", label: "Products", Icon: Package, exact: false },
  { href: "/admin/orders", label: "Orders", Icon: Package, exact: false },
  { href: "/admin/settings", label: "Delivery Charges", Icon: Truck, exact: false },
  { href: "/admin/product-reviews", label: "Product Reviews", Icon: Star, exact: false },
  { href: "/admin/documents", label: "Reports", Icon: FileText, exact: false },
  { href: "/admin/reminders", label: "Reminders", Icon: BellRing, exact: false },
  { href: "/admin/videos", label: "Videos", Icon: Video, exact: false },
  { href: "/admin/support", label: "Support", Icon: MessageSquare, exact: false },
  { href: "/admin/consultations", label: "Consultations", Icon: MessageCircle, exact: false },
  { href: "/admin/faq", label: "FAQ", Icon: HelpCircle, exact: false },
  { href: "/admin/doctor", label: "Doctor Profile", Icon: UserCircle, exact: false },
  { href: "/admin/analytics", label: "Analytics", Icon: BarChart3, exact: false },
];

function AdminLayout() {
  const { user, profile, loading } = useStaffAuth();
  const router = useRouter();
  const location = useLocation();
  // Live chat badges: new messages & read-state changes refresh instantly.
  useConsultationRealtime(staffSupabase);
  const { data: staffHistory } = useStaffConsultationHistory({});
  const staffUnread = useMemo(
    () => (staffHistory ?? []).reduce((sum, c) => sum + (c.unreadCount ?? 0), 0),
    [staffHistory],
  );

  const isAdmin = profile?.role === "admin" || profile?.role === "doctor";
  const isLoginPage = location.pathname === "/admin/login";

  // Real staff identity for the header/sidebar (falls back to the clinic name).
  const staffName = profile?.full_name?.trim() || "Dr. Naseem Ahmed Khan";
  const staffInitials =
    staffName
      .split(/\s+/)
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "NA";

  useEffect(() => {
    if (isLoginPage) {
      if (!loading && isAdmin) {
        // replace: a signed-in staff back-button from /admin/login must not
        // loop back onto this redirect entry.
        router.navigate({ to: "/admin", replace: true });
      }
      return;
    }
    if (!loading && !isAdmin) {
      // replace: after returning from the login page, Back takes the staff
      // member one step further back — not straight back into the guard.
      router.navigate({ to: "/admin/login", replace: true });
    }
  }, [user, profile, loading, router, isAdmin, isLoginPage]);

  if (isLoginPage) {
    return <Outlet />;
  }

  if (loading || !user || !isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  async function handleSignOut() {
    await staffSupabase.auth.signOut();
    // replace: Back after signing out must not return to the stale admin page.
    router.navigate({ to: "/", replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col overflow-x-clip bg-muted/30 lg:flex-row">
      <AdminNotificationsRealtime />
      <AdminRealtimeSync client={staffSupabase} />
      <SiteTracking client={staffSupabase} />
      <header className="flex items-center justify-between gap-2 border-b bg-card px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-xs font-bold">
            {staffInitials}
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-foreground">{staffName}</div>
            <div className="text-xs text-muted-foreground capitalize">{profile.role}</div>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition hover:text-foreground"
          aria-label="Sign out"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </header>

      <nav className="scrollbar-thin flex gap-1 overflow-x-auto border-b bg-card px-3 py-2 lg:hidden">
        {navItems.map(({ href, label, Icon, exact }) => {
          const active = exact ? location.pathname === href : location.pathname.startsWith(href);
          return (
            <Link
              key={href}
              to={href}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-medium transition-colors ${
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
              {href === "/admin/consultations" && staffUnread > 0 && (
                <span
                  className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground"
                  aria-label={`${staffUnread} unread consultations`}
                >
                  {staffUnread > 99 ? "99+" : staffUnread}
                </span>
              )}{" "}
            </Link>
          );
        })}
      </nav>

      <aside className="hidden w-64 flex-col border-r bg-card lg:flex">
        <div className="flex items-center gap-2 border-b px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">
            {staffInitials}
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-foreground">{staffName}</div>
            <div className="text-xs text-muted-foreground capitalize">{profile.role}</div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {navItems.map(({ href, label, Icon, exact }) => {
            const active = exact ? location.pathname === href : location.pathname.startsWith(href);
            return (
              <Link
                key={href}
                to={href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
                {href === "/admin/consultations" && staffUnread > 0 && (
                  <span
                    className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground"
                    aria-label={`${staffUnread} unread consultations`}
                  >
                    {staffUnread > 99 ? "99+" : staffUnread}
                  </span>
                )}
                {active && href !== "/admin/consultations" && (
                  <ChevronRight className="ml-auto h-4 w-4" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="border-t p-3">
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-6xl p-4 md:p-6 lg:p-8">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div className="text-sm font-medium text-muted-foreground">Admin Panel</div>
            <AdminNotificationsBell />
          </div>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
