import { useEffect, useState } from "react";
import {
  Stethoscope,
  CalendarCheck,
  Star,
  Search,
  UserCircle2,
  LogOut,
  UserRound,
  Menu,
  X,
  ShoppingCart,
  type LucideIcon,
} from "lucide-react";
import { Link, useLocation, useRouter } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { AuthModal } from "@/components/auth/AuthModal";
import { SectionLink } from "@/components/site/SectionLink";
import { PatientNotificationsBell } from "@/components/site/PatientNotificationsBell";
import { useCart } from "@/lib/cart";

interface SectionNavLink {
  id: string;
  hash: string;
  label: string;
  Icon?: LucideIcon;
}

interface RouteNavLink {
  id: string;
  to: "/faq" | "/shop" | "/search";
  label: string;
  Icon?: LucideIcon;
}

const SECTION_LINKS: SectionNavLink[] = [
  { id: "home", hash: "#home", label: "Home" },
  { id: "about", hash: "#about", label: "About" },
  { id: "services", hash: "#services", label: "Services" },
  { id: "products", hash: "#products", label: "Products" },
  { id: "videos", hash: "#videos", label: "Videos" },
  { id: "contact", hash: "#contact", label: "Contact" },
  { id: "reviews", hash: "#reviews", label: "Reviews", Icon: Star },
];

const ROUTE_LINKS: RouteNavLink[] = [
  { id: "faq", to: "/faq", label: "FAQ" },
  { id: "shop", to: "/shop", label: "Shop" },
  { id: "search", to: "/search", label: "Search", Icon: Search },
];

const SECTION_IDS = SECTION_LINKS.map((l) => l.hash.replace(/^#/, ""));

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary/40";

function desktopLinkClass(active: boolean): string {
  return `relative inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full text-[13px] font-medium transition-all duration-200 ${focusRing} ${
    active
      ? "bg-white/10 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)] after:absolute after:inset-x-3 after:-bottom-2.5 after:h-[2px] after:rounded-full after:bg-emerald-400"
      : "text-white/65 hover:bg-white/5 hover:text-white"
  }`;
}

const mobileLinkClass = `block rounded-xl px-4 py-3 text-sm font-medium text-white/75 transition-colors hover:bg-white/5 hover:text-white ${focusRing}`;

/** Which nav item (by id) is "active" on the current non-home route. */
function routeActiveId(pathname: string): string | null {
  if (pathname === "/") return null;
  if (pathname.startsWith("/about")) return "about";
  if (pathname.startsWith("/faq")) return "faq";
  if (pathname.startsWith("/shop") || pathname.startsWith("/product")) return "shop";
  if (pathname.startsWith("/search")) return "search";
  return null;
}

export function Nav() {
  const { user, profile, logout } = useAuth();
  const router = useRouter();
  const location = useLocation();
  const [authOpen, setAuthOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string>("home");
  const cart = useCart();

  const displayName = profile?.full_name ?? user?.email?.split("@")[0] ?? "My Account";

  const closeMenu = () => setMenuOpen(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Highlight the section currently in view (home page only — sections only
  // exist there). On every other page the active item comes from the route.
  useEffect(() => {
    if (location.pathname !== "/") return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveSection(entry.target.id);
        });
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    const sections = SECTION_IDS.map((id) => document.getElementById(id)).filter(
      (el): el is HTMLElement => Boolean(el),
    );
    sections.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [location.pathname]);

  const activeId = location.pathname === "/" ? activeSection : routeActiveId(location.pathname);

  function isActive(id: string): boolean {
    return activeId === id;
  }

  async function handleSignOut() {
    await logout();
    closeMenu();
    router.navigate({ to: "/" });
  }

  return (
    <header className="sticky top-0 z-50 w-full bg-background px-3 pt-3 sm:px-5 sm:pt-4">
      {/* Pill background made explicit below the floating pill so the mobile
          dropdown can never appear on top of it. */}
      <div className="liquid-glass relative z-40 mx-auto flex h-[3.5rem] max-w-[1320px] items-center justify-between gap-2 rounded-full px-2.5 shadow-soft sm:gap-3 sm:px-3">
        {/* Brand */}
        <SectionLink
          hash="#home"
          ariaLabel="Dr. Naseem Ahmed Khan — back to top"
          onNavigate={() => setActiveSection("home")}
          className={`group flex min-w-0 flex-1 items-center gap-2.5 rounded-full transition-transform duration-300 hover:scale-[1.02] active:scale-[0.98] lg:flex-none ${focusRing}`}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-primary text-primary-foreground shadow-card transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-105">
            <Stethoscope className="h-[18px] w-[18px]" />
          </div>
          <div className="hidden min-w-0 leading-tight sm:block">
            <div className="truncate font-display text-[15px] font-semibold text-white">
              Dr. Naseem Ahmed 
            </div>
            <div className="hidden truncate text-[10px] text-white/55 xl:block">
              Homeopath & Physiotherapist
            </div>
          </div>
        </SectionLink>

        {/* Centered desktop navigation */}
        <nav
          aria-label="Main navigation"
          className="hidden min-w-0 flex-1 items-center justify-center gap-1.5 lg:flex xl:gap-2"
        >
          {SECTION_LINKS.map((l) => (
            <SectionLink
              key={l.id}
              hash={l.hash}
              onNavigate={() => setActiveSection(l.id)}
              className={desktopLinkClass(isActive(l.id))}
            >
              {l.Icon && <l.Icon className="h-4 w-4" />}
              <span className={l.Icon ? "hidden xl:inline" : undefined}>{l.label}</span>
            </SectionLink>
          ))}
          {ROUTE_LINKS.map((l) => (
            <Link key={l.id} to={l.to} className={desktopLinkClass(isActive(l.id))}>
              {l.Icon && <l.Icon className="h-4 w-4" />}
              <span className={l.Icon ? "hidden xl:inline" : undefined}>{l.label}</span>
            </Link>
          ))}
        </nav>

        {/* Desktop actions */}
        <div className="hidden shrink-0 items-center justify-end gap-1.5 lg:flex">
          <Link
            to="/cart"
            aria-label="Shopping cart"
            className={`relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/80 transition-colors hover:border-emerald-400/40 hover:text-white ${focusRing}`}
          >
            <ShoppingCart className="h-4 w-4" />
            {cart.count > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-400 px-1 text-[10px] font-bold text-black">
                {cart.count > 99 ? "99+" : cart.count}
              </span>
            )}
          </Link>

          <Link
            to="/appointment-status"
            aria-label="Appointment status"
            className={`inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-emerald-400 px-3 text-[13px] font-semibold text-black shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:bg-emerald-300 hover:shadow-soft active:scale-95 ${focusRing}`}
          >
            <CalendarCheck className="h-4 w-4 shrink-0" />
            <span className="hidden xl:inline">Appointment Status</span>
            <span className="xl:hidden">Status</span>
          </Link>

          {user ? (
            <div className="flex items-center gap-1.5">
              <PatientNotificationsBell />
              <Link
                to="/patient"
                className={`inline-flex h-9 max-w-[150px] items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 text-[13px] font-medium text-white transition-colors hover:border-emerald-400/40 ${focusRing}`}
              >
                <UserCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                <span className="hidden truncate xl:inline">{displayName}</span>
              </Link>
              <button
                onClick={handleSignOut}
                aria-label="Sign out"
                className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 transition-colors hover:border-emerald-400/40 hover:text-white ${focusRing}`}
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAuthOpen(true)}
              className={`inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-white/10 bg-white/5 px-3.5 text-[13px] font-medium text-white transition-colors hover:border-emerald-400/40 ${focusRing}`}
            >
              <UserRound className="h-4 w-4 shrink-0 text-emerald-400" />
              Sign in
            </button>
          )}
        </div>

        {/* Mobile actions */}
        <div className="flex shrink-0 items-center gap-1.5 lg:hidden">
          <Link
            to="/cart"
            aria-label="Shopping cart"
            className={`relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/80 transition-colors hover:border-emerald-400/40 hover:text-white ${focusRing}`}
          >
            <ShoppingCart className="h-4 w-4" />
            {cart.count > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-400 px-1 text-[10px] font-bold text-black">
                {cart.count > 99 ? "99+" : cart.count}
              </span>
            )}
          </Link>
          {user && (
            <>
              <PatientNotificationsBell />
              <Link
                to="/patient"
                aria-label="My account"
                className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-emerald-400 transition-colors hover:border-emerald-400/40 ${focusRing}`}
              >
                <UserCircle2 className="h-4 w-4" />
              </Link>
            </>
          )}
          <button
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white transition-colors hover:border-emerald-400/40 ${focusRing}`}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Click-away backdrop (mobile only) */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={closeMenu}
          aria-hidden="true"
        />
      )}

      {/* Mobile menu */}
      {menuOpen && (
        <div
          id="mobile-nav"
          className="liquid-glass absolute inset-x-3 top-full z-50 mt-2 max-h-[calc(100dvh-5.5rem)] overflow-y-auto rounded-3xl bg-background p-3 shadow-soft lg:hidden"
        >
          <nav aria-label="Mobile navigation" className="grid gap-1">
            {SECTION_LINKS.map((l) => (
              <div key={l.id} onClick={closeMenu}>
                <SectionLink
                  hash={l.hash}
                  onNavigate={() => setActiveSection(l.id)}
                  className={`${mobileLinkClass} ${isActive(l.id) ? "bg-white/10 text-white" : ""}`}
                >
                  {l.Icon && <l.Icon className="mr-2 inline h-4 w-4 text-emerald-400" />}
                  {l.label}
                </SectionLink>
              </div>
            ))}
            {ROUTE_LINKS.map((l) => (
              <Link
                key={l.id}
                to={l.to}
                onClick={closeMenu}
                className={`${mobileLinkClass} ${isActive(l.id) ? "bg-white/10 text-white" : ""}`}
              >
                {l.Icon && <l.Icon className="mr-2 inline h-4 w-4 text-emerald-400" />}
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="mt-3 grid gap-2 border-t border-white/10 pt-3">
            <div onClick={closeMenu}>
              <SectionLink
                hash="#booking"
                className="flex items-center justify-center gap-2 rounded-full bg-emerald-400 px-4 py-3 text-sm font-semibold text-black shadow-card transition-all duration-300 hover:bg-emerald-300 active:scale-[0.98]"
              >
                <CalendarCheck className="h-4 w-4 shrink-0" /> Book Appointment
              </SectionLink>
            </div>
            <Link
              to="/appointment-status"
              onClick={closeMenu}
              className="flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white transition-colors hover:border-emerald-400/40"
            >
              <CalendarCheck className="h-4 w-4 shrink-0 text-emerald-400" /> Appointment Status
            </Link>
            {user ? (
              <>
                <Link
                  to="/patient"
                  onClick={closeMenu}
                  className="flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white transition-colors hover:border-emerald-400/40"
                >
                  <UserCircle2 className="h-4 w-4 shrink-0 text-emerald-400" /> My Account
                </Link>
                <button
                  onClick={handleSignOut}
                  className="flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white transition-colors hover:border-emerald-400/40"
                >
                  <LogOut className="h-4 w-4 shrink-0 text-emerald-400" /> Sign out
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  closeMenu();
                  setAuthOpen(true);
                }}
                className="flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white transition-colors hover:border-emerald-400/40"
              >
                <UserRound className="h-4 w-4 shrink-0 text-emerald-400" /> Sign in / Register
              </button>
            )}
          </div>
        </div>
      )}

      <AuthModal open={authOpen} onOpenChange={setAuthOpen} />
    </header>
  );
}
