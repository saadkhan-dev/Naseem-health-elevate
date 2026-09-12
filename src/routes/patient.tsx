import { useEffect, useState } from "react";
import { Outlet, Link, useRouter, useLocation, createFileRoute } from "@tanstack/react-router";
import {
  LayoutDashboard,
  FolderOpen,
  Package,
  User,
  LogOut,
  ChevronRight,
  CalendarCheck,
  MessageSquare,
} from "lucide-react";
import { signOut } from "@/lib/auth";
import { useAuth } from "@/hooks/useAuth";
import { usePatientConsultationUnread } from "@/hooks/useConsultation";
import { AuthModal } from "@/components/auth/AuthModal";
import { Nav } from "@/components/site/Nav";
import { SiteFooter } from "@/components/site/SiteFooter";

export const Route = createFileRoute("/patient")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }],
  }),
  component: PatientLayout,
});

const navItems = [
  { href: "/patient", label: "Dashboard", Icon: LayoutDashboard, exact: true },
  { href: "/patient/consultations", label: "Consultations", Icon: MessageSquare, exact: false },
  { href: "/patient/documents", label: "My Documents", Icon: FolderOpen, exact: false },
  { href: "/patient/orders", label: "My Orders", Icon: Package, exact: false },
  { href: "/patient/profile", label: "Profile", Icon: User, exact: false },
];

function PatientLayout() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const location = useLocation();
  const [authOpen, setAuthOpen] = useState(false);
  const { data: unreadCount } = usePatientConsultationUnread();

  useEffect(() => {
    if (!loading && !user) setAuthOpen(true);
  }, [loading, user]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <Nav />
        <main className="px-4 py-16">
          <div className="mx-auto max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-soft">
            <CalendarCheck className="mx-auto h-10 w-10 text-primary" />
            <h1 className="mt-4 font-display text-xl font-bold text-foreground">Patient Portal</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Sign in to view your appointments, documents, orders and health history.
            </p>
            <button
              onClick={() => setAuthOpen(true)}
              className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-gradient-primary px-6 text-sm font-semibold text-primary-foreground shadow-card transition hover:brightness-[1.05]"
            >
              Sign in / Register
            </button>
          </div>
        </main>
        <SiteFooter />
        <AuthModal open={authOpen} onOpenChange={setAuthOpen} />
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-x-clip bg-muted/30">
      <Nav />
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 lg:flex-row lg:px-8">
        <aside className="w-full shrink-0 lg:w-60">
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-3 lg:border-b lg:pb-3 lg:mb-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-primary text-sm font-bold text-primary-foreground">
                {(profile?.full_name ?? "P").slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 leading-tight">
                <div className="truncate text-sm font-semibold text-foreground">
                  {profile?.full_name ?? user.email}
                </div>
                <div className="text-xs text-muted-foreground capitalize">
                  {profile?.role ?? "patient"}
                </div>
              </div>
            </div>
            <nav className="-mx-1 flex gap-1 overflow-x-auto p-1 lg:mx-0 lg:flex-col lg:space-y-1 lg:p-0 lg:pt-3">
              {navItems.map(({ href, label, Icon, exact }) => {
                const active = exact
                  ? location.pathname === href
                  : location.pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    to={href}
                    className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors ${
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    } lg:w-full lg:py-2.5`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="whitespace-nowrap">{label}</span>
                    {href === "/patient/consultations" && !!unreadCount && unreadCount > 0 && (
                      <span
                        className="ml-auto inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground lg:ml-0"
                        aria-label={`${unreadCount} unread consultations`}
                      >
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    )}
                    {active && <ChevronRight className="ml-auto hidden h-4 w-4 lg:block" />}
                  </Link>
                );
              })}
              <button
                onClick={async () => {
                  await signOut();
                  router.navigate({ to: "/" });
                }}
                className="flex shrink-0 items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground lg:w-full lg:py-2.5"
              >
                <LogOut className="h-4 w-4 shrink-0" />
                <span className="whitespace-nowrap">Sign out</span>
              </button>
            </nav>
          </div>
        </aside>
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
      <SiteFooter />
    </div>
  );
}
