import { useEffect } from "react";
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
  HelpCircle,
  FileText,
  BellRing,
  BarChart3,
} from "lucide-react";
import { staffSupabase } from "@/lib/supabase";
import { useStaffAuth } from "@/hooks/useStaffAuth";

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
  { href: "/admin/product-reviews", label: "Product Reviews", Icon: Star, exact: false },
  { href: "/admin/documents", label: "Reports", Icon: FileText, exact: false },
  { href: "/admin/reminders", label: "Reminders", Icon: BellRing, exact: false },
  { href: "/admin/videos", label: "Videos", Icon: Video, exact: false },
  { href: "/admin/support", label: "Support", Icon: MessageSquare, exact: false },
  { href: "/admin/faq", label: "FAQ", Icon: HelpCircle, exact: false },
  { href: "/admin/doctor", label: "Doctor Profile", Icon: UserCircle, exact: false },
  { href: "/admin/analytics", label: "Analytics", Icon: BarChart3, exact: false },
];

function AdminLayout() {
  const { user, profile, loading } = useStaffAuth();
  const router = useRouter();
  const location = useLocation();

  const isAdmin = profile?.role === "admin" || profile?.role === "doctor";
  const isLoginPage = location.pathname === "/admin/login";

  useEffect(() => {
    if (isLoginPage) {
      if (!loading && isAdmin) {
        router.navigate({ to: "/admin" });
      }
      return;
    }
    if (!loading && !isAdmin) {
      router.navigate({ to: "/admin/login" });
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
    router.navigate({ to: "/" });
  }

  return (
    <div className="flex min-h-screen flex-col bg-muted/30 lg:flex-row">
      <header className="flex items-center justify-between gap-2 border-b bg-card px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-xs font-bold">
            NA
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-foreground">Dr. Naseem Ahmed Khan</div>
            <div className="text-[11px] text-muted-foreground capitalize">{profile.role}</div>
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
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </Link>
          );
        })}
      </nav>

      <aside className="hidden w-64 flex-col border-r bg-card lg:flex">
        <div className="flex items-center gap-2 border-b px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">
            NA
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-foreground">Dr. Naseem Ahmed Khan</div>
            <div className="text-[11px] text-muted-foreground capitalize">{profile.role}</div>
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
                {active && <ChevronRight className="ml-auto h-4 w-4" />}
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
          <Outlet />
        </div>
      </main>
    </div>
  );
}
