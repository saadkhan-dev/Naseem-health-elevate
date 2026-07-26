import { useEffect } from "react";
import { Outlet, Link, useLocation, useRouter, createFileRoute, redirect } from "@tanstack/react-router";
import {
  LayoutDashboard,
  CalendarCheck,
  Clock,
  Stethoscope,
  Package,
  Video,
  LogOut,
  ChevronRight,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

const navItems = [
  { href: "/admin", label: "Dashboard", Icon: LayoutDashboard, exact: true },
  { href: "/admin/appointments", label: "Appointments", Icon: CalendarCheck, exact: false },
  { href: "/admin/availability", label: "Availability", Icon: Clock, exact: false },
  { href: "/admin/services", label: "Services", Icon: Stethoscope, exact: false },
  { href: "/admin/products", label: "Products", Icon: Package, exact: false },
  { href: "/admin/videos", label: "Videos", Icon: Video, exact: false },
];

function AdminLayout() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const location = useLocation();

  useEffect(() => {
    if (!loading && (!user || (profile?.role !== "doctor" && profile?.role !== "admin"))) {
      router.navigate({ to: "/" });
    }
  }, [user, profile, loading, router]);

  if (loading || !user || (profile?.role !== "doctor" && profile?.role !== "admin")) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-muted/30">
      <aside className="hidden w-64 flex-col border-r bg-card lg:flex">
        <div className="flex items-center gap-2 border-b px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">
            NA
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-foreground">Dr. Naseem Alam</div>
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
            onClick={async () => {
              await supabase.auth.signOut();
              router.navigate({ to: "/" });
            }}
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
