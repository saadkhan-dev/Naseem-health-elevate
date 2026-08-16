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
} from "lucide-react";
import { signOut } from "@/lib/auth";
import { useAuth } from "@/hooks/useAuth";
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
  { href: "/patient/documents", label: "My Documents", Icon: FolderOpen, exact: false },
  { href: "/patient/orders", label: "My Orders", Icon: Package, exact: false },
  { href: "/patient/profile", label: "Profile", Icon: User, exact: false },
];

function PatientLayout() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const location = useLocation();
  const [authOpen, setAuthOpen] = useState(false);

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
    <div className="min-h-screen bg-muted/30">
      <Nav />
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 md:flex-row md:px-8">
        <aside className="w-full shrink-0 md:w-60">
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-3 border-b border-border pb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-primary text-sm font-bold text-primary-foreground">
                {(profile?.full_name ?? "P").slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 leading-tight">
                <div className="truncate text-sm font-semibold text-foreground">
                  {profile?.full_name ?? user.email}
                </div>
                <div className="text-[11px] text-muted-foreground capitalize">
                  {profile?.role ?? "patient"}
                </div>
              </div>
            </div>
            <nav className="mt-3 space-y-1">
              {navItems.map(({ href, label, Icon, exact }) => {
                const active = exact
                  ? location.pathname === href
                  : location.pathname.startsWith(href);
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
              <button
                onClick={async () => {
                  await signOut();
                  router.navigate({ to: "/" });
                }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <LogOut className="h-4 w-4" />
                Sign out
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
