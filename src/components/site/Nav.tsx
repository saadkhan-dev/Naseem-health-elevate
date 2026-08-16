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
} from "lucide-react";
import { Link, useRouter } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { AuthModal } from "@/components/auth/AuthModal";
import { SectionLink } from "@/components/site/SectionLink";
import { useCart } from "@/lib/cart";

const links = [
  { href: "#home", label: "Home" },
  { href: "#about", label: "About" },
  { href: "#services", label: "Services" },
  { href: "#products", label: "Products" },
  { href: "#videos", label: "Videos" },
  { href: "#contact", label: "Contact" },
];

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary/40";

const desktopLinkClass =
  "relative inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md px-0.5 text-sm font-medium text-foreground/75 transition-colors duration-200 hover:text-primary " +
  "after:absolute after:inset-x-1 after:-bottom-1 after:h-0.5 after:origin-left after:scale-x-0 after:rounded-full after:bg-primary after:transition-transform after:duration-300 hover:after:scale-x-100 " +
  focusRing;

const mobileLinkClass = `block rounded-lg px-3 py-2.5 text-[15px] font-medium text-foreground/80 transition-colors hover:bg-accent hover:text-primary ${focusRing}`;

export function Nav() {
  const { user, profile, logout } = useAuth();
  const router = useRouter();
  const [authOpen, setAuthOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
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

  async function handleSignOut() {
    await logout();
    closeMenu();
    router.navigate({ to: "/" });
  }

  return (
    <header className="sticky top-0 z-50 glass border-b border-border/60">
      <div className="mx-auto flex h-[var(--navbar-height)] max-w-[1440px] items-center justify-between gap-3 px-4 sm:px-6 xl:px-8">
        {/* Brand — fixed-width on desktop so it never pushes the nav */}
        <SectionLink
          hash="#home"
          ariaLabel="Dr. Naseem Ahmed Khan — back to top"
          className={`group flex min-w-0 flex-1 items-center gap-2.5 rounded-lg sm:gap-3 xl:w-52 xl:flex-none transition-transform duration-300 hover:scale-[1.02] active:scale-[0.98] ${focusRing}`}
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground shadow-card transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-105">
            <Stethoscope className="h-5 w-5" />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="truncate font-display text-sm font-semibold text-foreground sm:text-[15px]">
              Dr. Naseem Ahmed Khan
            </div>
            <div className="truncate text-[10px] text-muted-foreground sm:text-[11px]">
              Homeopath & Physiotherapist
            </div>
          </div>
        </SectionLink>

        {/* Centered desktop navigation */}
        <nav
          aria-label="Main navigation"
          className="hidden min-w-0 flex-1 items-center justify-center gap-x-2.5 xl:flex 2xl:gap-x-4"
        >
          {links.map((l) => (
            <SectionLink key={l.href} hash={l.href} className={desktopLinkClass}>
              {l.label}
            </SectionLink>
          ))}
          <Link to="/faq" className={desktopLinkClass}>
            FAQ
          </Link>
          <Link to="/shop" className={desktopLinkClass}>
            Shop
          </Link>
          <Link to="/search" className={desktopLinkClass}>
            <Search className="h-4 w-4" /> Search
          </Link>
          <SectionLink hash="#reviews" className={desktopLinkClass}>
            <Star className="h-4 w-4" /> Reviews
          </SectionLink>
        </nav>

        {/* Desktop actions — aligned right */}
        <div className="hidden shrink-0 items-center justify-end gap-1 xl:flex">
          <Link
            to="/cart"
            aria-label="Shopping cart"
            className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:border-primary/40 ${focusRing}`}
          >
            <ShoppingCart className="h-4 w-4" />
            {cart.count > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                {cart.count > 99 ? "99+" : cart.count}
              </span>
            )}
          </Link>
          <Link
            to="/appointment-status"
            aria-label="Appointment status"
            className={`inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-gradient-primary px-3.5 text-sm font-semibold text-primary-foreground shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:brightness-[1.05] hover:shadow-soft active:scale-95 ${focusRing}`}
          >
            <CalendarCheck className="h-4 w-4 shrink-0" />
            Appointment Status
          </Link>

          {user ? (
            <div className="flex items-center gap-1.5">
              <Link
                to="/patient"
                className={`inline-flex h-10 max-w-[150px] items-center gap-2 rounded-full border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:border-primary/40 ${focusRing}`}
              >
                <UserCircle2 className="h-4 w-4 shrink-0 text-primary" />
                <span className="hidden truncate 2xl:inline">{displayName}</span>
              </Link>
              <button
                onClick={handleSignOut}
                aria-label="Sign out"
                className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground ${focusRing}`}
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAuthOpen(true)}
              className={`inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:border-primary/40 ${focusRing}`}
            >
              <UserRound className="h-4 w-4 shrink-0 text-primary" />
              Sign in
            </button>
          )}
        </div>

        {/* Mobile actions — hamburger + account */}
        <div className="flex shrink-0 items-center gap-2 xl:hidden">
          <Link
            to="/cart"
            aria-label="Shopping cart"
            className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:border-primary/40 ${focusRing}`}
          >
            <ShoppingCart className="h-4 w-4" />
            {cart.count > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                {cart.count > 99 ? "99+" : cart.count}
              </span>
            )}
          </Link>
          {user && (
            <Link
              to="/patient"
              aria-label="My account"
              className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-primary transition-colors hover:border-primary/40 ${focusRing}`}
            >
              <UserCircle2 className="h-4 w-4" />
            </Link>
          )}
          <button
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:border-primary/40 ${focusRing}`}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Click-away backdrop (mobile only) */}
      {menuOpen && (
        <div
          className="fixed inset-0 top-[var(--navbar-height)] z-40 xl:hidden"
          onClick={closeMenu}
          aria-hidden="true"
        />
      )}

      {/* Mobile menu */}
      {menuOpen && (
        <div
          id="mobile-nav"
          className="absolute inset-x-0 top-full z-50 border-b border-border/60 bg-background/95 backdrop-blur-xl shadow-soft xl:hidden"
        >
          <nav aria-label="Mobile navigation" className="mx-auto max-w-[1440px] px-4 py-4 sm:px-6">
            <ul className="grid gap-1">
              {links.map((l) => (
                <li key={l.href}>
                  <div onClick={closeMenu}>
                    <SectionLink hash={l.href} className={mobileLinkClass}>
                      {l.label}
                    </SectionLink>
                  </div>
                </li>
              ))}
              <li>
                <Link
                  to="/faq"
                  onClick={closeMenu}
                  className={`block rounded-lg px-3 py-2.5 text-[15px] font-medium text-foreground/80 transition-colors hover:bg-accent hover:text-primary ${focusRing}`}
                >
                  FAQ
                </Link>
              </li>
              <li>
                <Link
                  to="/shop"
                  onClick={closeMenu}
                  className={`block rounded-lg px-3 py-2.5 text-[15px] font-medium text-foreground/80 transition-colors hover:bg-accent hover:text-primary ${focusRing}`}
                >
                  Shop
                </Link>
              </li>
              <li>
                <Link
                  to="/search"
                  onClick={closeMenu}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-[15px] font-medium text-foreground/80 transition-colors hover:bg-accent hover:text-primary ${focusRing}`}
                >
                  <Search className="h-4 w-4 text-primary" /> Search
                </Link>
              </li>
              <li>
                <div onClick={closeMenu}>
                  <SectionLink
                    hash="#reviews"
                    className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-[15px] font-medium text-foreground/80 transition-colors hover:bg-accent hover:text-primary ${focusRing}`}
                  >
                    <Star className="h-4 w-4 text-primary" /> Reviews
                  </SectionLink>
                </div>
              </li>
            </ul>

            <div className="mt-3 grid gap-2 border-t border-border pt-3">
              <Link
                to="/appointment-status"
                onClick={closeMenu}
                className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-primary px-4 text-sm font-semibold text-primary-foreground shadow-card transition-all duration-300 hover:brightness-[1.05] active:scale-[0.98] ${focusRing}`}
              >
                <CalendarCheck className="h-4 w-4" /> Appointment Status
              </Link>
              {user ? (
                <>
                  <Link
                    to="/patient"
                    onClick={closeMenu}
                    className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:border-primary/40 ${focusRing}`}
                  >
                    <UserCircle2 className="h-4 w-4 text-primary" /> My Account
                  </Link>
                  <button
                    onClick={handleSignOut}
                    className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:border-primary/40 ${focusRing}`}
                  >
                    <LogOut className="h-4 w-4 text-primary" /> Sign out
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    closeMenu();
                    setAuthOpen(true);
                  }}
                  className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:border-primary/40 ${focusRing}`}
                >
                  <UserRound className="h-4 w-4 text-primary" /> Sign in / Register
                </button>
              )}
            </div>
          </nav>
        </div>
      )}

      <AuthModal open={authOpen} onOpenChange={setAuthOpen} />
    </header>
  );
}
